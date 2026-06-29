# backend-go 技术说明

PDF 合同比对后端，Go 标准库 HTTP 实现。与 Python（8000）、Java（8001）提供相同 API 与 diff 逻辑，默认端口 **8002**。

## 依赖库

| 库 | 版本 | 用途 |
|---|---|---|
| **Go** | 1.24+ | 语言与标准库 `net/http` |
| **github.com/gen2brain/go-fitz** | 1.28.1 | MuPDF 绑定；打开 PDF、页数统计 |
| **MuPDF（CGO 静态链接）** | 1.28.x | 通过 `fz_print_stext_page_as_json` 提取文本与精确 bbox |
| **github.com/google/uuid** | 1.6.0 | 生成 job_id |

未引入第三方 diff 库，diff 逻辑与 Python/Java 自研行级算法一致。

## 项目结构

```
backend-go/
├── cmd/server/main.go       # HTTP 入口
├── internal/
│   ├── handler/             # Compare / Health 路由与 CORS
│   ├── service/             # 提取 → 行化 → diff → 结果映射
│   │   ├── pdf_extract.go   # MuPDF JSON → TextBlock
│   │   ├── pdf_stext_cgo.go # CGO 调用 MuPDF（需 CGO_ENABLED=1）
│   │   ├── pdf_stext_nocgo.go
│   │   ├── line.go / normalize.go / diff_engine.go / result_mapper.go
│   │   └── compare.go
│   ├── domain/              # TextBlock、LineUnit、RawChange
│   ├── dto/                 # API 结构（JSON snake_case）
│   ├── config/              # 端口、临时目录、上传限制
│   └── apperror/            # 统一错误与 HTTP 状态码
├── go.mod / go.sum
└── Makefile                 # CGO 编译时注入 MuPDF 路径（读 go mod cache）
```

## 实现流程

```
POST /api/compare
    │
    ├─ 校验 PDF、解析 options、创建 job 目录（temp/{jobId}/）
    ├─ 保存 template.pdf / contract.pdf
    │
    ├─ ExtractTextBlocks()
    │     CGO → fz_print_stext_page_as_json
    │     → 解析 blocks/lines，bbox {x,y,w,h} → [x0,y0,x1,y1]
    │
    ├─ BlocksToLines()
    │     按页 + Y 排序，同一视觉行合并 → LineUnit + normalized
    │
    ├─ DiffLines()
    │     分段 content/empty → 行级 diff → []RawChange
    │
    ├─ BuildCompareResult()
    │     → ChangeItem、CompareSummary、两侧 LineInfo
    │
    └─ 写入 result.json，返回 CompareResponse
```

## PDF 文本提取要点

- 使用 MuPDF **结构化文本 JSON**（与 PyMuPDF `get_text("dict")` 同源），避免 HTML 解析带来的 bbox 估算误差。
- JSON 中每行 bbox 为 `{ x, y, w, h }`，转换为左上角坐标 `[x0, y0, x1, y1]`。
- `ignore_header_footer=true` 时跳过页眉页脚区域的页码行。

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

- `job_id`、`status`、`result.summary`、`result.changes`
- `changes[].type`：`delete` | `insert`
- `changes[].template` / `contract`：`{ page, text, bboxes: [[x0,y0,x1,y1]] }`
- `template_lines` / `contract_lines`：全文行列表

错误响应：`{ "detail": "..." }`（与 Python FastAPI 一致）。

## 配置（环境变量）

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | 8002 | 服务端口 |
| `PDF_DIFF_TEMP_DIR` | temp | 任务临时目录（建议设为项目根 `../temp`） |
| `PDF_DIFF_MAX_UPLOAD_SIZE` | 52428800 (50MB) | 单文件大小上限 |

## 启动

**依赖 CGO**。MuPDF 头文件和静态库随 `go-fitz` 下载到 **Go module cache**（`~/go/pkg/mod/`），不需要 `go mod vendor`。

```bash
cd backend-go
make build
PDF_DIFF_TEMP_DIR=../temp ./server
```

或手动指定 CGO 路径：

```bash
FITZ=$(go list -m -f '{{.Dir}}' github.com/gen2brain/go-fitz)
CGO_ENABLED=1 \
  CGO_CFLAGS="-I$FITZ/include" \
  CGO_LDFLAGS="-L$FITZ/libs -lmupdf_darwin_arm64 -lmupdfthird_darwin_arm64 -lm" \
  go build -o server ./cmd/server
```

服务监听 `http://localhost:8002`。

前端通过 Vite 代理 `/api/golang` → `localhost:8002` 访问。

## 为什么需要 Makefile / CGO_CFLAGS

普通 `go build` 会把依赖放在 module cache，但 **CGO 编译 C 代码时**需要告诉编译器 MuPDF 头文件（`.h`）和静态库（`.a`）在哪。`#cgo` 指令里写死 `vendor/` 或 mod cache 绝对路径都不合适，所以用 Makefile 在编译时执行 `go list -m -f '{{.Dir}}' github.com/gen2brain/go-fitz` 动态解析路径——依赖仍在 cache 里，不会复制进项目目录。
