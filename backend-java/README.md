# backend-java 技术说明

PDF 合同比对后端，基于 Spring Boot 3 实现。接收两份 PDF（模版 / 正式文件），提取文本与坐标，按行 diff，返回带 bbox 的变更列表供前端高亮展示。

## 依赖库

| 库 | 版本 | 用途 |
|---|---|---|
| **Spring Boot** | 3.3.5 | Web 框架、依赖注入、Multipart 上传、全局异常处理 |
| **spring-boot-starter-web** | (BOM) | REST API、`MultipartFile` 文件上传 |
| **Apache PDFBox** | 3.0.3 | PDF 解析、逐字符位置提取（`PDFTextStripper` / `TextPosition`） |
| **Jackson** | (BOM) | JSON 序列化 / 反序列化，结果持久化与 API 响应 |
| **Java** | 17 | Record、Switch 表达式等语言特性 |

PDFBox 内部还依赖 **FontBox**（字体 bbox 计算），通过 `BboxUtil` 间接使用。

未引入第三方 diff 库（如 java-diff-utils），diff 逻辑为自研行级算法。

## 项目结构

```
com.pdfdiff
├── controller/     CompareController、HealthController
├── service/        核心业务：提取 → 行化 → diff → 结果映射
├── domain/         内部领域模型（TextBlock、LineUnit、RawChange 等）
├── dto/            API 对外数据结构（JSON snake_case）
├── config/         临时目录、上传大小、CORS
└── exception/      ApiException + 全局异常处理
```

## 实现流程

```
POST /api/compare
    │
    ├─ 校验 PDF、解析 options、创建 job 目录（temp/{jobId}/）
    ├─ 保存 template.pdf / contract.pdf
    │
    ├─ PdfExtractService.extractTextBlocks()
    │     PDFBox Loader.loadPDF → PositionCollector(PDFTextStripper)
    │     → 逐字符 TextPosition → 合并为行 → TextBlock（含 bbox、charBboxes）
    │
    ├─ LineService.blocksToLines()
    │     按页 + Y 坐标排序，同一视觉行合并多个 TextBlock → LineUnit
    │     NormalizeService 生成 normalized 文本用于比对
    │
    ├─ DiffEngine.diffLines()
    │     分段（content / empty）→ 行级 diff → List<RawChange>
    │
    ├─ ResultMapper.buildCompareResult()
    │     RawChange → ChangeItem，统计 summary，附带两侧全量行信息
    │
    └─ 写入 result.json，返回 CompareResponse
```

## 各模块实现要点

### 1. PDF 文本提取（PdfExtractService）

- 继承 `PDFTextStripper`，重写 `writeString`，从每个 `TextPosition` 取 Unicode、坐标、字号。
- `BboxUtil.toTopLeftBBox`：将 PDF 左下角坐标系转为**左上角原点** bbox `[x0, y0, x1, y1]`，与前端 Canvas 一致。
- 字符按 Y → X 排序，Y 中心距小于半行高则归为同一行。
- `ignoreHeaderFooter=true` 时，跳过页眉页脚区域内形如纯数字 / `- 1 -` 的页码行。

### 2. 行合并与归一化（LineService + NormalizeService）

- `LineService`：跨 block 合并同一视觉行，拼接文本与 charBboxes，生成 `LineUnit`（id 形如 `tpl_l0` / `con_l0`）。
- `NormalizeService.normalize`：
  - 可选去除全部空白（`ignoreWhitespace`）
  - 中文标点统一为半角（`，→,`、`。→.` 等）
- diff 比对使用 `normalized` 字段，展示仍用原始 `text`。

### 3. Diff 引擎（DiffEngine）

自研**行级** diff，非字符级：

1. **分段** `splitSegments`：空行 → `empty` 段；非空行按段落间距（行高 × 0.75 或换页）切分为 `content` 段。
2. **策略选择**：
   - 两侧 content 段数量相同且 ≥ 2 → 逐段 `diffContentSection`
   - 两侧段数相同且类型一一对应 → `diffBySegments`
   - 否则 → 全文 `diffLineByLine`
3. **单行对齐** `diffContentSection` / `diffRange`：
   - normalized 相同 → 跳过
   - 在后续行中查找匹配 → 决定 insert / delete（启发式：选距离更近的一侧）
   - 剩余尾部 → 批量 delete / insert
4. 输出 `RawChange`（type: `delete` | `insert`，level: `line`）。

### 4. 结果映射（ResultMapper）

- `RawChange` → `ChangeItem`（含 template / contract 侧的 page、text、bbox）
- 汇总 `CompareSummary`：deleted / inserted / modified / equal 行数
- 附带两侧完整 `LineInfo` 列表，供前端渲染全文

### 5. 任务持久化（CompareService）

每个 job 目录结构：

```
temp/{jobId}/
├── template.pdf
├── contract.pdf
└── result.json
```

- `GET /api/compare/{jobId}` 读取 result.json
- `GET /api/files/{jobId}/{template|contract}` 返回 PDF 供前端预览

失败时自动清理 job 目录。

## API

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/compare` | multipart: `template`、`contract`、可选 `options`（JSON 字符串） |
| GET | `/api/compare/{jobId}` | 获取比对结果 |
| GET | `/api/files/{jobId}/{which}` | 获取 PDF（`template` / `contract`） |
| GET | `/health` | 健康检查 |

### options 默认值

```json
{
  "ignore_whitespace": true,
  "ignore_header_footer": true
}
```

### 响应 JSON 字段（snake_case）

- `job_id`、`status`、`summary`、`changes`
- `changes[].type`：`delete` | `insert`
- `changes[].template` / `contract`：`{ page, text, bboxes: [[x0,y0,x1,y1]] }`
- `template_lines` / `contract_lines`：全文行列表

## 配置（application.yml）

| 项 | 默认 | 说明 |
|---|---|---|
| `server.port` | 8001 | 服务端口 |
| `pdf-diff.temp-dir` | temp | 任务临时目录 |
| `pdf-diff.max-upload-size` | 52428800 (50MB) | 单文件大小上限 |
| `spring.jackson.property-naming-strategy` | SNAKE_CASE | JSON 字段命名 |

## 启动

```bash
cd backend-java
mvn spring-boot:run
```

服务监听 `http://localhost:8001`。
