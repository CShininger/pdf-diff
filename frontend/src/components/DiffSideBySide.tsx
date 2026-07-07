import { useMemo, useState } from 'react'
import { ChangeList } from './ChangeList'
import { PdfViewer } from './PdfViewer'
import type { CompareResult, TemplateAnchorMode } from '../types/compare'

interface DiffSideBySideProps {
  result: CompareResult
  apiBase?: string
  templatePdfUrl?: string | null
  contractPdfUrl?: string | null
  /** 模版插入锚点：always=始终显示，on-select=点击右侧绿色标注后显示 */
  templateAnchorMode?: TemplateAnchorMode
}

export function DiffSideBySide({
  result,
  apiBase = '/api',
  templatePdfUrl,
  contractPdfUrl,
  templateAnchorMode: initialAnchorMode = 'on-select',
}: DiffSideBySideProps) {
  const [activeChangeId, setActiveChangeId] = useState<string | null>(null)
  const [templateAnchorMode, setTemplateAnchorMode] =
    useState<TemplateAnchorMode>(initialAnchorMode)

  const activeChange = useMemo(
    () => result.changes.find((c) => c.id === activeChangeId) ?? null,
    [result.changes, activeChangeId],
  )
  console.log({ result })
  const templateScrollPage = activeChange?.template?.page ?? null
  const contractScrollPage = activeChange?.contract?.page ?? null

  const templateUrl = templatePdfUrl ?? `${apiBase}/files/${result.job_id}/template`
  const contractUrl = contractPdfUrl ?? `${apiBase}/files/${result.job_id}/contract`

  return (
    <div className="diff-layout">
      <div className="summary-bar">
        <span>删除 {result.summary.deleted_lines} 行</span>
        <span>新增 {result.summary.inserted_lines} 行</span>
        <span>修改 {result.summary.modified_lines} 行</span>
        <label className="anchor-mode-toggle">
          <span>插入点显示</span>
          <select
            value={templateAnchorMode}
            onChange={(event) => setTemplateAnchorMode(event.target.value as TemplateAnchorMode)}
          >
            <option value="always">始终显示</option>
            <option value="on-select">点击后显示</option>
          </select>
        </label>
      </div>

      <div className="pdf-columns">
        <PdfViewer
          title="模版 PDF"
          fileUrl={templateUrl}
          side="template"
          changes={result.changes}
          activeChangeId={activeChangeId}
          scrollToPage={templateScrollPage}
          templateAnchorMode={templateAnchorMode}
          onChangeSelect={setActiveChangeId}
        />
        <PdfViewer
          title="正式 PDF"
          fileUrl={contractUrl}
          side="contract"
          changes={result.changes}
          activeChangeId={activeChangeId}
          scrollToPage={contractScrollPage}
          templateAnchorMode={templateAnchorMode}
          onChangeSelect={setActiveChangeId}
        />
      </div>

      <ChangeList changes={result.changes} activeId={activeChangeId} onSelect={setActiveChangeId} />
    </div>
  )
}
