import { excludeNonContent, isPageNumber } from './contentFilter'
import { getOpcodes, mergeAdjacent, type Opcode } from './sequenceMatcher'
import type { LineRange, LineUnit, RawChange } from './types'

interface CharRef {
  lineIndex: number
  rawPos: number
}

interface TextStream {
  text: string
  charMap: CharRef[]
  lines: LineUnit[]
}

interface PageSlice {
  page: number
  snippet: string
  bboxes: number[][]
  refLineIndex: number
}

// const ANCHORED_DIFF_THRESHOLD = 24_000

function textStreamFromLines(lines: LineUnit[]): TextStream {
  const textParts: string[] = []
  const charMap: CharRef[] = []

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]
    const normalized = line.normalized
    if (!normalized) continue

    if (textParts.length > 0 && textParts[textParts.length - 1].endsWith('-')) {
      const last = textParts[textParts.length - 1]
      textParts[textParts.length - 1] = last.slice(0, -1)
      charMap.pop()
    }

    const rawPositions = line.rawNonWsPositions
    const count = Math.min(rawPositions.length, normalized.length)
    for (let k = 0; k < count; k++) {
      charMap.push({ lineIndex, rawPos: rawPositions[k] })
    }
    if (count > 0) {
      textParts.push(normalized)
    }
  }

  return { text: textParts.join(''), charMap, lines }
}

function buildLineRanges(stream: TextStream): LineRange[] {
  const ranges: LineRange[] = []
  if (stream.charMap.length === 0) return ranges

  let start = 0
  let currentLine = stream.charMap[0].lineIndex

  for (let i = 1; i <= stream.charMap.length; i++) {
    const nextLine = i < stream.charMap.length ? stream.charMap[i].lineIndex : -1
    if (nextLine !== currentLine) {
      ranges.push({ lineIndex: currentLine, start, end: i })
      start = i
      currentLine = nextLine
    }
  }

  return ranges
}

/** 大文档按相同行锚点分段 diff，避免整篇字符级 Myers */
function getAnchoredOpcodes(tplStream: TextStream, conStream: TextStream): Opcode[] {
  const tplRanges = buildLineRanges(tplStream)
  const conRanges = buildLineRanges(conStream)

  const conByNorm = new Map<string, number[]>()
  for (let j = 0; j < conRanges.length; j++) {
    const norm = conStream.lines[conRanges[j].lineIndex].normalized
    let list = conByNorm.get(norm)
    if (!list) {
      list = []
      conByNorm.set(norm, list)
    }
    list.push(j)
  }

  const anchors: { tplIdx: number; conIdx: number }[] = []
  const conCursor = new Map<string, number>()
  let lastConIdx = -1

  for (let i = 0; i < tplRanges.length; i++) {
    const norm = tplStream.lines[tplRanges[i].lineIndex].normalized
    const list = conByNorm.get(norm)
    if (!list) continue

    let cursor = conCursor.get(norm) ?? 0
    while (cursor < list.length && list[cursor] <= lastConIdx) cursor++

    if (cursor < list.length) {
      const conIdx = list[cursor]
      anchors.push({ tplIdx: i, conIdx })
      conCursor.set(norm, cursor + 1)
      lastConIdx = conIdx
    }
  }

  const opcodes: Opcode[] = []
  let tplStart = 0
  let conStart = 0

  for (const { tplIdx, conIdx } of anchors) {
    const tplAnchorStart = tplRanges[tplIdx].start
    const conAnchorStart = conRanges[conIdx].start

    if (tplStart < tplAnchorStart || conStart < conAnchorStart) {
      opcodes.push(
        ...offsetOpcodes(
          getOpcodes(
            tplStream.text.slice(tplStart, tplAnchorStart),
            conStream.text.slice(conStart, conAnchorStart),
          ),
          tplStart,
          conStart,
        ),
      )
    }

    tplStart = tplRanges[tplIdx].end
    conStart = conRanges[conIdx].end
  }

  if (tplStart < tplStream.text.length || conStart < conStream.text.length) {
    opcodes.push(
      ...offsetOpcodes(
        getOpcodes(tplStream.text.slice(tplStart), conStream.text.slice(conStart)),
        tplStart,
        conStart,
      ),
    )
  }

  return opcodes
}

function offsetOpcodes(opcodes: Opcode[], tplOff: number, conOff: number): Opcode[] {
  if (opcodes.length === 0) return opcodes
  return opcodes.map((op) => ({
    ...op,
    i1: op.i1 + tplOff,
    i2: op.i2 + tplOff,
    j1: op.j1 + conOff,
    j2: op.j2 + conOff,
  }))
}

function mergeSortedPositions(positions: number[]): [number, number][] {
  if (positions.length === 0) return []

  const sorted = positions.slice().sort((a, b) => a - b)
  const ranges: [number, number][] = []
  let rangeStart = sorted[0]
  let rangeEnd = rangeStart + 1

  for (let i = 1; i < sorted.length; i++) {
    const pos = sorted[i]
    if (pos <= rangeEnd) {
      if (pos + 1 > rangeEnd) rangeEnd = pos + 1
    } else {
      ranges.push([rangeStart, rangeEnd])
      rangeStart = pos
      rangeEnd = pos + 1
    }
  }
  ranges.push([rangeStart, rangeEnd])
  return ranges
}

function bboxesForRawPositions(line: LineUnit, rawPositions: number[]): number[][] {
  if (rawPositions.length === 0 || line.charBboxes.length === 0) return []

  const bboxes: number[][] = []
  const charBboxes = line.charBboxes

  for (const [rangeStart, rangeEnd] of mergeSortedPositions(rawPositions)) {
    for (const charBBox of charBboxes) {
      if (charBBox.end <= rangeStart) continue
      if (charBBox.start >= rangeEnd) break
      bboxes.push(charBBox.bbox)
    }
  }
  return mergeAdjacent(bboxes)
}

class PageSliceBuilder {
  private snippetParts: string[] = []
  private positionsByLine = new Map<number, number[]>()
  private refLineIndex = -1
  private page: number
  private lines: LineUnit[]

  constructor(page: number, lines: LineUnit[]) {
    this.page = page
    this.lines = lines
  }

  append(ref: CharRef, ch: string) {
    if (this.refLineIndex < 0) this.refLineIndex = ref.lineIndex
    this.snippetParts.push(ch)
    const list = this.positionsByLine.get(ref.lineIndex)
    if (list) {
      list.push(ref.rawPos)
    } else {
      this.positionsByLine.set(ref.lineIndex, [ref.rawPos])
    }
  }

  build(): PageSlice {
    const bboxes: number[][] = []
    for (const [lineIndex, positions] of this.positionsByLine) {
      bboxes.push(...bboxesForRawPositions(this.lines[lineIndex], positions))
    }
    return {
      page: this.page,
      snippet: this.snippetParts.join(''),
      bboxes: mergeAdjacent(bboxes),
      refLineIndex: Math.max(this.refLineIndex, 0),
    }
  }
}

function sliceByPage(stream: TextStream, start: number, end: number): PageSlice[] {
  const builders = new Map<number, PageSliceBuilder>()
  const text = stream.text

  for (let tokenIndex = start; tokenIndex < end; tokenIndex++) {
    const ref = stream.charMap[tokenIndex]
    const page = stream.lines[ref.lineIndex].page
    let builder = builders.get(page)
    if (!builder) {
      builder = new PageSliceBuilder(page, stream.lines)
      builders.set(page, builder)
    }
    builder.append(ref, text[tokenIndex])
  }

  const slices: PageSlice[] = []
  for (const builder of builders.values()) {
    const slice = builder.build()
    if (slice.snippet) slices.push(slice)
  }
  return slices
}

function toSnippetLine(lines: LineUnit[], slice: PageSlice): LineUnit {
  const ref = lines[slice.refLineIndex]
  return {
    id: ref.id,
    page: slice.page,
    text: slice.snippet,
    normalized: slice.snippet,
    bbox: ref.bbox,
    charBboxes: [],
    rawNonWsPositions: [],
  }
}

function isLayoutOnly(snippet: string, otherFullText: string): boolean {
  if (!snippet || isPageNumber(snippet)) return true
  return snippet.length <= 64 && otherFullText.includes(snippet)
}

function shouldReport(snippet: string, bboxes: number[][], otherFullText: string): boolean {
  return !!snippet && bboxes.length > 0 && !isLayoutOnly(snippet, otherFullText)
}

function anchorMarkerFromBbox(bbox: number[], atEnd: boolean): number[] {
  const [x0, y0, x1, y1] = bbox
  const height = Math.max(y1 - y0, 4)
  if (atEnd) {
    return [Math.max(x1 - 1, x0), y0, x1 + 1, y0 + height]
  }
  return [x0 - 1, y0, x0 + 1, y0 + height]
}

/** 模版文本流中的插入锚点：标记新增内容在模版侧的语义位置 */
function getAnchorSlice(stream: TextStream, anchorIndex: number): PageSlice | null {
  const { charMap, lines } = stream
  if (charMap.length === 0) return null

  const len = charMap.length
  let ref: CharRef
  let atEnd: boolean

  if (anchorIndex <= 0) {
    ref = charMap[0]
    atEnd = false
  } else if (anchorIndex >= len) {
    ref = charMap[len - 1]
    atEnd = true
  } else {
    ref = charMap[anchorIndex - 1]
    atEnd = true
  }

  const line = lines[ref.lineIndex]
  const bboxes = bboxesForRawPositions(line, [ref.rawPos])
  const markerBbox =
    bboxes.length > 0
      ? anchorMarkerFromBbox(bboxes[bboxes.length - 1], atEnd)
      : atEnd
        ? anchorMarkerFromBbox(line.bbox, true)
        : anchorMarkerFromBbox(line.bbox, false)

  return {
    page: line.page,
    snippet: '',
    bboxes: [markerBbox],
    refLineIndex: ref.lineIndex,
  }
}

function emitSideChanges(
  changes: RawChange[],
  stream: TextStream,
  other: TextStream,
  start: number,
  end: number,
  insert: boolean,
) {
  for (const slice of sliceByPage(stream, start, end)) {
    if (!shouldReport(slice.snippet, slice.bboxes, other.text)) continue
    const snippet = toSnippetLine(stream.lines, slice)
    changes.push(
      insert
        ? {
            type: 'insert',
            level: 'char',
            templateLines: [],
            contractLines: [snippet],
            templateBboxes: null,
            contractBboxes: slice.bboxes,
          }
        : {
            type: 'delete',
            level: 'char',
            templateLines: [snippet],
            contractLines: [],
            templateBboxes: slice.bboxes,
            contractBboxes: null,
          },
    )
  }
}

function emitInsertChanges(
  changes: RawChange[],
  tplStream: TextStream,
  conStream: TextStream,
  tplAnchor: number,
  conStart: number,
  conEnd: number,
) {
  const anchor = getAnchorSlice(tplStream, tplAnchor)
  for (const slice of sliceByPage(conStream, conStart, conEnd)) {
    if (!shouldReport(slice.snippet, slice.bboxes, tplStream.text)) continue
    changes.push({
      type: 'insert',
      level: 'char',
      templateLines: anchor ? [toSnippetLine(tplStream.lines, anchor)] : [],
      contractLines: [toSnippetLine(conStream.lines, slice)],
      templateBboxes: anchor?.bboxes ?? null,
      contractBboxes: slice.bboxes,
    })
  }
}

function emitReplaceChanges(
  changes: RawChange[],
  tplStream: TextStream,
  conStream: TextStream,
  tplStart: number,
  tplEnd: number,
  conStart: number,
  conEnd: number,
) {
  const tplSnippet = tplStream.text.slice(tplStart, tplEnd)
  const conSnippet = conStream.text.slice(conStart, conEnd)
  if (!tplSnippet && !conSnippet) return
  if (isLayoutOnly(tplSnippet, conStream.text) && isLayoutOnly(conSnippet, tplStream.text)) return

  const tplSlices = sliceByPage(tplStream, tplStart, tplEnd)
  const conSlices = sliceByPage(conStream, conStart, conEnd)

  if (tplSlices.length === 1 && conSlices.length === 1) {
    const tplSlice = tplSlices[0]
    const conSlice = conSlices[0]
    if (
      shouldReport(tplSlice.snippet, tplSlice.bboxes, conStream.text) &&
      shouldReport(conSlice.snippet, conSlice.bboxes, tplStream.text)
    ) {
      changes.push({
        type: 'replace',
        level: 'char',
        templateLines: [toSnippetLine(tplStream.lines, tplSlice)],
        contractLines: [toSnippetLine(conStream.lines, conSlice)],
        templateBboxes: tplSlice.bboxes,
        contractBboxes: conSlice.bboxes,
      })
      return
    }
  }

  emitSideChanges(changes, tplStream, conStream, tplStart, tplEnd, false)
  emitInsertChanges(changes, tplStream, conStream, tplEnd, conStart, conEnd)
}

function resolveOpcodes(tplStream: TextStream, conStream: TextStream): Opcode[] {
  // const totalLen = tplStream.text.length + conStream.text.length
  // if (totalLen <= ANCHORED_DIFF_THRESHOLD) {
  //   return getOpcodes(tplStream.text, conStream.text)
  // }
  return getAnchoredOpcodes(tplStream, conStream)
}

export function diffLines(templateLines: LineUnit[], contractLines: LineUnit[]): RawChange[] {
  const tplStream = textStreamFromLines(excludeNonContent(templateLines))
  const conStream = textStreamFromLines(excludeNonContent(contractLines))

  if (!tplStream.text && !conStream.text) return []

  const changes: RawChange[] = []
  for (const opcode of resolveOpcodes(tplStream, conStream)) {
    switch (opcode.tag) {
      case 'delete':
        emitSideChanges(changes, tplStream, conStream, opcode.i1, opcode.i2, false)
        break
      case 'insert':
        emitInsertChanges(changes, tplStream, conStream, opcode.i1, opcode.j1, opcode.j2)
        break
      case 'replace':
        emitReplaceChanges(
          changes,
          tplStream,
          conStream,
          opcode.i1,
          opcode.i2,
          opcode.j1,
          opcode.j2,
        )
        break
    }
  }

  return changes
}
