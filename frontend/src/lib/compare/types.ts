import type { PdfPageSize } from '../../types/compare'

/** 单个字符在文本中的区间及其 PDF 坐标 bbox [x0,y0,x1,y1] */
export interface CharBBox {
  start: number
  end: number
  bbox: number[]
}

/** PDF 提取的最小文本单元（通常对应一个 text item 或行内片段） */
export interface TextBlock {
  page: number
  text: string
  bbox: number[]
  fontSize: number
  charBboxes: CharBBox[]
}

/** PDF 提取结果：全页 TextBlock 扁平列表 + 每页尺寸 */
export interface PdfExtractResult {
  blocks: TextBlock[]
  pageSizes: PdfPageSize[]
}

/** 比对用的逻辑行：含 normalized 文本与 diff→bbox 映射所需字段 */
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

/** diff 引擎输出的中间变更结构，尚未转为 API ChangeItem */
export interface RawChange {
  type: 'delete' | 'insert' | 'replace' | 'equal'
  level: 'char'
  templateLines: LineUnit[]
  contractLines: LineUnit[]
  templateBboxes: number[][] | null
  contractBboxes: number[][] | null
}

/** 前端比对选项：空白忽略、页眉页脚过滤 */
export interface CompareOptions {
  ignore_whitespace: boolean
  ignore_header_footer: boolean
}

/** 拼接文本流中某行对应的字符区间 */
export interface LineRange {
  lineIndex: number
  start: number
  end: number
}
