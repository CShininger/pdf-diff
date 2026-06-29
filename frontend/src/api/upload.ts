import type { UploadResponse } from '../types/history'

export async function uploadFile(file: File, apiBase = '/api'): Promise<UploadResponse> {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch(`${apiBase}/upload`, {
    method: 'POST',
    body: formData,
  })

  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.detail ?? '文件上传失败')
  }

  return data as UploadResponse
}
