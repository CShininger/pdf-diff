import { useRef, useState } from 'react'
import {
  browserPdfUrl,
  LOCK_TEST_PDFS,
  TEST_CONTRACT,
  TEST_TEMPLATE,
  USE_MINIO_UPLOAD,
} from '../config/testFixtures'

interface LocalUploadPanelProps {
  loading: boolean
  onCompare: (templateFile: File, contractFile: File) => void
  onCompareUrls?: (
    templateUrl: string,
    contractUrl: string,
    templateName: string,
    contractName: string,
  ) => void
}

export function LocalUploadPanel({ loading, onCompare, onCompareUrls }: LocalUploadPanelProps) {
  const [templateFile, setTemplateFile] = useState<File | null>(null)
  const [contractFile, setContractFile] = useState<File | null>(null)
  const templateRef = useRef<HTMLInputElement>(null)
  const contractRef = useRef<HTMLInputElement>(null)

  // MinIO 暂停时强制本地选文件；恢复 USE_MINIO_UPLOAD 后可再走锁定远程样例
  const useLockedRemote = USE_MINIO_UPLOAD && LOCK_TEST_PDFS
  const canSubmit = (useLockedRemote || (templateFile && contractFile)) && !loading

  const handleCompare = () => {
    if (useLockedRemote && onCompareUrls) {
      onCompareUrls(
        browserPdfUrl(TEST_TEMPLATE.path),
        browserPdfUrl(TEST_CONTRACT.path),
        TEST_TEMPLATE.name,
        TEST_CONTRACT.name,
      )
      return
    }
    if (!templateFile || !contractFile) return
    onCompare(templateFile, contractFile)
  }

  if (useLockedRemote) {
    return (
      <section className="upload-panel">
        <div className="upload-grid">
          <div className="upload-card locked">
            <span className="upload-label">模版 PDF（招标文件）</span>
            <span className="upload-filename">{TEST_TEMPLATE.name}</span>
            <span className="fixture-badge">测试锁定</span>
          </div>

          <div className="upload-card locked">
            <span className="upload-label">正式 PDF（业主合同）</span>
            <span className="upload-filename">{TEST_CONTRACT.name}</span>
            <span className="fixture-badge">测试锁定</span>
          </div>
        </div>

        <button type="button" className="primary-btn" disabled={!canSubmit} onClick={handleCompare}>
          {loading ? '比对中…' : '开始比对（纯前端）'}
        </button>
      </section>
    )
  }

  return (
    <section className="upload-panel">
      <div className="upload-grid">
        <label className="upload-card">
          <span className="upload-label">模版 PDF（招标文件）</span>
          <input
            ref={templateRef}
            type="file"
            accept="application/pdf"
            onChange={(e) => setTemplateFile(e.target.files?.[0] ?? null)}
          />
          <span className="upload-filename">{templateFile?.name ?? '点击选择文件'}</span>
        </label>

        <label className="upload-card">
          <span className="upload-label">正式 PDF（业主合同）</span>
          <input
            ref={contractRef}
            type="file"
            accept="application/pdf"
            onChange={(e) => setContractFile(e.target.files?.[0] ?? null)}
          />
          <span className="upload-filename">{contractFile?.name ?? '点击选择文件'}</span>
        </label>
      </div>

      <button type="button" className="primary-btn" disabled={!canSubmit} onClick={handleCompare}>
        {loading ? '比对中…' : '开始比对（纯前端）'}
      </button>
    </section>
  )
}
