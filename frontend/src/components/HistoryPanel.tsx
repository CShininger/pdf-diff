import type { HistoryItem } from '../types/history'

interface HistoryPanelProps {
  loading: boolean
  error: string | null
  items: HistoryItem[]
  total: number
  onSelect: (item: HistoryItem) => void
  onRefresh: () => void
}

const BACKEND_LABEL: Record<string, string> = {
  python: 'Python',
  java: 'Java',
  go: 'Golang',
}

export function HistoryPanel({
  loading,
  error,
  items,
  total,
  onSelect,
  onRefresh,
}: HistoryPanelProps) {
  return (
    <section className="history-panel">
      <div className="history-header">
        <div>
          <h2>历史记录</h2>
          <p>共 {total} 条比对记录</p>
        </div>
        <button type="button" className="secondary-btn" onClick={onRefresh} disabled={loading}>
          刷新
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading && items.length === 0 ? (
        <div className="history-empty">加载中…</div>
      ) : items.length === 0 ? (
        <div className="history-empty">暂无历史记录</div>
      ) : (
        <div className="history-list">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className="history-item"
              onClick={() => onSelect(item)}
            >
              <div className="history-item-main">
                <strong>{item.template_name || '模版 PDF'}</strong>
                <span>vs</span>
                <strong>{item.contract_name || '正式 PDF'}</strong>
              </div>
              <div className="history-item-meta">
                <span>{BACKEND_LABEL[item.backend] ?? item.backend}</span>
                <span>
                  删 {item.summary.deleted_lines} / 增 {item.summary.inserted_lines} / 改{' '}
                  {item.summary.modified_lines}
                </span>
                <span>{item.created_at}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
