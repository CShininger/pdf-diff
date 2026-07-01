import { normalize } from './normalize'
import type { CharBBox, LineUnit, TextBlock } from './types'

function computeRawNonWsPositions(text: string): number[] {
  const positions: number[] = []
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    if (c !== 32 && c !== 9 && c !== 10 && c !== 13 && c !== 11 && c !== 12) {
      positions.push(i)
    }
  }
  return positions
}

function sameLine(prev: TextBlock, curr: TextBlock): boolean {
  if (curr.page !== prev.page) return false
  const prevCy = (prev.bbox[1] + prev.bbox[3]) * 0.5
  const currCy = (curr.bbox[1] + curr.bbox[3]) * 0.5
  const lineHeight = Math.max(prev.bbox[3] - prev.bbox[1], prev.fontSize)
  return Math.abs(prevCy - currCy) < lineHeight * 0.5
}

function buildLine(row: TextBlock[], prefix: string, index: number, ignoreWhitespace: boolean): LineUnit {
  const textParts: string[] = new Array(row.length)
  const charBboxes: CharBBox[] = []
  let offset = 0

  for (let r = 0; r < row.length; r++) {
    const block = row[r]
    textParts[r] = block.text
    for (const cb of block.charBboxes) {
      charBboxes.push({
        start: offset + cb.start,
        end: offset + cb.end,
        bbox: cb.bbox,
      })
    }
    offset += block.text.length
  }

  const text = textParts.join('')
  let x0 = row[0].bbox[0]
  let y0 = row[0].bbox[1]
  let x1 = row[0].bbox[2]
  let y1 = row[0].bbox[3]

  for (let r = 1; r < row.length; r++) {
    const b = row[r].bbox
    if (b[0] < x0) x0 = b[0]
    if (b[1] < y0) y0 = b[1]
    if (b[2] > x1) x1 = b[2]
    if (b[3] > y1) y1 = b[3]
  }

  return {
    id: `${prefix}_l${index}`,
    page: row[0].page,
    text,
    normalized: normalize(text, ignoreWhitespace),
    bbox: [x0, y0, x1, y1],
    charBboxes,
    rawNonWsPositions: computeRawNonWsPositions(text),
  }
}

export function blocksToLines(
  blocks: TextBlock[],
  prefix: string,
  ignoreWhitespace: boolean,
): LineUnit[] {
  if (!blocks.length) return []

  const sorted = blocks.slice().sort(
    (a, b) => a.page - b.page || a.bbox[1] - b.bbox[1] || a.bbox[0] - b.bbox[0],
  )

  const lines: LineUnit[] = []
  let currentRow: TextBlock[] = [sorted[0]]

  for (let i = 1; i < sorted.length; i++) {
    const prev = currentRow[currentRow.length - 1]
    const curr = sorted[i]
    if (sameLine(prev, curr)) {
      currentRow.push(curr)
    } else {
      lines.push(buildLine(currentRow, prefix, lines.length, ignoreWhitespace))
      currentRow = [curr]
    }
  }

  lines.push(buildLine(currentRow, prefix, lines.length, ignoreWhitespace))
  return lines.filter((line) => line.normalized.length > 0)
}
