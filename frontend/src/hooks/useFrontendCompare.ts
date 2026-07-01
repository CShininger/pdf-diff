import { useCallback, useEffect, useRef, useState } from 'react'
import { saveFrontendHistory } from '../api/frontendHistory'
import type { CompareWorkerRequest, CompareWorkerResponse } from '../lib/compare/compareWorker'
import type { CompareOptions, CompareResult } from '../types/compare'

interface UseFrontendCompareState {
  loading: boolean
  saving: boolean
  error: string | null
  result: CompareResult | null
  templatePdfUrl: string | null
  contractPdfUrl: string | null
  compareFiles: (
    templateFile: File,
    contractFile: File,
    options?: CompareOptions,
  ) => Promise<void>
  setResultFromHistory: (
    nextResult: CompareResult,
    templateUrl: string,
    contractUrl: string,
  ) => void
  reset: () => void
}

const defaultOptions: CompareOptions = {
  ignore_whitespace: true,
  ignore_header_footer: true,
}

let worker: Worker | null = null
let requestId = 0

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../lib/compare/compareWorker.ts', import.meta.url), {
      type: 'module',
    })
  }
  return worker
}

function runCompareInWorker(
  templateBuffer: ArrayBuffer,
  contractBuffer: ArrayBuffer,
  options: CompareOptions,
): Promise<CompareResult> {
  const w = getWorker()
  const id = ++requestId

  return new Promise((resolve, reject) => {
    const onMessage = (event: MessageEvent<CompareWorkerResponse>) => {
      if (event.data.id !== id) return
      w.removeEventListener('message', onMessage)
      w.removeEventListener('error', onError)
      if (event.data.error) {
        reject(new Error(event.data.error))
      } else if (event.data.result) {
        resolve(event.data.result)
      } else {
        reject(new Error('未返回比对结果'))
      }
    }

    const onError = () => {
      w.removeEventListener('message', onMessage)
      w.removeEventListener('error', onError)
      reject(new Error('比对 Worker 异常'))
    }

    w.addEventListener('message', onMessage)
    w.addEventListener('error', onError)

    const request: CompareWorkerRequest = {
      id,
      templateBuffer,
      contractBuffer,
      options,
    }
    w.postMessage(request, [templateBuffer, contractBuffer])
  })
}

export function useFrontendCompare(): UseFrontendCompareState {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CompareResult | null>(null)
  const [templatePdfUrl, setTemplatePdfUrl] = useState<string | null>(null)
  const [contractPdfUrl, setContractPdfUrl] = useState<string | null>(null)
  const blobUrlsRef = useRef<string[]>([])

  const revokeBlobUrls = useCallback(() => {
    for (const url of blobUrlsRef.current) {
      URL.revokeObjectURL(url)
    }
    blobUrlsRef.current = []
  }, [])

  useEffect(() => () => revokeBlobUrls(), [revokeBlobUrls])

  const compareFiles = useCallback(
    async (
      templateFile: File,
      contractFile: File,
      options: CompareOptions = defaultOptions,
    ) => {
      setLoading(true)
      setError(null)
      revokeBlobUrls()

      try {
        const [templateBuffer, contractBuffer] = await Promise.all([
          templateFile.arrayBuffer(),
          contractFile.arrayBuffer(),
        ])

        const compareResult = await runCompareInWorker(
          templateBuffer.slice(0),
          contractBuffer.slice(0),
          options,
        )

        const tplUrl = URL.createObjectURL(templateFile)
        const conUrl = URL.createObjectURL(contractFile)
        blobUrlsRef.current = [tplUrl, conUrl]

        setResult(compareResult)
        setTemplatePdfUrl(tplUrl)
        setContractPdfUrl(conUrl)

        setSaving(true)
        try {
          await saveFrontendHistory(templateFile, contractFile, compareResult)
        } catch {
          // 保存失败不影响本地比对结果展示
        } finally {
          setSaving(false)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '比对失败')
        setResult(null)
        setTemplatePdfUrl(null)
        setContractPdfUrl(null)
      } finally {
        setLoading(false)
      }
    },
    [revokeBlobUrls],
  )

  const setResultFromHistory = useCallback(
    (nextResult: CompareResult, templateUrl: string, contractUrl: string) => {
      revokeBlobUrls()
      setResult(nextResult)
      setTemplatePdfUrl(templateUrl)
      setContractPdfUrl(contractUrl)
      setError(null)
      setLoading(false)
      setSaving(false)
    },
    [revokeBlobUrls],
  )

  const reset = useCallback(() => {
    revokeBlobUrls()
    setResult(null)
    setTemplatePdfUrl(null)
    setContractPdfUrl(null)
    setError(null)
    setLoading(false)
    setSaving(false)
  }, [revokeBlobUrls])

  return {
    loading,
    saving,
    error,
    result,
    templatePdfUrl,
    contractPdfUrl,
    compareFiles,
    setResultFromHistory,
    reset,
  }
}
