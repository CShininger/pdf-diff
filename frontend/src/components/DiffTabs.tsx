import type { DiffTab } from '../types/diffTab'
import { DIFF_TABS } from '../types/diffTab'

interface DiffTabsProps {
  active: DiffTab
  onChange: (tab: DiffTab) => void
}

export function DiffTabs({ active, onChange }: DiffTabsProps) {
  return (
    <nav className="diff-tabs" role="tablist" aria-label="Diff 引擎">
      {DIFF_TABS.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={active === id}
          className={`diff-tab${active === id ? ' active' : ''}`}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </nav>
  )
}
