import { useState } from 'react'
import { DiffSideBySide } from './components/DiffSideBySide'
import { DiffTabs } from './components/DiffTabs'
import { HistoryPanel } from './components/HistoryPanel'
import { UploadPanel } from './components/UploadPanel'
import { useCompare } from './hooks/useCompare'
import { useHistory } from './hooks/useHistory'
import type { HistoryItem } from './types/history'
import type { DiffTab } from './types/diffTab'
import './App.css'

const API_BASE: Record<DiffTab, string> = {
  'python-diff': '/api',
  'java-diff': '/api/java',
  'golang-diff': '/api/golang',
}

type AppView = 'compare' | 'history'

type CompareState = ReturnType<typeof useCompare>

interface CompareTabPanelProps {
  active: boolean
  apiBase: string
  compare: CompareState
}

function CompareTabPanel({ active, apiBase, compare }: CompareTabPanelProps) {
  const { loading, error, result, templatePdfUrl, contractPdfUrl, compareByUrl } = compare

  return (
    <div role="tabpanel" hidden={!active} aria-hidden={!active}>
      {!result ? (
        <>
          <UploadPanel
            apiBase={apiBase}
            loading={loading}
            onCompare={(templateUrl, contractUrl, templateName, contractName) =>
              void compareByUrl(templateUrl, contractUrl, templateName, contractName)
            }
          />
          {error && <div className="error-banner">{error}</div>}
        </>
      ) : (
        <DiffSideBySide
          result={result}
          apiBase={apiBase}
          templatePdfUrl={templatePdfUrl}
          contractPdfUrl={contractPdfUrl}
        />
      )}
    </div>
  )
}

function App() {
  const [activeView, setActiveView] = useState<AppView>('compare')
  const [activeTab, setActiveTab] = useState<DiffTab>('java-diff')
  const pythonCompare = useCompare(API_BASE['python-diff'])
  const javaCompare = useCompare(API_BASE['java-diff'])
  const golangCompare = useCompare(API_BASE['golang-diff'])
  const history = useHistory(API_BASE[activeTab])

  const activeCompare =
    activeTab === 'java-diff'
      ? javaCompare
      : activeTab === 'golang-diff'
        ? golangCompare
        : pythonCompare

  const handleHistorySelect = async (item: HistoryItem) => {
    try {
      const detail = await history.loadDetail(item.id)
      const targetCompare =
        detail.backend === 'java'
          ? javaCompare
          : detail.backend === 'go'
            ? golangCompare
            : pythonCompare

      if (detail.backend === 'java') {
        setActiveTab('java-diff')
      } else if (detail.backend === 'go') {
        setActiveTab('golang-diff')
      } else {
        setActiveTab('python-diff')
      }

      targetCompare.setResultFromHistory(
        detail.result,
        detail.template_url,
        detail.contract_url,
      )
      setActiveView('compare')
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '加载历史记录失败')
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>PDF 合同比对</h1>
          <p>基于 Git 式全局 LCS 算法，对比模版与正式合同的删改差异</p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className={activeView === 'history' ? 'primary-btn' : 'secondary-btn'}
            onClick={() => setActiveView('history')}
          >
            历史记录
          </button>
          {activeView === 'compare' && activeCompare.result && (
            <button type="button" className="secondary-btn" onClick={activeCompare.reset}>
              重新上传
            </button>
          )}
          {activeView === 'history' && (
            <button type="button" className="secondary-btn" onClick={() => setActiveView('compare')}>
              返回比对
            </button>
          )}
        </div>
      </header>

      {activeView === 'history' ? (
        <HistoryPanel
          loading={history.loading}
          error={history.error}
          items={history.items}
          total={history.total}
          onSelect={(item) => void handleHistorySelect(item)}
          onRefresh={() => void history.refresh()}
        />
      ) : (
        <>
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
          <CompareTabPanel
            active={activeTab === 'golang-diff'}
            apiBase={API_BASE['golang-diff']}
            compare={golangCompare}
          />
        </>
      )}
    </div>
  )
}

export default App
