import { useCallback, useEffect, useState } from 'react'
import type { HistoryDetail, HistoryItem } from '../types/history'

interface UseHistoryState {
  loading: boolean
  error: string | null
  items: HistoryItem[]
  total: number
  refresh: () => Promise<void>
  loadDetail: (id: number) => Promise<HistoryDetail>
}

export function useHistory(apiBase = '/api'): UseHistoryState {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<HistoryItem[]>([])
  const [total, setTotal] = useState(0)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`${apiBase}/history?limit=50&offset=0`)
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.detail ?? '读取历史记录失败')
      }
      setItems(data.items ?? [])
      setTotal(data.total ?? 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误')
      setItems([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [apiBase])

  const loadDetail = useCallback(
    async (id: number) => {
      const response = await fetch(`${apiBase}/history/${id}`)
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.detail ?? '读取历史详情失败')
      }
      return data as HistoryDetail
    },
    [apiBase],
  )

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { loading, error, items, total, refresh, loadDetail }
}
