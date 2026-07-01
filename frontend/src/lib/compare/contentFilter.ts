import type { LineUnit } from './types'

const PAGE_NUMBER =
  /^(\d{1,4}|[-—–·]\s*\d{1,4}\s*[-—–·]|第\s*\d{1,4}\s*页|\d{1,4}\s*\/\s*\d{1,4}|[Pp]age\s*\d{1,4}|\d{1,4}\s*of\s*\d{1,4})$/

/** 识别常见页码格式（纯数字、第 N 页、Page N 等） */
export function isPageNumber(text: string): boolean {
  if (!text) return false
  return PAGE_NUMBER.test(text.trim())
}

/** 过滤页码行等无实质内容的行，避免干扰 diff */
export function excludeNonContent(lines: LineUnit[]): LineUnit[] {
  return lines.filter((line) => {
    if (!line.normalized) return false
    if (isPageNumber(line.normalized) || isPageNumber(line.text)) return false
    return true
  })
}
