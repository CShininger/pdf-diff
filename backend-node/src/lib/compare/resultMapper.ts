import type { ChangeItem, CompareResult, LineInfo, PdfPageSize } from '../../types/compare.js'
import type { LineUnit, RawChange } from './types.js'

function sideFromLines(
  lines: LineUnit[],
  bboxesOverride: number[][] | null,
): ChangeItem['template'] {
  if (!lines.length || !bboxesOverride?.length) return null
  const line = lines[0]
  return { page: line.page, text: line.text, bboxes: bboxesOverride }
}

function toChangeItem(changeId: string, raw: RawChange): ChangeItem {
  return {
    id: changeId,
    type: raw.type as ChangeItem['type'],
    level: 'char',
    template: sideFromLines(raw.templateLines, raw.templateBboxes),
    contract: sideFromLines(raw.contractLines, raw.contractBboxes),
  }
}

function toLineInfo(line: LineUnit): LineInfo {
  return {
    id: line.id,
    page: line.page,
    text: line.text,
    bboxes: [line.bbox],
  }
}

export function buildCompareResult(
  jobId: string,
  templateLines: LineUnit[],
  contractLines: LineUnit[],
  rawChanges: RawChange[],
  templatePageSizes?: PdfPageSize[],
  contractPageSizes?: PdfPageSize[],
): CompareResult {
  const changes: ChangeItem[] = []
  let deletedLines = 0
  let insertedLines = 0
  let modifiedLines = 0
  let equalLines = 0
  let changeIndex = 0

  for (const raw of rawChanges) {
    if (raw.type === 'equal') {
      equalLines++
      continue
    }

    changeIndex++
    const item = toChangeItem(`c${String(changeIndex).padStart(4, '0')}`, raw)
    changes.push(item)

    if (item.type === 'delete') deletedLines++
    else if (item.type === 'insert') insertedLines++
    else if (item.type === 'replace') modifiedLines++
  }

  return {
    job_id: jobId,
    status: 'done',
    summary: {
      deleted_lines: deletedLines,
      inserted_lines: insertedLines,
      modified_lines: modifiedLines,
      equal_lines: equalLines,
    },
    changes,
    template_lines: templateLines.map(toLineInfo),
    contract_lines: contractLines.map(toLineInfo),
    template_page_sizes: templatePageSizes,
    contract_page_sizes: contractPageSizes,
  }
}
