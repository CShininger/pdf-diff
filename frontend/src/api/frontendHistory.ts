import type { CompareResult } from '../types/compare'
import type { HistoryDetail } from '../types/history'
import { JAVA_HISTORY_API } from '../hooks/useHistory'

export async function saveFrontendHistory(
  templateFile: File,
  contractFile: File,
  result: CompareResult,
  apiBase = JAVA_HISTORY_API,
): Promise<HistoryDetail> {
  const formData = new FormData()
  formData.append('template', templateFile)
  formData.append('contract', contractFile)
  formData.append('result', JSON.stringify(result))
  formData.append('template_name', templateFile.name)
  formData.append('contract_name', contractFile.name)

  const response = await fetch(`${apiBase}/history/frontend`, {
    method: 'POST',
    body: formData,
  })

  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.detail ?? data.message ?? '保存历史记录失败')
  }

  return data as HistoryDetail
}
