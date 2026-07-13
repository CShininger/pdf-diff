import { excludeNonContent, isPageNumber } from './contentFilter'
import { getOpcodes, mergeAdjacent, type Opcode } from './sequenceMatcher'
import type { LineRange, LineUnit, RawChange } from './types'

/** 拼接文本流中单个字符 → 原始行下标 + 行内 raw 下标的映射 */
interface CharRef {
  lineIndex: number
  rawPos: number
}

/** 多行 normalized 文本拼接后的连续字符流，charMap 用于 diff 结果反查 bbox */
interface TextStream {
  text: string
  charMap: CharRef[]
  lines: LineUnit[]
}

/** 某页上一段 diff 片段：文本摘要 + 对应高亮 bbox + 参考行 */
interface PageSlice {
  page: number
  snippet: string
  bboxes: number[][]
  refLineIndex: number
}

// const ANCHORED_DIFF_THRESHOLD = 24_000

/** 将多行 LineUnit 拼成连续字符流；行尾 `-` 与下一行首连字（PDF 换行断词） */
function textStreamFromLines(lines: LineUnit[]): TextStream {
  const textParts: string[] = []
  const charMap: CharRef[] = []

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]
    const normalized = line.normalized
    if (!normalized) continue

    // 断掉的单词；
    if (textParts.length > 0 && textParts[textParts.length - 1].endsWith('-')) {
      // PDF 行尾连字符：去掉 `-` 并与下一行连写，避免 diff 误报断词
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

/** 计算每行在拼接文本流中的 [start, end) 字符区间 */
function buildLineRanges(stream: TextStream): LineRange[] {
  console.log({ stream })
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
  // 每行在拼接文本流中的 [start, end) 字符区间
  const tplRanges = buildLineRanges(tplStream) // 模版侧逐行字符区间
  const conRanges = buildLineRanges(conStream) // 合同侧逐行字符区间
  console.log({ tplRanges, conRanges })
  // 合同侧按 normalized 文本建索引，便于 O(1) 查找可匹配的锚点行
  const conByNorm = new Map<string, number[]>() // key: normalized 行文本，value: 该文本在 conRanges 中的下标列表
  for (let j = 0; j < conRanges.length; j++) {
    const norm = conStream.lines[conRanges[j].lineIndex].normalized // 当前合同行的 normalized 文本
    if (!conByNorm.has(norm)) {
      conByNorm.set(norm, [])
    }
    conByNorm.get(norm)!.push(j) // 记录该 normalized 文本出现的行位置
  }

  // 按模版行顺序扫描，在合同中找 normalized 相同且位置单调递增的锚点对
  const anchors: { tplIdx: number; conIdx: number }[] = [] // 已匹配锚点对：模版行下标 -> 合同行下标
  const conCursor = new Map<string, number>() // 每个 normalized 文本在 conByNorm 列表中的下一个可用游标
  let lastConIdx = -1 // 上一个已选中的合同锚点下标，用于保证整体顺序递增

  for (let i = 0; i < tplRanges.length; i++) {
    const norm = tplStream.lines[tplRanges[i].lineIndex].normalized // 当前模版行 normalized 文本
    const list = conByNorm.get(norm) // 合同侧该文本的候选行下标列表
    if (!list) continue

    let cursor = conCursor.get(norm) ?? 0 // 该文本本次开始尝试匹配的位置
    while (cursor < list.length && list[cursor] <= lastConIdx) cursor++

    if (cursor < list.length) {
      const conIdx = list[cursor] // 选中的合同锚点下标
      anchors.push({ tplIdx: i, conIdx })
      conCursor.set(norm, cursor + 1)
      lastConIdx = conIdx
    }
  }

  console.log({ anchors, conByNorm, conCursor })

  // 锚点行本身视为相同，只对锚点之间的缝隙做字符级 diff
  const opcodes: Opcode[] = [] // 聚合后的全局差异操作码
  let tplStart = 0 // 当前尚未处理的模版字符起点
  let conStart = 0 // 当前尚未处理的合同字符起点

  for (const { tplIdx, conIdx } of anchors) {
    const tplAnchorStart = tplRanges[tplIdx].start // 本锚点在模版侧的起始字符下标
    const conAnchorStart = conRanges[conIdx].start // 本锚点在合同侧的起始字符下标

    // 当前游标到本锚点起点之间，至少一边还有未对齐文本
    if (tplStart < tplAnchorStart || conStart < conAnchorStart) {
      const opcodesTemp = getOpcodes(
        tplStream.text.slice(tplStart, tplAnchorStart),
        conStream.text.slice(conStart, conAnchorStart),
      )
      if (
        tplStream.text.slice(tplStart, tplAnchorStart) ===
        '6.工程承包范围:详见施工图和工程量清单、招标文件、发包人明确指令要求完成的其他任务.'
      ) {
        console.log({
          模板文本片段: tplStream.text.slice(tplStart, tplAnchorStart),
          合同文本片段: conStream.text.slice(conStart, conAnchorStart),
        })
        console.log({
          opcodesTemp,
          tplStart,
          conStart,
          ceshi: offsetOpcodes(opcodesTemp, tplStart, conStart),
        })
      }

      // 先对“锚点间片段”做局部字符级 diff，再把局部下标偏移回全局文本坐标，最后合并进总 opcodes
      opcodes.push(...offsetOpcodes(opcodesTemp, tplStart, conStart))
    }

    // 跳过锚点行，游标移到该行末尾
    tplStart = tplRanges[tplIdx].end
    conStart = conRanges[conIdx].end
  }

  // 最后一个锚点之后若仍有剩余文本，对尾部再做一次 diff
  if (tplStart < tplStream.text.length || conStart < conStream.text.length) {
    // 处理尾部残留片段：生成局部 opcodes，并用当前游标作为 offset 转回全局坐标

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

/** 将局部 diff 的 opcode 坐标平移到全局文本流坐标系 */
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

/** 将相邻/重叠的字符下标合并为 [start, end) 区间，便于批量查 bbox */
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

/** 根据行内 raw 字符下标，收集对应 CharBBox 并合并相邻区域 */
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

/** 按页累积 diff 片段的文本与字符位置，最终输出 PageSlice */
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
    // 记录首个字符所在行，作为 snippet 的参考行 id/page
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

/** 将文本流 [start, end) 区间按页拆分为多个 PageSlice */
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
  if (start === 234) {
    // console.log('ceshi stream', stream, slices)
  }
  // console.log('ceshi stream', stream, slices)
  return slices
}

/** 用 PageSlice 构造用于 UI 展示的精简 LineUnit（仅保留 snippet 与参考 bbox） */
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

/** 判断差异是否仅为排版/页码等布局噪声（短片段且对方全文已包含） */
function isLayoutOnly(snippet: string, otherFullText: string): boolean {
  if (!snippet || isPageNumber(snippet)) return true
  return snippet.length <= 64 && otherFullText.includes(snippet)
}

/** 是否应上报为有效变更：有文本、bbox 可定位、且非布局噪声 */
// @ts-expect-error ignore otherFullText
function shouldReport(snippet: string, bboxes: number[][], otherFullText: string): boolean {
  return !!snippet && bboxes.length > 0
  // && !isLayoutOnly(snippet, otherFullText)
}

/** 在插入锚点处生成窄条 marker bbox，供模版侧标注新增位置 */
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

/** 单侧 delete/insert：按页切片后生成 RawChange */
function emitSideChanges(
  changes: RawChange[],
  stream: TextStream,
  other: TextStream,
  start: number,
  end: number,
  insert: boolean,
) {
  // console.log('delete/insert', sliceByPage(stream, start, end))
  for (const slice of sliceByPage(stream, start, end)) {
    if (!shouldReport(slice.snippet, slice.bboxes, other.text)) {
      console.log('不报告', slice.snippet)
      continue
    }
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

/** 合同侧 insert：在模版 anchorIndex 处标记插入锚点，关联 contract 片段 */
function emitInsertChanges(
  changes: RawChange[],
  tplStream: TextStream,
  conStream: TextStream,
  tplAnchor: number,
  conStart: number,
  conEnd: number,
) {
  const anchor = getAnchorSlice(tplStream, tplAnchor)
  // console.log('insert', sliceByPage(conStream, conStart, conEnd))
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

/** replace：同页可合并为一条；否则拆成 delete + insert */
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
  // if (isLayoutOnly(tplSnippet, conStream.text) && isLayoutOnly(conSnippet, tplStream.text)) return

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

/** 选择 diff 策略：大文档用锚点分段，小文档可整篇字符 diff（当前固定锚点模式） */
function resolveOpcodes(tplStream: TextStream, conStream: TextStream): Opcode[] {
  // const totalLen = tplStream.text.length + conStream.text.length
  // if (totalLen <= ANCHORED_DIFF_THRESHOLD) {
  //   return getOpcodes(tplStream.text, conStream.text)
  // }
  return getAnchoredOpcodes(tplStream, conStream)
}

/** 行级输入 → 字符流 diff → 带 bbox 的 RawChange 列表 */
export function diffLines(templateLines: LineUnit[], contractLines: LineUnit[]): RawChange[] {
  // 兜底操作；格式化下lines中的某些问题
  const tplStream = textStreamFromLines(excludeNonContent(templateLines))
  const conStream = textStreamFromLines(excludeNonContent(contractLines))
  console.log({ tplStream, conStream })
  if (!tplStream.text && !conStream.text) return []

  const changes: RawChange[] = []
  const opcodes = resolveOpcodes(tplStream, conStream)
  // console.log('ceshi', fastDiff(tplStream.text, conStream.text))
  console.log({ opcodes })
  for (const opcode of opcodes) {
    switch (opcode.tag) {
      case 'delete':
        // console.log('delete', tplStream.text.slice(opcode.i1, opcode.i2))
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
