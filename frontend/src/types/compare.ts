export type ChangeType = 'equal' | 'delete' | 'insert' | 'replace'
export type ChangeLevel = 'char' | 'line'

/** 模版侧插入锚点显示方式：始终显示 / 选中右侧绿色标注后才显示 */
export type TemplateAnchorMode = 'always' | 'on-select'

export interface SideInfo {
  page: number
  text: string
  bboxes: number[][]
}

export interface ChangeItem {
  id: string
  type: ChangeType
  level: ChangeLevel
  template: SideInfo | null
  contract: SideInfo | null
}

export interface CompareSummary {
  deleted_lines: number
  inserted_lines: number
  modified_lines: number
  equal_lines: number
}

export interface PdfPageSize {
  width: number
  height: number
}

export interface CompareResult {
  job_id: string
  status: 'done' | 'error'
  summary: CompareSummary
  changes: ChangeItem[]
  template_lines: LineInfo[]
  contract_lines: LineInfo[]
  template_page_sizes?: PdfPageSize[]
  contract_page_sizes?: PdfPageSize[]
}

export interface LineInfo {
  id: string
  page: number
  text: string
  bboxes: number[][]
}

export interface CompareResponse {
  job_id: string
  status: 'done' | 'processing' | 'error'
  result: CompareResult | null
  message: string | null
}

export interface CompareOptions {
  ignore_whitespace: boolean
  ignore_header_footer: boolean
}
