# backend-java 技术说明

PDF 合同比对后端，基于 Spring Boot 3 实现。接收两份 PDF（模版 / 正式文件），提取文本后做**全文字符级 diff**，返回带精确 bbox 的变更列表，供前端在 PDF 上高亮改动文字。

## 依赖库

| 库 | 版本 | 用途 |
|---|---|---|
| **Spring Boot** | 3.3.5 | Web 框架、依赖注入、全局异常处理 |
| **Apache PDFBox** | 3.0.3 | PDF 解析、逐字符位置提取（`PDFTextStripper` / `TextPosition`） |
| **java-diff-utils** | 4.15 | 字符序列 diff（封装于 `SequenceMatcher`） |
| **MyBatis-Plus** | 3.5.9 | 比对历史持久化 |
| **MySQL Connector** | (BOM) | 数据库驱动 |
| **Java** | 17 | Record、Switch 表达式等语言特性 |

PDFBox 内部依赖 **FontBox**（字体 bbox 计算），通过 `BboxUtil` 使用。

## 比对策略

纯文本 diff，不做像素级渲染比对：

| 模块 | 职责 |
|---|---|
| **PdfExtractService** | PDFBox 提取字符坐标 → `TextBlock` |
| **LineService** | 同一视觉行合并 → `LineUnit`（含 charBboxes） |
| **NormalizeService** | 去空白、统一标点，生成 `normalized` 用于比对 |
| **ContentFilter** | 过滤页码行，不参与 diff |
| **DiffEngine** | 全文字符流 diff → `RawChange`（字级 bbox） |
| **ResultMapper** | 映射为 API 响应 |

## 项目结构

```
com.pdfdiff
├── controller/     REST API（CompareController、HealthController）
├── service/        业务接口
├── service/impl/   @Service 实现类
├── mapper/         MyBatis 数据访问（CompareHistoryMapper）
├── entity/         DB 实体（CompareHistory）
├── model/          领域模型（TextBlock、LineUnit、RawChange、CharBBox）
├── dto/            请求对象（CompareOptions、CompareURLRequest）
├── vo/             响应对象（CompareResponse、CompareResult、ChangeItem 等）
├── config/         临时目录、MinIO、MyBatis 配置
├── exception/      ApiException + 全局异常处理
├── util/           BboxUtil、SequenceMatcher、ContentFilter
└── common/         AppConstants
```

## 实现流程

```
POST /api/compare  (JSON: template_url + contract_url)
    │
    ├─ MinioService 下载 PDF
    ├─ 校验 PDF、解析 options、创建 job 临时目录
    │
    ├─ PdfExtractService.extractTextBlocks()
    │     PDFBox → 逐字符 TextPosition → 按 Y/X 合并为行 → TextBlock
    │
    ├─ LineService.blocksToLines()
    │     同一视觉行合并 block → LineUnit（text + normalized + bbox + charBboxes）
    │
    ├─ DiffEngine.diffLines()
    │     ContentFilter 排除页码
    │     → 全文拼接 normalized 字符流（跨页、忽略换行）
    │     → 字级 SequenceMatcher diff
    │     → 映射回 charBboxes，仅输出改动字符的 bbox
    │
    ├─ ResultMapper.buildCompareResult()
    │
    └─ HistoryService 保存历史，返回 CompareResponse
```

## 各模块要点

### 1. PDF 文本提取（PdfExtractService）

- 继承 `PDFTextStripper`，从每个 `TextPosition` 取 Unicode、坐标、字号。
- `BboxUtil.toTopLeftBBox`：PDF 左下角坐标 → 左上角原点 bbox，与前端 Canvas 一致。
- 字符按 Y → X 排序，Y 中心距小于半行高则归为同一行。
- `ignoreHeaderFooter=true` 时，过滤页眉页脚区域的页码行（`ContentFilter.isPageNumber`）。

### 2. 行合并与归一化（LineService + NormalizeService）

- `LineService`：跨 block 合并同一视觉行，拼接文本与 charBboxes。
- `NormalizeService.normalize`：
  - 可选去除全部空白（`ignoreWhitespace`）
  - 中文标点统一为半角（`，→,`、`。→.` 等）
- diff 比对用 `normalized`，展示用原始 `text`。

### 3. 内容过滤（ContentFilter）

排除页码类文本，不参与 diff：

- 纯数字、`1/10`、`- 1 -`、`第3页`、`Page 1` 等

### 4. 文本 Diff 引擎（DiffEngine）

**全文字符流 diff**，不按行、不按页分段比对：

1. **构建字符流**：所有 `LineUnit` 的 `normalized` 按阅读顺序拼接为一条连续字符串；换行、分页位置不插入分隔符。
2. **字符映射**：每个 normalized 字符映射到 `(lineIndex, rawPos)`，用于反查 PDF bbox。
3. **字级 diff**：`SequenceMatcher` 对字符 token 序列做 diff，产生 delete / insert / replace opcode。
4. **排版过滤**：若某段文本已出现在对方全文中（仅因换行/分页位置不同），不报 diff。
5. **行末连字符**：拼接时自动去除 PDF 换行断词产生的 `-`。
6. **高亮输出**：按页拆分变更，每条 `RawChange` 的 bbox 仅覆盖实际改动的字符，不整行高亮。

### 5. 结果映射（ResultMapper）

- `RawChange` → `ChangeItem`（`level: "char"`）
- 无 bbox 的变更不输出 SideInfo（前端不画整行高亮）
- 汇总 `CompareSummary`：deleted / inserted / modified 计数

### 6. 历史持久化（HistoryService）

- 比对结果写入 MySQL，PDF 文件存于 MinIO
- `GET /api/files/{jobId}/{template|contract}` 302 重定向至 MinIO URL

## API

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/compare` | JSON body：`template_url`、`contract_url`、可选 `options` |
| POST | `/api/upload` | multipart 上传 PDF 至 MinIO |
| GET | `/api/history` | 比对历史列表（`limit` / `offset`） |
| GET | `/api/history/{historyId}` | 单条历史详情 |
| GET | `/api/compare/{jobId}` | 获取比对结果 |
| GET | `/api/files/{jobId}/{which}` | 获取 PDF（`template` / `contract`） |
| GET | `/health` | 健康检查 |

前端通过代理访问时路径为 `/api/java/...`。

### options 默认值

```json
{
  "ignore_whitespace": true,
  "ignore_header_footer": true
}
```

| 选项 | 影响 |
|---|---|
| `ignore_whitespace` | NormalizeService 去除空白后再比对 |
| `ignore_header_footer` | 提取时过滤页眉页脚区域的页码行 |

### 响应 JSON 字段（snake_case）

- `job_id`、`status`、`summary`、`changes`
- `changes[].type`：`delete` | `insert` | `replace`
- `changes[].level`：`char`
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
| `spring.datasource.*` | 环境变量 `MYSQL_*` | MySQL 连接 |

## 启动

```bash
cd backend-java
mvn spring-boot:run
```

服务监听 `http://localhost:8001`。
