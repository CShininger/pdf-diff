const WHITESPACE = /\s+/g

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
