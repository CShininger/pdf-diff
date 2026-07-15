import type { PdfPageSize } from '../../types/compare'

/** 单个字符在文本中的区间及其 PDF 坐标 bbox [x0,y0,x1,y1] */
export interface CharBBox {
  start: number
  end: number
  bbox: number[]
}

/** PDF 提取的最小文本单元（通常对应一个 text item 或行内片段） */
export interface TextBlock {
  page: number
  text: string
  bbox: number[]
  fontSize: number
  charBboxes: CharBBox[]
}

/** PDF 提取结果：全页 TextBlock 扁平列表 + 每页尺寸 */
export interface PdfExtractResult {
  blocks: TextBlock[]
  pageSizes: PdfPageSize[]
}

/** 比对用的逻辑行：含 normalized 文本与 diff→bbox 映射所需字段 */
export interface LineUnit {
  id: string
  page: number
  text: string
  normalized: string
  bbox: number[]
  charBboxes: CharBBox[]
  /** 非空白字符在 text 中的原始下标，供 diff 映射复用 */
  rawNonWsPositions: number[]
}

/** diff 引擎输出的中间变更结构，尚未转为 API ChangeItem */
export interface RawChange {
  type: 'delete' | 'insert' | 'replace' | 'equal'
  level: 'char'
  templateLines: LineUnit[]
  contractLines: LineUnit[]
  templateBboxes: number[][] | null
  contractBboxes: number[][] | null
}

/** 前端比对选项：空白忽略、页眉页脚过滤 */
export interface CompareOptions {
  ignore_whitespace: boolean
  ignore_header_footer: boolean
}

/** 拼接文本流中某行对应的字符区间 */
export interface LineRange {
  lineIndex: number
  start: number
  end: number
}

/** 拼接文本流中单个字符 → 原始行下标 + 行内 raw 下标的映射 */
export interface CharRef {
  lineIndex: number
  rawPos: number
  /** 所在页码，由 lines[lineIndex].page 填充 */
  page: number
}

/** 分段内删除：模版侧为被删文本区间，合同侧为对应锚点位置 */
export interface SegmentDeleteRange {
  templateStart: number
  templateEnd: number
  contractStart: number
  contractEnd: number
  templateText: string
}

/** 分段内新增：合同侧为新增文本区间，模版侧为对应锚点位置 */
export interface SegmentInsertRange {
  templateStart: number
  templateEnd: number
  contractStart: number
  contractEnd: number
  contractText: string
}

/** 分段内修改（替换）：两侧区间均相对各自分段文本 */
export interface SegmentReplaceRange {
  templateStart: number
  templateEnd: number
  contractStart: number
  contractEnd: number
  templateText: string
  contractText: string
}

/** 锚点分段 diff 结果，供智能体接口消费 */
export interface DiffSegment {
  /** 模版侧本分段 normalized 文本 */
  templateText: string
  /** 合同侧本分段 normalized 文本 */
  contractText: string
  /** 模版侧 charMap，与 templateText 逐字符对应 */
  templateCharMap: CharRef[]
  /** 合同侧 charMap，与 contractText 逐字符对应 */
  contractCharMap: CharRef[]
  /** 删除区间，start/end 分别相对各自分段文本 */
  deletes: SegmentDeleteRange[]
  /** 新增区间，start/end 分别相对各自分段文本 */
  inserts: SegmentInsertRange[]
  /** 修改区间，start/end 分别相对各自分段文本 */
  replaces: SegmentReplaceRange[]
  /** 模版侧在全局拼接文本流中的 [start, end) */
  templateGlobalStart: number
  templateGlobalEnd: number
  /** 合同侧在全局拼接文本流中的 [start, end) */
  contractGlobalStart: number
  contractGlobalEnd: number
}

/** diffLines 完整输出：UI 用 RawChange + 智能体用 DiffSegment + 全局 char 渲染数据 */
export interface DiffLineResult {
  rawChanges: RawChange[]
  diffSegments: DiffSegment[]
  /** 模版侧全局 charMap，与拼接文本流逐字符对应 */
  templateCharMap: CharRef[]
  /** 合同侧全局 charMap，与拼接文本流逐字符对应 */
  contractCharMap: CharRef[]
  /** 模版侧全局逐字符 bbox，与 templateCharMap 一一对应，供智能体返回后渲染 */
  templateCharBboxes: number[][]
  /** 合同侧全局逐字符 bbox，与 contractCharMap 一一对应，供智能体返回后渲染 */
  contractCharBboxes: number[][]
}
