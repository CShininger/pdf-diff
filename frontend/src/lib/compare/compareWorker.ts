import { comparePdfBuffers } from './comparePipeline'
import type { CompareOptions } from './types'
import type { CompareResult } from '../../types/compare'

/** Worker 主线程 → 后台线程的比对请求 */
export interface CompareWorkerRequest {
  id: number
  templateBuffer: ArrayBuffer
  contractBuffer: ArrayBuffer
  options: CompareOptions
}

/** 后台线程 → 主线程的比对结果或错误 */
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
    console.log({ response })
    self.postMessage(response)
  } catch (err) {
    const response: CompareWorkerResponse = {
      id,
      error: err instanceof Error ? err.message : '比对失败',
    }
    self.postMessage(response)
  }
}
