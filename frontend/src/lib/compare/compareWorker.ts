import { comparePdfBuffers } from './comparePipeline'
import type { CompareOptions } from './types'
import type { CompareResult } from '../../types/compare'

export interface CompareWorkerRequest {
  id: number
  templateBuffer: ArrayBuffer
  contractBuffer: ArrayBuffer
  options: CompareOptions
}

export interface CompareWorkerResponse {
  id: number
  result?: CompareResult
  error?: string
}

/** Web Worker 入口，在后台线程执行 comparePdfBuffers 避免阻塞 UI */
self.onmessage = async (event: MessageEvent<CompareWorkerRequest>) => {
  const { id, templateBuffer, contractBuffer, options } = event.data
  try {
    const result = await comparePdfBuffers(templateBuffer, contractBuffer, options)
    const response: CompareWorkerResponse = { id, result }
    self.postMessage(response)
  } catch (err) {
    const response: CompareWorkerResponse = {
      id,
      error: err instanceof Error ? err.message : '比对失败',
    }
    self.postMessage(response)
  }
}
