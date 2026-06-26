import { useCallback, useState } from 'react'
import type { CompareOptions, CompareResult } from '../types/compare'

interface UseCompareState {
  loading: boolean
  error: string | null
  result: CompareResult | null
  compare: (template: File, contract: File, options?: CompareOptions) => Promise<void>
  reset: () => void
}

const defaultOptions: CompareOptions = {
  ignore_whitespace: true,
  ignore_header_footer: true,
}

export function useCompare(): UseCompareState {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CompareResult | null>(null)

  const compare = useCallback(
    async (template: File, contract: File, options: CompareOptions = defaultOptions) => {
      setLoading(true)
      setError(null)

      const formData = new FormData()
      formData.append('template', template)
      formData.append('contract', contract)
      formData.append('options', JSON.stringify(options))

      try {
        const response = await fetch('/api/compare', {
          method: 'POST',
          body: formData,
        })

        const data = await response.json()
        if (!response.ok) {
          throw new Error(data.detail ?? '比对请求失败')
        }

        if (!data.result) {
          throw new Error('未返回比对结果')
        }

        setResult(data.result)
      } catch (err) {
        setError(err instanceof Error ? err.message : '未知错误')
        setResult(null)
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  const reset = useCallback(() => {
    setResult(null)
    setError(null)
    setLoading(false)
  }, [])

  return { loading, error, result, compare, reset }
}
