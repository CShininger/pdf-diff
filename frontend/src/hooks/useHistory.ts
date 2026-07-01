import { useCallback, useEffect, useState } from 'react'
import type { HistoryDetail, HistoryItem } from '../types/history'

export const JAVA_HISTORY_API = '/api/java'

const DEFAULT_PAGE_SIZE = 10

interface UseHistoryState {
  loading: boolean
  error: string | null
  items: HistoryItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  setPage: (page: number) => void
  setPageSize: (pageSize: number) => void
  refresh: () => Promise<void>
  loadDetail: (id: number) => Promise<HistoryDetail>
}

export function useHistory(apiBase = JAVA_HISTORY_API): UseHistoryState {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<HistoryItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1)

  const fetchPage = useCallback(
    async (targetPage: number, targetPageSize: number) => {
      setLoading(true)
      setError(null)
      try {
        const offset = (targetPage - 1) * targetPageSize
        const response = await fetch(`${apiBase}/history?limit=${targetPageSize}&offset=${offset}`)
        const data = await response.json()
        if (!response.ok) {
          throw new Error(data.detail ?? data.message ?? '读取历史记录失败')
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
    },
    [apiBase],
  )

  const refresh = useCallback(async () => {
    await fetchPage(page, pageSize)
  }, [fetchPage, page, pageSize])

  const loadDetail = useCallback(
    async (id: number) => {
      const response = await fetch(`${apiBase}/history/${id}`)
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.detail ?? data.message ?? '读取历史详情失败')
      }
      return data as HistoryDetail
    },
    [apiBase],
  )

  const handleSetPage = useCallback(
    (nextPage: number) => {
      setPage(Math.min(Math.max(1, nextPage), totalPages))
    },
    [totalPages],
  )

  const handleSetPageSize = useCallback((nextPageSize: number) => {
    setPageSize(nextPageSize)
    setPage(1)
  }, [])

  useEffect(() => {
    void fetchPage(page, pageSize)
  }, [fetchPage, page, pageSize])

  useEffect(() => {
    if (page > totalPages && total > 0) {
      setPage(totalPages)
    }
  }, [page, totalPages, total])

  return {
    loading,
    error,
    items,
    total,
    page,
    pageSize,
    totalPages,
    setPage: handleSetPage,
    setPageSize: handleSetPageSize,
    refresh,
    loadDetail,
  }
}
