import { useCallback, useState } from 'react'
import type { CompareOptions, CompareResult } from '../types/compare'
import type { CompareByUrlRequest } from '../types/history'

interface UseCompareState {
  loading: boolean
  error: string | null
  result: CompareResult | null
  templatePdfUrl: string | null
  contractPdfUrl: string | null
  compareByUrl: (
    templateUrl: string,
    contractUrl: string,
    templateName?: string,
    contractName?: string,
    options?: CompareOptions,
  ) => Promise<void>
  setResultFromHistory: (
    result: CompareResult,
    templateUrl: string,
    contractUrl: string,
  ) => void
  reset: () => void
}

const defaultOptions: CompareOptions = {
  ignore_whitespace: true,
  ignore_header_footer: true,
}

export function useCompare(apiBase = '/api'): UseCompareState {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CompareResult | null>(null)
  const [templatePdfUrl, setTemplatePdfUrl] = useState<string | null>(null)
  const [contractPdfUrl, setContractPdfUrl] = useState<string | null>(null)

  const compareByUrl = useCallback(
    async (
      templateUrl: string,
      contractUrl: string,
      templateName = '',
      contractName = '',
      options: CompareOptions = defaultOptions,
    ) => {
      setLoading(true)
      setError(null)

      const body: CompareByUrlRequest = {
        template_url: templateUrl,
        contract_url: contractUrl,
        template_name: templateName,
        contract_name: contractName,
        options,
      }

      try {
        const response = await fetch(`${apiBase}/compare`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })

        const data = await response.json()
        if (!response.ok) {
          throw new Error(data.detail ?? '比对请求失败')
        }

        if (!data.result) {
          throw new Error('未返回比对结果')
        }

        setResult(data.result)
        setTemplatePdfUrl(templateUrl)
        setContractPdfUrl(contractUrl)
      } catch (err) {
        setError(err instanceof Error ? err.message : '未知错误')
        setResult(null)
        setTemplatePdfUrl(null)
        setContractPdfUrl(null)
      } finally {
        setLoading(false)
      }
    },
    [apiBase],
  )

  const setResultFromHistory = useCallback(
    (nextResult: CompareResult, templateUrl: string, contractUrl: string) => {
      setResult(nextResult)
      setTemplatePdfUrl(templateUrl)
      setContractPdfUrl(contractUrl)
      setError(null)
      setLoading(false)
    },
    [],
  )

  const reset = useCallback(() => {
    setResult(null)
    setTemplatePdfUrl(null)
    setContractPdfUrl(null)
    setError(null)
    setLoading(false)
  }, [])

  return {
    loading,
    error,
    result,
    templatePdfUrl,
    contractPdfUrl,
    compareByUrl,
    setResultFromHistory,
    reset,
  }
}
