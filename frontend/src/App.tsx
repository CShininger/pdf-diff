import { DiffSideBySide } from './components/DiffSideBySide'
import { UploadPanel } from './components/UploadPanel'
import { useCompare } from './hooks/useCompare'
import './App.css'

function App() {
  const { loading, error, result, compare, reset } = useCompare()

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>PDF 合同比对</h1>
          <p>基于 Git 式全局 LCS 算法，对比模版与正式合同的删改差异</p>
        </div>
        {result && (
          <button type="button" className="secondary-btn" onClick={reset}>
            重新上传
          </button>
        )}
      </header>

      {!result ? (
        <>
          <UploadPanel loading={loading} onCompare={compare} />
          {error && <div className="error-banner">{error}</div>}
        </>
      ) : (
        <DiffSideBySide result={result} />
      )}
    </div>
  )
}

export default App
