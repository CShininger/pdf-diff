# backend-java 技术说明

PDF 合同比对后端，基于 Spring Boot 3 实现。接收两份 PDF（模版 / 正式文件），采用 **PdfCompare 像素比对 + 自研行级文本 diff** 的混合方案，返回带 bbox 的变更列表供前端高亮展示。

## 依赖库

| 库 | 版本 | 用途 |
|---|---|---|
| **Spring Boot** | 3.3.5 | Web 框架、依赖注入、全局异常处理 |
| **spring-boot-starter-web** | (BOM) | REST API |
| **Apache PDFBox** | 3.0.3 | PDF 解析、逐字符位置提取（`PDFTextStripper` / `TextPosition`） |
| **PdfCompare** (`de.redsix:pdfcompare`) | 1.2.3 | 像素级 PDF 渲染比对，判断是否有视觉差异 |
| **Jackson** | (BOM) | JSON 序列化 / 反序列化，结果持久化与 API 响应 |
| **MySQL Connector** | (BOM) | 比对历史持久化 |
| **Java** | 17 | Record、Switch 表达式等语言特性 |

PDFBox 内部还依赖 **FontBox**（字体 bbox 计算），通过 `BboxUtil` 间接使用。

行级 diff 为自研算法（`DiffEngine`），未引入 java-diff-utils 等第三方文本 diff 库。

## 比对策略（混合方案）

PdfCompare 将 PDF 渲染为位图后逐像素比对，能检出排版、字体、图片等视觉差异；但其 `getDifferences()` 会把一页内所有差异合并为**一个大矩形**，不适合直接用作前端高亮 bbox。

因此采用分工：

| 模块 | 职责 |
|---|---|
| **PdfCompareService** | 像素级视觉检测：判断两份 PDF 是否相等、哪些页存在差异 |
| **DiffEngine** | 行级文本 diff：生成精确的 delete / insert / replace 变更及行 bbox |
| **ResultMapper** | 将文本 diff 结果映射为 API 响应（含行级高亮坐标） |
| **PdfCompareResultMapper** | 兜底：有视觉差异但提取不到文本时，仅返回页级提示（不含 bbox） |

`CompareService.buildResult()` 合并逻辑：

1. **PdfCompare 判定相等** → 返回空变更列表（忽略文本 diff 可能的误报）
2. **有差异且文本 diff 有结果** → 使用 `ResultMapper` 的行级 bbox 高亮
3. **有视觉差异但无文本变更**（如纯图片差异）→ 使用 `PdfCompareResultMapper`，在变更列表提示「第 N 页存在视觉差异」，不画 bbox

## 项目结构

```
com.pdfdiff
├── controller/     REST API（CompareController、HealthController）
├── service/        业务接口（CompareService、HistoryService 等）
├── service/impl/   @Service 实现类
├── repository/     JDBC 数据访问（CompareHistoryRepository）
├── entity/         DB 实体（CompareHistory）
├── model/          内部领域模型（TextBlock、LineUnit、RawChange 等）
├── dto/            请求对象（CompareOptions、CompareURLRequest、DownloadedFile）
├── vo/             响应对象（CompareResponse、CompareResult、HistoryItem 等）
├── config/         临时目录、上传大小、MinIO、CORS
├── exception/      ApiException + 全局异常处理
├── util/           BboxUtil 等工具类
└── common/         AppConstants 等共享常量
```

## 实现流程

```
POST /api/compare  (JSON: template_url + contract_url)
    │
    ├─ MinioService 下载 PDF
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
    ├─ PdfCompareService.compare()          ← 并行职责：视觉检测
    │     PdfComparator（300 DPI，CompareResultWithPageOverflow）
    │     ignore_header_footer → PageArea 排除页眉页脚区域
    │
    ├─ DiffEngine.diffLines()               ← 并行职责：行级文本 diff
    │     分段（content / empty）→ 行级 diff → List<RawChange>
    │
    ├─ CompareService.buildResult()         ← 合并两者结果
    │     ├─ 视觉相等 → 空变更
    │     ├─ 有文本变更 → ResultMapper（行级 bbox）
    │     └─ 仅视觉差异 → PdfCompareResultMapper（页级提示，无 bbox）
    │
    └─ 写入 result.json，HistoryService 保存历史，返回 CompareResponse
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

### 3. 像素比对（PdfCompareService）

- 使用 `de.redsix.pdfcompare.PdfComparator`，默认 300 DPI 渲染后逐像素比对。
- 使用 `CompareResultWithPageOverflow` 控制大文件内存占用。
- `ignoreHeaderFooter=true` 时，通过 `PageArea` 排除每页顶部 / 底部 8% 区域（像素坐标），与文本提取的页眉页脚过滤对应。
- `ignoreWhitespace` 对像素比对无效，仅影响文本 diff。

### 4. 文本 Diff 引擎（DiffEngine）

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
4. 输出 `RawChange`（type: `delete` | `insert` | `replace`，level: `line`）。

### 5. 结果映射（ResultMapper / PdfCompareResultMapper）

**ResultMapper**（常规路径）：

- `RawChange` → `ChangeItem`（含 template / contract 侧的 page、text、行级 bbox）
- 汇总 `CompareSummary`：deleted / inserted / modified / equal 行数
- 附带两侧完整 `LineInfo` 列表

**PdfCompareResultMapper**（兜底路径）：

- 遍历 `getPagesWithDifferences()`，生成 type=`replace` 的变更项
- 文本为「第 N 页存在视觉差异」，`bboxes` 为空列表，避免整页被高亮覆盖

### 6. 任务持久化（CompareService）

每个 job 目录结构：

```
temp/{jobId}/
├── template.pdf
├── contract.pdf
└── result.json
```

- `GET /api/compare/{jobId}` 读取 result.json
- `GET /api/files/{jobId}/{template|contract}` 返回 PDF 供前端预览
- 比对完成后通过 `HistoryService` 写入 MySQL

失败时自动清理 job 目录。

## API

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/compare` | JSON body：`template_url`、`contract_url`、可选 `options`、文件名 |
| POST | `/api/upload` | multipart 上传 PDF 至 MinIO，返回 URL |
| GET | `/api/history` | 比对历史列表（`limit` / `offset`） |
| GET | `/api/history/{historyId}` | 单条历史详情（含完整 result） |
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

| 选项 | 影响范围 |
|---|---|
| `ignore_whitespace` | 仅文本 diff（NormalizeService） |
| `ignore_header_footer` | 文本提取过滤页码行 + PdfCompare 排除页眉页脚区域 |

### 响应 JSON 字段（snake_case）

- `job_id`、`status`、`summary`、`changes`
- `changes[].type`：`delete` | `insert` | `replace`
- `changes[].template` / `contract`：`{ page, text, bboxes: [[x0,y0,x1,y1]] }`
- `template_lines` / `contract_lines`：全文行列表

## 配置（application.yml）

| 项 | 默认 | 说明 |
|---|---|---|
| `server.port` | 8001 | 服务端口 |
| `pdf-diff.temp-dir` | temp | 任务临时目录 |
| `pdf-diff.max-upload-size` | 52428800 (50MB) | 单文件大小上限 |
| `pdf-diff.minio-endpoint` | 环境变量 `MINIO_ENDPOINT` | MinIO 地址 |
| `pdf-diff.minio-bucket` | 环境变量 `MINIO_BUCKET` | MinIO 存储桶 |
| `spring.datasource.*` | 环境变量 `MYSQL_*` | MySQL 连接（比对历史） |
| `spring.jackson.property-naming-strategy` | SNAKE_CASE | JSON 字段命名 |

## 启动

```bash
cd backend-java
mvn spring-boot:run
```

服务监听 `http://localhost:8001`。
