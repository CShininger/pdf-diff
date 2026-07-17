import { JAVA_HISTORY_API } from '../hooks/useHistory'
import type { UploadResponse } from '../types/history'

export async function uploadFile(file: File): Promise<UploadResponse> {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch(`${JAVA_HISTORY_API}/upload`, {
    method: 'POST',
    body: formData,
  })

  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.detail ?? data.message ?? '文件上传失败')
  }

  return data as UploadResponse
}
