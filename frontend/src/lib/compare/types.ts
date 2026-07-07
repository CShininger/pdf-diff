import type { PdfPageSize } from '../../types/compare'

export interface CharBBox {
  start: number
  end: number
  bbox: number[]
}

export interface TextBlock {
  page: number
  text: string
  bbox: number[]
  fontSize: number
  charBboxes: CharBBox[]
}

export interface PdfExtractResult {
  blocks: TextBlock[]
  pageSizes: PdfPageSize[]
}

export interface LineUnit {
  id: string
  page: number
  text: string
  normalized: string
  bbox: number[]
  charBboxes: CharBBox[]
  /** 非空白字符在 text 中的原始下标，供 diff 映射复用 */
  rawNonWsPositions: number[]
}

export interface RawChange {
  type: 'delete' | 'insert' | 'replace' | 'equal'
  level: 'char'
  templateLines: LineUnit[]
  contractLines: LineUnit[]
  templateBboxes: number[][] | null
  contractBboxes: number[][] | null
}

export interface CompareOptions {
  ignore_whitespace: boolean
  ignore_header_footer: boolean
}

export interface LineRange {
  lineIndex: number
  start: number
  end: number
}
