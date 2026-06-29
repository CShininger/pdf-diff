import { useState } from 'react'
import { ComingSoonPanel } from './components/ComingSoonPanel'
import { DiffSideBySide } from './components/DiffSideBySide'
import { DiffTabs } from './components/DiffTabs'
import { UploadPanel } from './components/UploadPanel'
import { useCompare } from './hooks/useCompare'
import type { DiffTab } from './types/diffTab'
import './App.css'

const API_BASE: Record<DiffTab, string> = {
  'python-diff': '/api',
  'java-diff': '/api/java',
  'golang-diff': '/api/golang',
}

type CompareState = ReturnType<typeof useCompare>

interface CompareTabPanelProps {
  active: boolean
  apiBase: string
  compare: CompareState
}

function CompareTabPanel({ active, apiBase, compare }: CompareTabPanelProps) {
  const { loading, error, result, compare: onCompare } = compare

  return (
    <div role="tabpanel" hidden={!active} aria-hidden={!active}>
      {!result ? (
        <>
          <UploadPanel loading={loading} onCompare={onCompare} />
          {error && <div className="error-banner">{error}</div>}
        </>
      ) : (
        <DiffSideBySide result={result} apiBase={apiBase} />
      )}
    </div>
  )
}

function App() {
  const [activeTab, setActiveTab] = useState<DiffTab>('python-diff')
  const pythonCompare = useCompare(API_BASE['python-diff'])
  const javaCompare = useCompare(API_BASE['java-diff'])

  const activeCompare =
    activeTab === 'java-diff'
      ? javaCompare
      : activeTab === 'python-diff'
        ? pythonCompare
        : null

  const showCompare = activeTab === 'python-diff' || activeTab === 'java-diff'

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>PDF 合同比对</h1>
          <p>基于 Git 式全局 LCS 算法，对比模版与正式合同的删改差异</p>
        </div>
        {showCompare && activeCompare?.result && (
          <button type="button" className="secondary-btn" onClick={activeCompare.reset}>
            重新上传
          </button>
        )}
      </header>

      <DiffTabs active={activeTab} onChange={setActiveTab} />

      <CompareTabPanel
        active={activeTab === 'python-diff'}
        apiBase={API_BASE['python-diff']}
        compare={pythonCompare}
      />
      <CompareTabPanel
        active={activeTab === 'java-diff'}
        apiBase={API_BASE['java-diff']}
        compare={javaCompare}
      />
      <div role="tabpanel" hidden={activeTab !== 'golang-diff'} aria-hidden={activeTab !== 'golang-diff'}>
        <ComingSoonPanel engine="Golang Diff" />
      </div>
    </div>
  )
}

export default App
