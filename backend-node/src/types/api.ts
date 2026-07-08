import type { CompareResult, CompareSummary } from './compare.js'

export interface UploadResponse {
  url: string
  filename: string
}

export interface CompareByUrlRequest {
  template_url: string
  contract_url: string
  template_name?: string
  contract_name?: string
  options?: {
    ignore_whitespace?: boolean
    ignore_header_footer?: boolean
  }
}

export interface HistoryItem {
  id: number
  job_id: string
  backend: string
  template_url: string
  contract_url: string
  template_name: string
  contract_name: string
  summary: CompareSummary
  created_at: string
}

export interface HistoryDetail extends HistoryItem {
  result: CompareResult
}
