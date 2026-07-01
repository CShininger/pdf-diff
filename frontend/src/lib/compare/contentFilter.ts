import type { LineUnit } from './types'

const PAGE_NUMBER = /^(\d{1,4}|[-—–·]\s*\d{1,4}\s*[-—–·]|第\s*\d{1,4}\s*页|\d{1,4}\s*\/\s*\d{1,4}|[Pp]age\s*\d{1,4}|\d{1,4}\s*of\s*\d{1,4})$/

export function isPageNumber(text: string): boolean {
  if (!text) return false
  return PAGE_NUMBER.test(text.trim())
}

export function excludeNonContent(lines: LineUnit[]): LineUnit[] {
  return lines.filter((line) => {
    if (!line.normalized) return false
    if (isPageNumber(line.normalized) || isPageNumber(line.text)) return false
    return true
  })
}
