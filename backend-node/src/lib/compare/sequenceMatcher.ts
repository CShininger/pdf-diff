import fastDiff from 'fast-diff'

export interface Opcode {
  tag: 'delete' | 'insert' | 'replace' | 'equal'
  i1: number
  i2: number
  j1: number
  j2: number
}

function trimEqualAffixes(a: string, b: string): { aMid: string; bMid: string; offset: number } {
  const minLen = Math.min(a.length, b.length)
  let start = 0
  while (start < minLen && a.charCodeAt(start) === b.charCodeAt(start)) {
    start++
  }

  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a.charCodeAt(endA - 1) === b.charCodeAt(endB - 1)) {
    endA--
    endB--
  }

  return { aMid: a.slice(start, endA), bMid: b.slice(start, endB), offset: start }
}

function opcodesFromFastDiff(a: string, b: string, offset: number): Opcode[] {
  if (!a && !b) return []
  if (!a) return [{ tag: 'insert', i1: offset, i2: offset, j1: offset, j2: offset + b.length }]
  if (!b) return [{ tag: 'delete', i1: offset, i2: offset + a.length, j1: offset, j2: offset }]

  const parts = fastDiff(a, b)
  const opcodes: Opcode[] = []
  let i = offset
  let j = offset

  for (const [op, text] of parts) {
    const len = text.length
    if (len === 0) continue
    if (op === 0) {
      i += len
      j += len
    } else if (op === -1) {
      opcodes.push({ tag: 'delete', i1: i, i2: i + len, j1: j, j2: j })
      i += len
    } else {
      opcodes.push({ tag: 'insert', i1: i, i2: i, j1: j, j2: j + len })
      j += len
    }
  }

  return opcodes
}

export function getOpcodes(a: string, b: string): Opcode[] {
  if (!a && !b) return []
  const { aMid, bMid, offset } = trimEqualAffixes(a, b)
  return opcodesFromFastDiff(aMid, bMid, offset)
}

export function mergeAdjacent(bboxes: number[][]): number[][] {
  if (bboxes.length <= 1) return bboxes.length === 1 ? [bboxes[0].slice()] : []

  const sorted = bboxes.slice().sort((x, y) => x[1] - y[1] || x[0] - y[0])
  const merged: number[][] = [sorted[0].slice()]

  for (let idx = 1; idx < sorted.length; idx++) {
    const box = sorted[idx]
    const last = merged[merged.length - 1]
    const lastHeight = Math.max(last[3] - last[1], box[3] - box[1])
    const sameRow = Math.abs(box[1] - last[1]) < Math.max(lastHeight, 1) * 0.5
    const touching = box[0] <= last[2] + 2

    if (sameRow && touching) {
      last[1] = Math.min(last[1], box[1])
      last[2] = Math.max(last[2], box[2])
      last[3] = Math.max(last[3], box[3])
    } else {
      merged.push(box.slice())
    }
  }

  return merged
}
