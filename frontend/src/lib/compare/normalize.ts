const WHITESPACE = /\s+/g

/** 规范化文本：可选去空白，并将中文标点统一为半角形式 */
export function normalize(text: string, ignoreWhitespace: boolean): string {
  if (!text) return ''

  let result = text.trim()
  if (ignoreWhitespace) {
    result = result.replace(WHITESPACE, '')
  }

  return result
    .replace(/，/g, ',')
    .replace(/。/g, '.')
    .replace(/；/g, ';')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/：/g, ':')
}
