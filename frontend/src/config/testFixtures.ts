const TEST_HOST = 'http://10.10.101.52:31102'

/** 测试阶段锁定 PDF，设为 false 恢复手动上传 */
export const LOCK_TEST_PDFS = true

export const TEST_TEMPLATE = {
  name: 'e23a4bd6fb7a45939eeeed3bf7559a2c-招标文件-副本_加水印.pdf',
  path: '/demo-test/e23a4bd6fb7a45939eeeed3bf7559a2c-招标文件-副本_加水印.pdf',
} as const

export const TEST_CONTRACT = {
  name: '45f3cccfcd1d4ce281a360a025bd523a-23039施工合同-合同评审.pdf',
  path: '/demo-test/45f3cccfcd1d4ce281a360a025bd523a-23039施工合同-合同评审.pdf',
} as const

/** 浏览器内 fetch / PdfViewer 用（开发环境走 Vite 代理） */
export function browserPdfUrl(path: string): string {
  return import.meta.env.DEV ? path : `${TEST_HOST}${path}`
}

/** 后端 compare API 用（服务端拉取，需完整 URL） */
export function backendPdfUrl(path: string): string {
  return `${TEST_HOST}${path}`
}
