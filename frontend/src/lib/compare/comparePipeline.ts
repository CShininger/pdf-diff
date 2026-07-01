import { blocksToLines } from './lineBuilder'
import { diffLines } from './diffEngine'
import { extractTextBlocks } from './pdfExtract'
import { buildCompareResult } from './resultMapper'
import type { CompareOptions } from './types'
import type { CompareResult } from '../../types/compare'

const defaultOptions: CompareOptions = {
  ignore_whitespace: true,
  ignore_header_footer: true,
}

function generateJobId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16)
}

/** 前端比对主流程：PDF 提取 → 行构建 → 字符 diff → 结果映射 */
export async function comparePdfBuffers(
  templateBuffer: ArrayBuffer,
  contractBuffer: ArrayBuffer,
  options: CompareOptions = defaultOptions,
): Promise<CompareResult> {
  const [templateBlocks, contractBlocks] = await Promise.all([
    extractTextBlocks(templateBuffer, options.ignore_header_footer),
    extractTextBlocks(contractBuffer, options.ignore_header_footer),
  ])

  const templateLines = blocksToLines(templateBlocks, 'tpl', options.ignore_whitespace)
  const contractLines = blocksToLines(contractBlocks, 'con', options.ignore_whitespace)

  const rawChanges = diffLines(templateLines, contractLines)

  return buildCompareResult(generateJobId(), templateLines, contractLines, rawChanges)
}

/** File 入口，读取 ArrayBuffer 后委托 comparePdfBuffers */
export async function comparePdfFiles(
  templateFile: File,
  contractFile: File,
  options: CompareOptions = defaultOptions,
): Promise<CompareResult> {
  const [templateBuffer, contractBuffer] = await Promise.all([
    templateFile.arrayBuffer(),
    contractFile.arrayBuffer(),
  ])
  return comparePdfBuffers(templateBuffer, contractBuffer, options)
}
