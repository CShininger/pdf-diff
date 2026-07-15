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

import type {
  CharRef,
  DiffSegment,
  SegmentDeleteRange,
  SegmentInsertRange,
  SegmentReplaceRange,
} from '../lib/compare/types'

export type { CharRef, DiffSegment, SegmentDeleteRange, SegmentInsertRange, SegmentReplaceRange }

export interface CompareResult {
  job_id: string
  status: 'done' | 'error'
  summary: CompareSummary
  changes: ChangeItem[]
  /** 锚点分段 + 分段内 delete/insert/replace，供智能体接口消费 */
  diff_segments: DiffSegment[]
  /** 全局逐字符 bbox，与拼接文本流一一对应，供智能体返回后渲染（不写入 diff_segments） */
  template_char_bboxes: number[][]
  contract_char_bboxes: number[][]
  template_char_map: CharRef[]
  contract_char_map: CharRef[]
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
