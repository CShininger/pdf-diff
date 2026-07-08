import { randomUUID } from 'node:crypto'
import { blocksToLines } from './lineBuilder.js'
import { diffLines } from './diffEngine.js'
import { extractTextBlocks } from './pdfExtract.js'
import { buildCompareResult } from './resultMapper.js'
import type { CompareOptions } from './types.js'
import type { CompareResult } from '../../types/compare.js'

const defaultOptions: CompareOptions = {
  ignore_whitespace: true,
  ignore_header_footer: true,
}

function generateJobId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 16)
}

export async function comparePdfBuffers(
  templateBuffer: ArrayBuffer,
  contractBuffer: ArrayBuffer,
  options: CompareOptions = defaultOptions,
): Promise<CompareResult> {
  const [templateExtracted, contractExtracted] = await Promise.all([
    extractTextBlocks(templateBuffer, options.ignore_header_footer),
    extractTextBlocks(contractBuffer, options.ignore_header_footer),
  ])

  const templateLines = blocksToLines(templateExtracted.blocks, 'tpl', options.ignore_whitespace)
  const contractLines = blocksToLines(contractExtracted.blocks, 'con', options.ignore_whitespace)

  const rawChanges = diffLines(templateLines, contractLines)

  return buildCompareResult(
    generateJobId(),
    templateLines,
    contractLines,
    rawChanges,
    templateExtracted.pageSizes,
    contractExtracted.pageSizes,
  )
}
