import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { CompareResult } from '../types/compare.js'

export interface JobRecord {
  jobId: string
  templatePath: string
  contractPath: string
  templateUrl: string
  contractUrl: string
  templateName: string
  contractName: string
  result: CompareResult
}

const tempRoot = path.resolve('temp')

export async function ensureTempDir(): Promise<void> {
  await mkdir(tempRoot, { recursive: true })
}

export async function saveJobPdfs(
  jobId: string,
  templateContent: Buffer,
  contractContent: Buffer,
): Promise<{ templatePath: string; contractPath: string }> {
  const jobDir = path.join(tempRoot, jobId)
  await mkdir(jobDir, { recursive: true })

  const templatePath = path.join(jobDir, 'template.pdf')
  const contractPath = path.join(jobDir, 'contract.pdf')
  await Promise.all([
    writeFile(templatePath, templateContent),
    writeFile(contractPath, contractContent),
  ])

  return { templatePath, contractPath }
}

export async function readJobPdf(jobId: string, which: 'template' | 'contract'): Promise<Buffer> {
  const filePath = path.join(tempRoot, jobId, `${which}.pdf`)
  return readFile(filePath)
}

export async function cleanupJob(jobId: string): Promise<void> {
  await rm(path.join(tempRoot, jobId), { recursive: true, force: true })
}

const jobs = new Map<string, JobRecord>()

export function storeJob(record: JobRecord): void {
  jobs.set(record.jobId, record)
}

export function getJob(jobId: string): JobRecord | undefined {
  return jobs.get(jobId)
}

export function getJobByResult(jobId: string): CompareResult | undefined {
  return jobs.get(jobId)?.result
}
