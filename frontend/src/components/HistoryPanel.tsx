import type { HistoryItem } from '../types/history'

interface HistoryPanelProps {
  loading: boolean
  error: string | null
  items: HistoryItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
  onSelect: (item: HistoryItem) => void
  onRefresh: () => void
}

const BACKEND_LABEL: Record<string, string> = {
  python: 'Python',
  java: 'Java',
  go: 'Golang',
  golang: 'Golang',
}

const PAGE_SIZE_OPTIONS = [10, 20, 50]

export function HistoryPanel({
  loading,
  error,
  items,
  total,
  page,
  pageSize,
  totalPages,
  onPageChange,
  onPageSizeChange,
  onSelect,
  onRefresh,
}: HistoryPanelProps) {
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1
  const rangeEnd = Math.min(page * pageSize, total)

  return (
    <section className="history-panel">
      <div className="history-header">
        <div>
          <h2>历史记录</h2>
          <p>共 {total} 条比对记录（Java 后端）</p>
        </div>
        <button type="button" className="secondary-btn" onClick={onRefresh} disabled={loading}>
          刷新
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="history-table-wrap">
        <table className="history-table">
          <thead>
            <tr>
              <th>模版文件</th>
              <th>正式文件</th>
              <th>后端</th>
              <th>删除</th>
              <th>新增</th>
              <th>修改</th>
              <th>比对时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading && items.length === 0 ? (
              <tr>
                <td colSpan={8} className="history-table-empty">
                  加载中…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={8} className="history-table-empty">
                  暂无历史记录
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id}>
                  <td>{item.template_name || '模版 PDF'}</td>
                  <td>{item.contract_name || '正式 PDF'}</td>
                  <td>{BACKEND_LABEL[item.backend] ?? item.backend}</td>
                  <td>{item.summary.deleted_lines}</td>
                  <td>{item.summary.inserted_lines}</td>
                  <td>{item.summary.modified_lines}</td>
                  <td>{item.created_at}</td>
                  <td>
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => onSelect(item)}
                      disabled={loading}
                    >
                      查看
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="history-pagination">
        <div className="history-pagination-info">
          {total > 0 ? (
            <span>
              显示 {rangeStart}-{rangeEnd} / 共 {total} 条
            </span>
          ) : (
            <span>共 0 条</span>
          )}
        </div>

        <div className="history-pagination-controls">
          <label className="history-page-size">
            每页
            <select
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              disabled={loading}
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            条
          </label>

          <button
            type="button"
            className="secondary-btn"
            onClick={() => onPageChange(page - 1)}
            disabled={loading || page <= 1}
          >
            上一页
          </button>
          <span className="history-page-indicator">
            第 {page} / {totalPages} 页
          </span>
          <button
            type="button"
            className="secondary-btn"
            onClick={() => onPageChange(page + 1)}
            disabled={loading || page >= totalPages}
          >
            下一页
          </button>
        </div>
      </div>
    </section>
  )
}
