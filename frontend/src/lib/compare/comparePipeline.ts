import { blocksToLines } from './lineBuilder'
import { diffLines } from './diffEngine'
import { extractTextBlocks } from './pdfExtract'
import { buildCompareResult } from './resultMapper'
import type { CompareOptions } from './types'
import fastDiff from 'fast-diff'
import type { CompareResult } from '../../types/compare'

const defaultOptions: CompareOptions = {
  ignore_whitespace: true,
  ignore_header_footer: true,
}

/** 生成 16 位 hex job id */
function generateJobId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16)
}

/** 前端比对主流程：PDF 提取 → 行构建 → 字符 diff → 结果映射 */
export async function comparePdfBuffers(
  templateBuffer: ArrayBuffer,
  contractBuffer: ArrayBuffer,
  options: CompareOptions = defaultOptions,
): Promise<CompareResult> {
  const [templateExtracted, contractExtracted] = await Promise.all([
    extractTextBlocks(templateBuffer, options.ignore_header_footer),
    extractTextBlocks(contractBuffer, options.ignore_header_footer),
  ])
  console.log(
    'ceshi',
    '12345678',
    '12445678',
    fastDiff(
      '工程承包范围：详见施工图和工程量清单、招标文件、发包人明确指令要求完成的其他任务',
      '工程承包范围：详见修改和工程量清单、招标文件、发包人明确指令要求完成的其他任务',
    ),
  )
  console.log({ templateExtracted, contractExtracted })
  // 增加后续需要的属性
  const templateLines = blocksToLines(templateExtracted.blocks, 'tpl', options.ignore_whitespace)
  const contractLines = blocksToLines(contractExtracted.blocks, 'con', options.ignore_whitespace)
  console.log({ templateLines, contractLines })

  const rawChanges = diffLines(templateLines, contractLines)
  console.log({ rawChanges })
  return buildCompareResult(
    generateJobId(),
    templateLines,
    contractLines,
    rawChanges,
    templateExtracted.pageSizes,
    contractExtracted.pageSizes,
  )
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
