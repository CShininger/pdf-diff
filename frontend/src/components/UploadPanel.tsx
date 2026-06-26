import { useRef, useState } from 'react'

interface UploadPanelProps {
  loading: boolean
  onCompare: (template: File, contract: File) => void
}

export function UploadPanel({ loading, onCompare }: UploadPanelProps) {
  const [templateFile, setTemplateFile] = useState<File | null>(null)
  const [contractFile, setContractFile] = useState<File | null>(null)
  const templateRef = useRef<HTMLInputElement>(null)
  const contractRef = useRef<HTMLInputElement>(null)

  const canSubmit = templateFile && contractFile && !loading

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

      <button
        type="button"
        className="primary-btn"
        disabled={!canSubmit}
        onClick={() => {
          if (templateFile && contractFile) {
            onCompare(templateFile, contractFile)
          }
        }}
      >
        {loading ? '比对中…' : '开始比对'}
      </button>
    </section>
  )
}
