import { InlineTextDiff } from './InlineTextDiff'
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
      <h3>更改报告 ({visibleChanges.length})</h3>
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

            {change.type === 'replace' && change.template && change.contract ? (
              <InlineTextDiff
                templateText={change.template.text}
                contractText={change.contract.text}
              />
            ) : (
              <>
                {change.template && (
                  <p className="change-text template">
                    <strong>{change.type === 'insert' ? '插入点：' : '旧：'}</strong>
                    {change.type === 'insert' ? (
                      <span className="inline-anchor">模版此处无对应内容（见 PDF 蓝色虚线标记）</span>
                    ) : (
                      <span className="inline-delete">{formatLineText(change.template.text)}</span>
                    )}
                  </p>
                )}

                {change.contract && (
                  <p className="change-text contract">
                    <strong>新：</strong>
                    <span className="inline-insert">{formatLineText(change.contract.text)}</span>
                  </p>
                )}
              </>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
