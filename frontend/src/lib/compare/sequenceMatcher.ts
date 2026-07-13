import fastDiff from 'fast-diff'

export interface Opcode {
  tag: 'delete' | 'insert' | 'replace' | 'equal'
  /** 模版侧 [i1, i2) 字符区间 */
  i1: number
  i2: number
  /** 合同侧 [j1, j2) 字符区间 */
  j1: number
  j2: number
}

/** 去掉首尾相同字符，缩小 diff 范围 */
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

/** 相邻 delete+insert（同一对齐缝隙）合并为 replace，两侧都标修改色 */
function mergeAdjacentReplace(opcodes: Opcode[]): Opcode[] {
  if (opcodes.length < 2) return opcodes

  const merged: Opcode[] = []
  for (let k = 0; k < opcodes.length; k++) {
    const cur = opcodes[k]
    const next = opcodes[k + 1]
    const canMerge =
      next &&
      cur.i2 === next.i1 &&
      cur.j2 === next.j1 &&
      ((cur.tag === 'delete' && next.tag === 'insert') ||
        (cur.tag === 'insert' && next.tag === 'delete'))

    if (canMerge) {
      const del = cur.tag === 'delete' ? cur : next
      const ins = cur.tag === 'insert' ? cur : next
      merged.push({
        tag: 'replace',
        i1: del.i1,
        i2: del.i2,
        j1: ins.j1,
        j2: ins.j2,
      })
      k++
      continue
    }

    merged.push(cur)
  }
  return merged
}

/** 将 fast-diff 输出转为 delete/insert/replace 操作码，坐标带全局 offset */
function opcodesFromFastDiff(a: string, b: string, offset: number): Opcode[] {
  if (!a && !b) return []
  if (!a) return [{ tag: 'insert', i1: offset, i2: offset, j1: offset, j2: offset + b.length }]
  if (!b) return [{ tag: 'delete', i1: offset, i2: offset + a.length, j1: offset, j2: offset }]
  // console.log({ a, b })
  const parts = fastDiff(a, b)

  if (a === '施工图') {
    console.log({ a, b, ceshi: fastDiff(a, b) })
  }

  // console.log('ceshi', fastDiff('abc', 'adbecabc'))
  // if (
  //   a === '开户银行:账号:账号:第二部分通用合同条款(略)按(GF—2017—0201)建设工程施工合同通用合同条款'
  // ) {
  // console.log({ a, b, parts })
  // }
  // console.log({ parts })
  // console.log({ a, b, parts })
  const opcodes: Opcode[] = []
  let i = offset
  let j = offset

  for (const [op, text] of parts) {
    const len = text.length
    if (len === 0) continue
    // console.log({ op, text })
    // fast-diff: 0=相同, -1=删除(a侧), 1=插入(b侧)
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

  const merged = mergeAdjacentReplace(opcodes)

  if (a === '施工图') {
    console.log('测试', opcodes, merged)
  }

  return merged
}

/** 字符级 diff 入口：先裁剪相同前后缀，再调用 fast-diff（Myers 类算法） */
export function getOpcodes(a: string, b: string): Opcode[] {
  if (!a && !b) return []

  const { aMid, bMid, offset } = trimEqualAffixes(a, b)
  if (a === '6.工程承包范围:详见施工图和工程量清单、招标文件、发包人明确指令要求完成的其他任务.') {
    console.log({ a, b, aMid, bMid })
  }
  if (
    a ===
    '开户银行:开户银行:账号:账号:第二部分通用合同条款(略)按(GF—2017—0201)建设工程施工合同通用合同条款'
  ) {
    // console.log({ a, b, aMid, bMid })
  }
  return opcodesFromFastDiff(aMid, bMid, offset)
}

/** 合并同一行内相邻或重叠的 bbox，用于 PDF 高亮区域 */
export function mergeAdjacent(bboxes: number[][]): number[][] {
  if (bboxes.length <= 1) return bboxes.length === 1 ? [bboxes[0].slice()] : []

  const sorted = bboxes.slice().sort((x, y) => x[1] - y[1] || x[0] - y[0])
  const merged: number[][] = [sorted[0].slice()]

  for (let idx = 1; idx < sorted.length; idx++) {
    const box = sorted[idx]
    const last = merged[merged.length - 1]
    const lastHeight = Math.max(last[3] - last[1], box[3] - box[1])
    // 垂直中心接近视为同一行；水平相邻或重叠则合并
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
