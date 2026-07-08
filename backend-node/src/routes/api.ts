import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { Router, type Request, type Response } from 'express'
import multer from 'multer'
import type { CompareByUrlRequest } from '../types/api.js'
import type { CompareOptions, CompareResponse } from '../types/compare.js'
import { comparePdfBuffers } from '../services/compareService.js'
import {
  ensureTempDir,
  getJob,
  getJobByResult,
  readJobPdf,
  saveJobPdfs,
  storeJob,
} from '../storage/jobStore.js'

const uploadDir = path.resolve('uploads')
await mkdir(uploadDir, { recursive: true })
await ensureTempDir()

const uploadStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.pdf'
    cb(null, `${randomUUID()}${ext}`)
  },
})

const upload = multer({
  storage: uploadStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
})

function getBaseUrl(req: Request): string {
  const host = req.get('host') ?? 'localhost:8003'
  const protocol = req.protocol
  return `${protocol}://${host}`
}

function sendError(res: Response, status: number, detail: string): void {
  res.status(status).json({ detail })
}

function bufferToArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

async function fetchPdfBytes(url: string): Promise<Buffer> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`无法下载 PDF: ${url} (${response.status})`)
  }
  const contentType = response.headers.get('content-type') ?? ''
  if (
    contentType &&
    !contentType.includes('application/pdf') &&
    !contentType.includes('application/octet-stream')
  ) {
    throw new Error(`文件不是 PDF: ${url}`)
  }
  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

const defaultOptions: CompareOptions = {
  ignore_whitespace: true,
  ignore_header_footer: true,
}

export const apiRouter = Router()

apiRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

apiRouter.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    sendError(res, 400, '缺少文件: file')
    return
  }

  const baseUrl = getBaseUrl(req)
  res.json({
    url: `${baseUrl}/api/uploads/${req.file.filename}`,
    filename: req.file.filename,
  })
})

apiRouter.get('/uploads/:filename', (req, res) => {
  const filePath = path.join(uploadDir, req.params.filename)
  res.sendFile(filePath, (err) => {
    if (err) sendError(res, 404, '文件不存在')
  })
})

apiRouter.post('/compare', async (req, res) => {
  const body = req.body as CompareByUrlRequest

  if (!body.template_url?.trim() || !body.contract_url?.trim()) {
    sendError(res, 400, 'template_url 和 contract_url 不能为空')
    return
  }

  const options: CompareOptions = {
    ignore_whitespace: body.options?.ignore_whitespace ?? defaultOptions.ignore_whitespace,
    ignore_header_footer: body.options?.ignore_header_footer ?? defaultOptions.ignore_header_footer,
  }

  try {
    const [templateContent, contractContent] = await Promise.all([
      fetchPdfBytes(body.template_url),
      fetchPdfBytes(body.contract_url),
    ])

    const result = await comparePdfBuffers(
      bufferToArrayBuffer(templateContent),
      bufferToArrayBuffer(contractContent),
      options,
    )

    const { templatePath, contractPath } = await saveJobPdfs(
      result.job_id,
      templateContent,
      contractContent,
    )

    storeJob({
      jobId: result.job_id,
      templatePath,
      contractPath,
      templateUrl: body.template_url,
      contractUrl: body.contract_url,
      templateName: body.template_name ?? '',
      contractName: body.contract_name ?? '',
      result,
    })

    const response: CompareResponse = {
      job_id: result.job_id,
      status: 'done',
      result,
      message: null,
    }
    res.json(response)
  } catch (err) {
    sendError(res, 400, err instanceof Error ? err.message : '比对失败')
  }
})

apiRouter.get('/compare/:jobId', (req, res) => {
  const result = getJobByResult(req.params.jobId)
  if (!result) {
    sendError(res, 404, '比对结果不存在')
    return
  }

  const response: CompareResponse = {
    job_id: result.job_id,
    status: 'done',
    result,
    message: null,
  }
  res.json(response)
})

apiRouter.get('/files/:jobId/:which', async (req, res) => {
  const { jobId, which } = req.params
  if (which !== 'template' && which !== 'contract') {
    sendError(res, 400, 'which 只能是 template 或 contract')
    return
  }

  const job = getJob(jobId)
  if (job) {
    const targetUrl = which === 'template' ? job.templateUrl : job.contractUrl
    if (targetUrl.startsWith('http')) {
      res.redirect(302, targetUrl)
      return
    }
  }

  try {
    const pdf = await readJobPdf(jobId, which)
    res.setHeader('Content-Type', 'application/pdf')
    res.send(pdf)
  } catch {
    sendError(res, 404, '文件不存在')
  }
})
