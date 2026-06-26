import type { ChangeType } from '../types/compare'

const TYPE_LABELS: Record<ChangeType, string> = {
  equal: '未改动',
  delete: '删除',
  insert: '新增',
  replace: '修改',
}

function formatLineText(text: string) {
  return text.length > 0 ? text : '(空行)'
}

interface ChangeListProps {
  changes: import('../types/compare').ChangeItem[]
  activeId: string | null
  onSelect: (id: string) => void
}

export function ChangeList({ changes, activeId, onSelect }: ChangeListProps) {
  const visibleChanges = changes.filter((c) => c.type !== 'equal')

  if (visibleChanges.length === 0) {
    return <div className="change-list empty">未发现差异</div>
  }

  return (
    <div className="change-list">
      <h3>差异列表 ({visibleChanges.length})</h3>
      <div className="change-items">
        {visibleChanges.map((change) => (
          <button
            key={change.id}
            type="button"
            className={`change-item change-${change.type} ${activeId === change.id ? 'active' : ''}`}
            onClick={() => onSelect(change.id)}
          >
            <div className="change-header">
              <span className={`badge badge-${change.type}`}>{TYPE_LABELS[change.type]}</span>
              <span className="change-id">{change.id}</span>
            </div>

            {change.template && (
              <p className="change-text template">
                <strong>模版：</strong>
                <span className="inline-delete">{formatLineText(change.template.text)}</span>
              </p>
            )}

            {change.contract && (
              <p className="change-text contract">
                <strong>正式：</strong>
                <span className="inline-insert">{formatLineText(change.contract.text)}</span>
              </p>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
