import { useState } from 'react'
import { DiffSideBySide } from './components/DiffSideBySide'
import { DiffTabs } from './components/DiffTabs'
import { HistoryPanel } from './components/HistoryPanel'
import { LocalUploadPanel } from './components/LocalUploadPanel'
import { UploadPanel } from './components/UploadPanel'
import { useCompare } from './hooks/useCompare'
import { useFrontendCompare } from './hooks/useFrontendCompare'
import { useHistory } from './hooks/useHistory'
import type { HistoryItem } from './types/history'
import type { DiffTab } from './types/diffTab'
import './App.css'

const API_BASE: Record<Exclude<DiffTab, 'frontend-diff'>, string> = {
  'python-diff': '/api',
  'java-diff': '/api/java',
  'golang-diff': '/api/golang',
  'nodejs-diff': '/api/nodejs',
}

type AppView = 'compare' | 'history'

type CompareState = ReturnType<typeof useCompare>
type FrontendCompareState = ReturnType<typeof useFrontendCompare>

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

interface FrontendComparePanelProps {
  active: boolean
  compare: FrontendCompareState
}

function FrontendComparePanel({ active, compare }: FrontendComparePanelProps) {
  const {
    loading,
    saving,
    error,
    result,
    templatePdfUrl,
    contractPdfUrl,
    compareFiles,
    compareFromUrls,
    reset,
  } = compare

  return (
    <div role="tabpanel" hidden={!active} aria-hidden={!active}>
      {!result ? (
        <>
          <LocalUploadPanel
            loading={loading}
            onCompare={(templateFile, contractFile) =>
              void compareFiles(templateFile, contractFile)
            }
            onCompareUrls={(templateUrl, contractUrl, templateName, contractName) =>
              void compareFromUrls(templateUrl, contractUrl, templateName, contractName)
            }
          />
          {error && <div className="error-banner">{error}</div>}
        </>
      ) : (
        <>
          <div className="frontend-result-actions">
            <button type="button" className="secondary-btn" onClick={reset}>
              重新上传
            </button>
            {saving && <span className="save-hint">正在保存历史记录…</span>}
          </div>
          <DiffSideBySide
            result={result}
            templatePdfUrl={templatePdfUrl}
            contractPdfUrl={contractPdfUrl}
          />
        </>
      )}
    </div>
  )
}

function App() {
  const [activeView, setActiveView] = useState<AppView>('compare')
  const [activeTab, setActiveTab] = useState<DiffTab>('frontend-diff')
  const pythonCompare = useCompare(API_BASE['python-diff'])
  const javaCompare = useCompare(API_BASE['java-diff'])
  const golangCompare = useCompare(API_BASE['golang-diff'])
  const nodejsCompare = useCompare(API_BASE['nodejs-diff'])
  const frontendCompare = useFrontendCompare()
  const history = useHistory()

  const activeBackendCompare =
    activeTab === 'java-diff'
      ? javaCompare
      : activeTab === 'golang-diff'
        ? golangCompare
        : activeTab === 'nodejs-diff'
          ? nodejsCompare
          : activeTab === 'python-diff'
            ? pythonCompare
            : null

  const handleHistorySelect = async (item: HistoryItem) => {
    try {
      const detail = await history.loadDetail(item.id)

      if (item.backend === 'frontend') {
        setActiveTab('frontend-diff')
        frontendCompare.setResultFromHistory(
          detail.result,
          detail.template_url,
          detail.contract_url,
        )
      } else {
        setActiveTab('java-diff')
        javaCompare.setResultFromHistory(detail.result, detail.template_url, detail.contract_url)
      }

      setActiveView('compare')
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '加载历史记录失败')
    }
  }

  const showResetButton =
    activeView === 'compare' &&
    (activeTab === 'frontend-diff' ? !!frontendCompare.result : !!activeBackendCompare?.result)

  const handleReset = () => {
    if (activeTab === 'frontend-diff') {
      frontendCompare.reset()
      return
    }
    activeBackendCompare?.reset()
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
          {showResetButton && (
            <button type="button" className="secondary-btn" onClick={handleReset}>
              重新上传
            </button>
          )}
          {activeView === 'history' && (
            <button
              type="button"
              className="secondary-btn"
              onClick={() => setActiveView('compare')}
            >
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
          page={history.page}
          pageSize={history.pageSize}
          totalPages={history.totalPages}
          onPageChange={history.setPage}
          onPageSizeChange={history.setPageSize}
          onSelect={(item) => void handleHistorySelect(item)}
          onRefresh={() => void history.refresh()}
        />
      ) : (
        <>
          <DiffTabs active={activeTab} onChange={setActiveTab} />
          <FrontendComparePanel active={activeTab === 'frontend-diff'} compare={frontendCompare} />
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
          <CompareTabPanel
            active={activeTab === 'nodejs-diff'}
            apiBase={API_BASE['nodejs-diff']}
            compare={nodejsCompare}
          />
        </>
      )}
    </div>
  )
}

export default App
