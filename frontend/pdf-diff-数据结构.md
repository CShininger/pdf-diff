# PDF Diff 计算过程数据结构汇总

本文档汇总 `frontend/src/lib/compare/` 比对流水线中各阶段出现的数据结构，从 PDF 输入到 UI 可用的 `CompareResult`。

## 流程概览

```
ArrayBuffer (模版 / 合同 PDF)
    │
    ▼  pdfExtract.ts
TextBlock[]
    │
    ▼  lineBuilder.ts
LineUnit[]
    │
    ▼  diffEngine.ts (+ sequenceMatcher.ts)
RawChange[]
    │
    ▼  resultMapper.ts
CompareResult  →  UI (PdfViewer / ChangeList / DiffOverlay)
```

Worker 线程入口：`compareWorker.ts` 接收 `CompareWorkerRequest`，内部调用 `comparePdfBuffers`，返回 `CompareWorkerResponse`。

---

## 1. 输入与配置

### CompareOptions

**定义位置：** `src/lib/compare/types.ts`、`src/types/compare.ts`（两处字段一致）

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| `ignore_whitespace` | `boolean` | 是否忽略空白字符参与比对 |
| `ignore_header_footer` | `boolean` | 是否过滤页眉页脚区域文本 |

默认值（`comparePipeline.ts`）：`ignore_whitespace: true`，`ignore_header_footer: true`。

### 原始输入

| 类型 | 说明 |
| ---- | ---- |
| `ArrayBuffer` | PDF 二进制数据，`comparePdfBuffers` 的直接输入 |
| `File` | 浏览器文件对象，`comparePdfFiles` 读取为 `ArrayBuffer` 后委托 |

---

## 2. PDF 文本提取（pdfExtract.ts）

### CharBBox

**定义位置：** `src/lib/compare/types.ts`

字符级边界框，描述单个字符在 PDF 页面坐标系中的位置。

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| `start` | `number` | 字符在所属文本片段中的起始下标（含） |
| `end` | `number` | 字符在所属文本片段中的结束下标（不含） |
| `bbox` | `number[]` | `[x0, y0, x1, y1]`，页面左上原点坐标 |

### TextBlock

**定义位置：** `src/lib/compare/types.ts`

单页内一行（或一行片段）的提取结果。

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| `page` | `number` | 页码，**0-based** |
| `text` | `string` | 可见文本 |
| `bbox` | `number[]` | 整行/块的外接矩形 `[x0, y0, x1, y1]` |
| `fontSize` | `number` | 平均字号 |
| `charBboxes` | `CharBBox[]` | 行内每个字符的 bbox |

**产出函数：** `extractTextBlocks(data, ignoreHeaderFooter) → Promise<TextBlock[]>`

### ItemEntry（内部，未导出）

**定义位置：** `src/lib/compare/pdfExtract.ts`

PDF.js `TextItem` 解析后的中间结构，用于行聚合，不暴露到流水线外部。

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| `text` | `string` | 清洗水印后的文本 |
| `bbox` | `number[]` | 外接矩形 |
| `charBboxes` | `CharBBox[]` | 字符 bbox |
| `x0`, `y0`, `x1`, `y1` | `number` | bbox 分量，便于排序与行分组 |
| `fontSize` | `number` | 字号 |

---

## 3. 行构建（lineBuilder.ts）

### LineUnit

**定义位置：** `src/lib/compare/types.ts`

比对的基本行单元，模版侧 id 前缀 `tpl`，合同侧前缀 `con`。

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| `id` | `string` | 行唯一 id，如 `tpl_l0`、`con_l12` |
| `page` | `number` | 页码，0-based |
| `text` | `string` | 原始文本 |
| `normalized` | `string` | 规范化文本（去空白、中文标点半角化，见 `normalize.ts`） |
| `bbox` | `number[]` | 行外接矩形 |
| `charBboxes` | `CharBBox[]` | 行内字符 bbox |
| `rawNonWsPositions` | `number[]` | 非空白字符在 `text` 中的原始下标，供 diff 坐标回映射 |

**产出函数：** `blocksToLines(blocks, prefix, ignoreWhitespace) → LineUnit[]`

过滤规则：`normalized` 为空的行会被丢弃。

---

## 4. 字符 Diff 引擎（diffEngine.ts + sequenceMatcher.ts）

### TextStream（内部）

**定义位置：** `src/lib/compare/diffEngine.ts`

将多行 `LineUnit` 拼接为连续字符流，用于字符级 diff。

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| `text` | `string` | 拼接后的 normalized 文本 |
| `charMap` | `CharRef[]` | 流中每个字符对应的行与原始位置 |
| `lines` | `LineUnit[]` | 参与拼接的行列表 |

### CharRef（内部）

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| `lineIndex` | `number` | 在 `lines` 数组中的行下标 |
| `rawPos` | `number` | 该字符在对应行 `text` 中的原始下标 |

### LineRange（内部）

**定义位置：** `src/lib/compare/types.ts`（类型导出），在 `diffEngine.ts` 中构建

描述某一行在 `TextStream.text` 中的字符区间。

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| `lineIndex` | `number` | 行在 `lines` 中的下标 |
| `start` | `number` | 在文本流中的起始字符下标（含） |
| `end` | `number` | 在文本流中的结束字符下标（不含） |

### Opcode

**定义位置：** `src/lib/compare/sequenceMatcher.ts`

字符级 diff 操作码，坐标基于拼接后的文本流。

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| `tag` | `'delete' \| 'insert' \| 'replace' \| 'equal'` | 操作类型 |
| `i1` | `number` | 模版侧区间起点 |
| `i2` | `number` | 模版侧区间终点 |
| `j1` | `number` | 合同侧区间起点 |
| `j2` | `number` | 合同侧区间终点 |

**语义：**

- `delete`：模版 `[i1, i2)` 有内容，合同侧 `[j1, j2)` 为空（通常 `j1 === j2`）
- `insert`：模版 `[i1, i2)` 为空锚点（通常 `i1 === i2`），合同 `[j1, j2)` 为新增内容
- `replace`：两侧均有内容
- `equal`：两侧相同（当前引擎主要产出前三类）

**产出函数：** `getOpcodes(a, b) → Opcode[]`（内部使用 fast-diff）

### PageSlice（内部）

**定义位置：** `src/lib/compare/diffEngine.ts`

将文本流某段 diff 区间按页切分后的片段，用于生成高亮 bbox。

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| `page` | `number` | 页码 |
| `snippet` | `string` | 该页上的差异文本片段 |
| `bboxes` | `number[][]` | 合并后的高亮矩形列表 |
| `refLineIndex` | `number` | 参考行在 `lines` 中的下标 |

### RawChange

**定义位置：** `src/lib/compare/types.ts`

Diff 引擎对外的原始变更记录，尚未转为 UI 层 `ChangeItem`。

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| `type` | `'delete' \| 'insert' \| 'replace' \| 'equal'` | 变更类型 |
| `level` | `'char'` | 当前固定为字符级 |
| `templateLines` | `LineUnit[]` | 模版侧相关行（常为 1 条 snippet 行） |
| `contractLines` | `LineUnit[]` | 合同侧相关行 |
| `templateBboxes` | `number[][] \| null` | 模版侧高亮 bbox；insert 时为蓝色插入锚点 |
| `contractBboxes` | `number[][] \| null` | 合同侧高亮 bbox |

**产出函数：** `diffLines(templateLines, contractLines) → RawChange[]`

**insert 特殊结构：**

- `templateLines`：锚点行（`text` 常为空，`bboxes` 为窄竖条插入标记）
- `contractLines`：实际新增文字及 bbox

---

## 5. 结果映射（resultMapper.ts）

将 `RawChange[]` 转为 UI/API 统一的 `CompareResult`。

### SideInfo

**定义位置：** `src/types/compare.ts`

单侧（模版或合同）的差异展示信息。

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| `page` | `number` | 页码 |
| `text` | `string` | 差异文本或 snippet |
| `bboxes` | `number[][]` | PDF 高亮区域 |

### ChangeItem

**定义位置：** `src/types/compare.ts`

单条可展示、可点击的差异项。

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| `id` | `string` | 如 `c0001`、`c0002` |
| `type` | `ChangeType` | `'equal' \| 'delete' \| 'insert' \| 'replace'` |
| `level` | `ChangeLevel` | `'char' \| 'line'`（当前为 `'char'`） |
| `template` | `SideInfo \| null` | 模版侧；delete/replace/insert 锚点时有值 |
| `contract` | `SideInfo \| null` | 合同侧；insert/replace 时有值 |

### LineInfo

**定义位置：** `src/types/compare.ts`

全文行列表，供侧边栏或调试使用。

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| `id` | `string` | 行 id |
| `page` | `number` | 页码 |
| `text` | `string` | 行文本 |
| `bboxes` | `number[][]` | 通常为单行 bbox 数组 `[line.bbox]` |

### CompareSummary

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| `deleted_lines` | `number` | 删除类变更数 |
| `inserted_lines` | `number` | 新增类变更数 |
| `modified_lines` | `number` | 修改（replace）类变更数 |
| `equal_lines` | `number` | 相同类计数（当前 RawChange 中 equal 较少产出） |

### CompareResult

**定义位置：** `src/types/compare.ts`

流水线最终输出，也是 UI 渲染的主数据结构。

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| `job_id` | `string` | 任务 id（前端本地比对为随机 UUID 截断） |
| `status` | `'done' \| 'error'` | 状态 |
| `summary` | `CompareSummary` | 统计摘要 |
| `changes` | `ChangeItem[]` | 差异列表（不含 equal） |
| `template_lines` | `LineInfo[]` | 模版全文行 |
| `contract_lines` | `LineInfo[]` | 合同全文行 |

**产出函数：** `buildCompareResult(jobId, templateLines, contractLines, rawChanges) → CompareResult`

### CompareResponse（API 包装）

后端 HTTP 接口响应包装，本地前端比对不经过此结构。

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| `job_id` | `string` | 任务 id |
| `status` | `'done' \| 'processing' \| 'error'` | 任务状态 |
| `result` | `CompareResult \| null` | 比对结果 |
| `message` | `string \| null` | 错误或提示信息 |

---

## 6. Web Worker 消息（compareWorker.ts）

### CompareWorkerRequest

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| `id` | `number` | 请求序号，用于回调匹配 |
| `templateBuffer` | `ArrayBuffer` | 模版 PDF |
| `contractBuffer` | `ArrayBuffer` | 合同 PDF |
| `options` | `CompareOptions` | 比对选项 |

### CompareWorkerResponse

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| `id` | `number` | 与请求 id 对应 |
| `result` | `CompareResult` | 成功时的结果 |
| `error` | `string` | 失败时的错误信息 |

---

## 7. 辅助类型与 UI 相关

### ChangeType / ChangeLevel

**定义位置：** `src/types/compare.ts`

```typescript
type ChangeType = 'equal' | 'delete' | 'insert' | 'replace'
type ChangeLevel = 'char' | 'line'
```

### TemplateAnchorMode

控制模版侧 insert 蓝色插入锚点的显示策略（UI 层，非 diff 计算产出）：

```typescript
type TemplateAnchorMode = 'always' | 'on-select'
```

### bbox 坐标约定

- 格式：`[x0, y0, x1, y1]`
- 原点：页面**左上角**
- 单位：PDF 点（pt）
- 多个 bbox 表示同一差异跨字符/跨块的高亮区域，相邻 bbox 会经 `mergeAdjacent()` 合并

---

## 8. 数据结构演变关系

| 阶段 | 主要类型 | 粒度 | 是否含字符 bbox |
| ---- | -------- | ---- | --------------- |
| PDF 提取 | `TextBlock` | 页内行块 | 是 |
| 行构建 | `LineUnit` | 逻辑行 | 是 |
| 文本流 | `TextStream` | 连续字符 | 通过 `charMap` 间接 |
| Diff  opcode | `Opcode` | 字符区间 | 否 |
| 页片段 | `PageSlice` | 页 + snippet | 是（`bboxes`） |
| 原始变更 | `RawChange` | 字符级变更 | 是 |
| 最终结果 | `ChangeItem` / `CompareResult` | UI 可消费 | 是（`SideInfo.bboxes`） |

---

## 9. 关键源文件索引

| 文件 | 职责 |
| ---- | ---- |
| `src/lib/compare/types.ts` | `CharBBox`、`TextBlock`、`LineUnit`、`RawChange`、`CompareOptions` |
| `src/lib/compare/pdfExtract.ts` | PDF → `TextBlock[]` |
| `src/lib/compare/lineBuilder.ts` | `TextBlock[]` → `LineUnit[]` |
| `src/lib/compare/normalize.ts` | 文本规范化 |
| `src/lib/compare/contentFilter.ts` | 过滤页码等非内容行 |
| `src/lib/compare/sequenceMatcher.ts` | `Opcode`、`mergeAdjacent` |
| `src/lib/compare/diffEngine.ts` | `TextStream`、`PageSlice`、`RawChange[]` |
| `src/lib/compare/resultMapper.ts` | `RawChange[]` → `CompareResult` |
| `src/lib/compare/comparePipeline.ts` | 主流程编排 |
| `src/lib/compare/compareWorker.ts` | Worker 消息类型 |
| `src/types/compare.ts` | UI/API 层 `CompareResult`、`ChangeItem` 等 |

---

## 10. 纯粹类型定义（TypeScript）

以下为比对流水线涉及的数据结构在源码中的完整类型定义，按文件分组。

### `src/lib/compare/types.ts`

```typescript
export interface CharBBox {
  start: number
  end: number
  bbox: number[]
}

export interface TextBlock {
  page: number
  text: string
  bbox: number[]
  fontSize: number
  charBboxes: CharBBox[]
}

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

export interface RawChange {
  type: 'delete' | 'insert' | 'replace' | 'equal'
  level: 'char'
  templateLines: LineUnit[]
  contractLines: LineUnit[]
  templateBboxes: number[][] | null
  contractBboxes: number[][] | null
}

export interface CompareOptions {
  ignore_whitespace: boolean
  ignore_header_footer: boolean
}

export interface LineRange {
  lineIndex: number
  start: number
  end: number
}
```

### `src/lib/compare/pdfExtract.ts`（内部）

```typescript
interface ItemEntry {
  text: string
  bbox: number[]
  charBboxes: CharBBox[]
  x0: number
  y0: number
  x1: number
  y1: number
  fontSize: number
}
```

### `src/lib/compare/diffEngine.ts`（内部）

```typescript
interface CharRef {
  lineIndex: number
  rawPos: number
}

interface TextStream {
  text: string
  charMap: CharRef[]
  lines: LineUnit[]
}

interface PageSlice {
  page: number
  snippet: string
  bboxes: number[][]
  refLineIndex: number
}
```

### `src/lib/compare/sequenceMatcher.ts`

```typescript
export interface Opcode {
  tag: 'delete' | 'insert' | 'replace' | 'equal'
  i1: number
  i2: number
  j1: number
  j2: number
}
```

### `src/lib/compare/compareWorker.ts`

```typescript
export interface CompareWorkerRequest {
  id: number
  templateBuffer: ArrayBuffer
  contractBuffer: ArrayBuffer
  options: CompareOptions
}

export interface CompareWorkerResponse {
  id: number
  result?: CompareResult
  error?: string
}
```

### `src/types/compare.ts`

```typescript
export type ChangeType = 'equal' | 'delete' | 'insert' | 'replace'
export type ChangeLevel = 'char' | 'line'

/** 模版侧插入锚点显示方式：始终显示 / 选中右侧绿色标注后才显示 */
export type TemplateAnchorMode = 'always' | 'on-select'

export interface SideInfo {
  page: number
  text: string
  bboxes: number[][]
}

export interface ChangeItem {
  id: string
  type: ChangeType
  level: ChangeLevel
  template: SideInfo | null
  contract: SideInfo | null
}

export interface CompareSummary {
  deleted_lines: number
  inserted_lines: number
  modified_lines: number
  equal_lines: number
}

export interface CompareResult {
  job_id: string
  status: 'done' | 'error'
  summary: CompareSummary
  changes: ChangeItem[]
  template_lines: LineInfo[]
  contract_lines: LineInfo[]
}

export interface LineInfo {
  id: string
  page: number
  text: string
  bboxes: number[][]
}

export interface CompareResponse {
  job_id: string
  status: 'done' | 'processing' | 'error'
  result: CompareResult | null
  message: string | null
}

export interface CompareOptions {
  ignore_whitespace: boolean
  ignore_header_footer: boolean
}
```

### 常用别名约定（源码中未单独定义 type alias）

```typescript
/** 矩形坐标 [x0, y0, x1, y1]，页面左上原点，单位 pt */
type BBox = number[]

/** 多个高亮矩形 */
type BBoxList = number[][]
```
