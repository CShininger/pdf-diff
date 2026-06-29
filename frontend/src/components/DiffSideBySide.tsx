import { useMemo, useState } from 'react'
import { ChangeList } from './ChangeList'
import { PdfViewer } from './PdfViewer'
import type { CompareResult } from '../types/compare'

interface DiffSideBySideProps {
  result: CompareResult
  apiBase?: string
}

export function DiffSideBySide({ result, apiBase = '/api' }: DiffSideBySideProps) {
  const [activeChangeId, setActiveChangeId] = useState<string | null>(null)

  const activeChange = useMemo(
    () => result.changes.find((c) => c.id === activeChangeId) ?? null,
    [result.changes, activeChangeId],
  )

  const scrollPage = activeChange
    ? (activeChange.contract?.page ?? activeChange.template?.page ?? null)
    : null

  const templateUrl = `${apiBase}/files/${result.job_id}/template`
  const contractUrl = `${apiBase}/files/${result.job_id}/contract`

  return (
    <div className="diff-layout">
      <div className="summary-bar">
        <span>删除 {result.summary.deleted_lines} 行</span>
        <span>新增 {result.summary.inserted_lines} 行</span>
        <span>修改 {result.summary.modified_lines} 行</span>
        <span>未改 {result.summary.equal_lines} 行</span>
      </div>

      <div className="pdf-columns">
        <PdfViewer
          title="模版 PDF"
          fileUrl={templateUrl}
          side="template"
          changes={result.changes}
          activeChangeId={activeChangeId}
          scrollToPage={scrollPage}
        />
        <PdfViewer
          title="正式 PDF"
          fileUrl={contractUrl}
          side="contract"
          changes={result.changes}
          activeChangeId={activeChangeId}
          scrollToPage={scrollPage}
        />
      </div>

      <ChangeList
        changes={result.changes}
        activeId={activeChangeId}
        onSelect={setActiveChangeId}
      />
    </div>
  )
}
