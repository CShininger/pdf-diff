# PDF Diff Backend

PDF 合同比对服务的 Python 后端。接收两份 PDF（模版 + 正式合同），提取文本与坐标，进行行级 diff，返回带 bbox 的差异结果供前端高亮展示。

## 技术栈

| 依赖 | 版本要求 | 用途 |
|------|----------|------|
| FastAPI | ≥0.115 | Web 框架、路由、自动 OpenAPI |
| uvicorn | ≥0.32 | ASGI 服务器 |
| python-multipart | ≥0.12 | 解析 multipart/form-data 文件上传 |
| PyMuPDF (fitz) | ≥1.24 | PDF 文本块与坐标提取 |
| Pydantic | ≥2.9 | 请求/响应数据校验与序列化 |
| difflib（标准库） | — | 行级 LCS 对齐 + 行内字级 diff |
| pymysql | ≥1.1 | 比对历史持久化（可选） |

## 目录结构

```
backend/
├── app/
│   ├── main.py              # FastAPI 入口、CORS、路由注册
│   ├── config.py            # 临时目录、上传大小等常量
│   ├── api/
│   │   └── compare.py       # 比对相关 HTTP 接口
│   ├── models/
│   │   └── schemas.py       # Pydantic API 契约
│   └── services/
│       ├── types.py         # 内部 dataclass（TextBlock、LineUnit 等）
│       ├── content_filter.py # 页码/页眉页脚/ boilerplate 过滤
│       ├── pdf_extract.py   # PDF → TextBlock 列表（含字符级 bbox）
│       ├── line.py          # TextBlock → LineUnit 行合并
│       ├── normalize.py     # 文本归一化（比对用）
│       ├── diff_engine.py   # 语义 diff：段落对齐 → 行级 LCS → 字级高亮
│       ├── mapper.py        # RawChange → API 响应结构
│       ├── history_db.py    # MySQL 历史记录
│       └── minio_client.py  # 文件下载
├── temp/                    # 运行时任务目录（按 job_id 隔离）
└── requirements.txt
```

## 启动方式

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

- 健康检查：`GET http://localhost:8000/health`
- API 文档：`http://localhost:8000/docs`

## API 接口

### POST `/api/compare`

上传两份 PDF 并同步返回比对结果。

**请求**（`multipart/form-data`）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `template` | File | 模版 PDF（招标文件） |
| `contract` | File | 正式 PDF（业主合同） |
| `options` | string | JSON 字符串，见 CompareOptions |

**CompareOptions**：

```json
{
  "ignore_whitespace": true,
  "ignore_header_footer": true
}
```

**响应**（`CompareResponse`）：

```json
{
  "job_id": "uuid",
  "status": "done",
  "result": {
    "job_id": "uuid",
    "status": "done",
    "summary": {
      "deleted_lines": 0,
      "inserted_lines": 0,
      "modified_lines": 0,
      "equal_lines": 0
    },
    "changes": [],
    "template_lines": [],
    "contract_lines": []
  }
}
```

**错误码**：

- `400`：非 PDF、options 无效、文件超过 50MB
- `500`：解析或比对过程异常

### GET `/api/compare/{job_id}`

读取已缓存的比对结果（`temp/{job_id}/result.json`）。

### GET `/api/files/{job_id}/{which}`

返回任务中的 PDF 文件。`which` 只能是 `template` 或 `contract`。

## 核心处理流程

```
上传 PDF
  ↓
保存到 temp/{job_id}/template.pdf、contract.pdf
  ↓
extract_text_blocks()     PDF → TextBlock[]
  ↓
blocks_to_lines()         TextBlock[] → LineUnit[]（行合并 + 归一化）
  ↓
diff_lines()              LineUnit[] × 2 → RawChange[]
  ↓
build_compare_result()    RawChange[] → CompareResult
  ↓
写入 result.json，返回 CompareResponse
```

### 1. PDF 文本提取（`pdf_extract.py`）

使用 PyMuPDF 的 `page.get_text("dict")` 获取结构化文本：

```
Page → blocks (type=0) → lines → spans (text, bbox, size)
```

产出 `TextBlock`：

- `page`：0-based 页码
- `text`：行文本（含空行）
- `bbox`：`(x0, y0, x1, y1)`，PDF 坐标系（原点左上）
- `font_size`：字号
- `char_bboxes`：字符级 bbox（按 span 宽度均分估算，供行内 diff 高亮）

**页眉页脚过滤**（`ignore_header_footer=True`，见 `content_filter.py`）：

- 页面顶部/底部各 8% 区域内文本跳过
- 页码（纯数字、`第X页`、`- 1 -` 等）全局跳过
- 机密/版权等 boilerplate 短文本跳过

### 2. 行合并（`line.py`）

PDF 中同一视觉行可能被拆成多个 block。合并规则：

1. 按 `(page, y, x)` 排序所有 block
2. 相邻 block 若 Y 轴中心距 < 行高 × 0.5，视为同一行
3. 同行 block 横向拼接 text 和 char_bboxes

产出 `LineUnit`：

- `id`：`tpl_l0` / `con_l0` 等
- `text`：原始文本（用于展示）
- `normalized`：归一化文本（用于比对）
- `bbox`：整行包围盒

### 3. 文本归一化（`normalize.py`）

比对时使用 `normalized` 字段，展示仍用原始 `text`：

- 去除首尾空白
- 可选去除所有空白字符（`ignore_whitespace`）
- 中文标点转英文：`，`→`,`、`（`→`(`、`：`→`:` 等

### 4. Diff 引擎（`diff_engine.py`）

语义文本比对，参考 iLovePDF「语义文本」模式：**段落对齐 → 行级 LCS → 行内字级高亮**。

整体策略：展示用原始 `text`，对齐用 `normalized`（见 `normalize.py`），高亮坐标来自 `char_bboxes`。

#### 4.1 分段（`_split_segments`）

将 LineUnit 列表切分为交替的 `content` / `empty` 段：

- **empty 段**：连续 `normalized == ""` 的空行
- **content 段**：非空行，遇到以下情况切段：
  - 换页（`page` 变化）
  - 段落间距 > 上一行高度 × 0.75

#### 4.2 段落级对齐

若两侧分段数量相同且类型序列一致（`empty`/`content` 交替对齐），则**逐段**调用 `_diff_content_section`；否则对全文 fallback 到 `_diff_line_sequence`。

#### 4.3 行级 LCS（`_diff_line_sequence`）

使用 `difflib.SequenceMatcher`（`autojunk=False`）对两侧 `normalized` 行文本做 LCS 对齐，按 opcode 产出：

| opcode | 产出类型 | 说明 |
|--------|----------|------|
| `equal` | — | 跳过 |
| `delete` | `delete` | 模版侧整行删除 |
| `insert` | `insert` | 正式侧整行新增 |
| `replace` | `replace` | 进入 `_diff_replace_block` 进一步处理 |

#### 4.4 替换块处理（`_diff_replace_block`）

`replace` 区块内再次细分：

- **等长行**：逐行配对，调用 `_diff_line_pair` 产出 `replace`
- **单行对单行**：直接 `_diff_line_pair`
- **不等长**：子 SequenceMatcher 递归，或 `_pair_replace_lines` 按位置配对后，剩余行分别 delete/insert

#### 4.5 行内字级高亮（`_diff_line_pair` / `_char_diff_bboxes`）

对 `replace` 类型的行对：

1. 用 `SequenceMatcher` 比较原始 `text`（非 normalized）
2. 提取本行相对另一行**有差异**的字符区间（`delete` / `replace` opcode 的 `i1:i2`）
3. 通过 `char_bboxes` 映射为 PDF 坐标 bbox 列表
4. 相邻 bbox 同行且相触则 `_merge_bboxes` 合并

**高亮规则**：

- 仅变更侧有差异 → 该侧返回精确 bbox，另一侧返回 `[]`（不高亮）
- 例如地址末尾追加「A座15层」：仅正式 PDF 末尾 5 个字高亮，模版侧无框
- 例如下划线替换为实际值：两侧仅下划线/新值区域高亮，非整行

`delete` / `insert` 类型使用整行 bbox（`mapper` 中 `bboxes_override=None` 时取 `line.bbox`）。

#### 4.6 RawChange 结构

```python
@dataclass
class RawChange:
    type: str                          # delete | insert | replace
    level: str                         # "line"
    template_lines: list[LineUnit]
    contract_lines: list[LineUnit]
    template_bboxes: list[tuple] | None   # replace 时为字级 bbox 列表，可为 []
    contract_bboxes: list[tuple] | None
```

### 5. 结果映射（`mapper.py`）

`RawChange` → `ChangeItem`：

- 每条变更带 `id`（`c0001`…）、`type`、`level: "line"`
- `template` / `contract`：`SideInfo`（page、text、bboxes）
  - `bboxes_override is not None` 时直接使用（含空列表，表示该侧无需高亮）
  - 否则 fallback 到整行 `line.bbox`
- 同时返回完整 `template_lines` / `contract_lines` 供前端参考

`CompareSummary` 统计 `deleted_lines` / `inserted_lines` / `modified_lines`。

## 数据模型

### API 层（Pydantic，`schemas.py`）

| 模型 | 说明 |
|------|------|
| `CompareOptions` | 比对选项 |
| `SideInfo` | 单侧行信息（page、text、bboxes） |
| `ChangeItem` | 单条差异 |
| `LineInfo` | 完整行列表项 |
| `CompareSummary` | 统计摘要 |
| `CompareResult` | 完整比对结果 |
| `CompareResponse` | HTTP 响应包装 |

### 内部层（dataclass，`types.py`）

| 模型 | 说明 |
|------|------|
| `CharBBox` | 字符区间与 bbox |
| `TextBlock` | PDF 提取的文本块 |
| `LineUnit` | 合并后的逻辑行 |
| `RawChange` | diff 引擎原始输出（含字级 bboxes） |

## 存储与任务管理

- 每个比对任务生成 UUID 作为 `job_id`
- 目录 `temp/{job_id}/` 包含：
  - `template.pdf`
  - `contract.pdf`
  - `result.json`
- 失败时自动 `shutil.rmtree` 清理任务目录
- 无数据库、无过期清理、无鉴权（适合本地/内网 demo）

## 配置项（`config.py`）

| 常量 | 默认值 | 说明 |
|------|--------|------|
| `TEMP_DIR` | `backend/temp/` | 临时文件根目录 |
| `MAX_UPLOAD_SIZE` | 50MB | 单文件上传上限 |
| `HEADER_FOOTER_RATIO` | 0.08 | 页眉页脚区域比例（在 pdf_extract 中使用） |

## 已知局限

- 字符 bbox 按 span 宽度均分估算，中英文混排时高亮位置可能有轻微偏差
- 行级 LCS 对大幅段落重排、插入整节内容时，对齐可能不够理想
- CPU 密集型操作在 async 路由中同步执行，大 PDF 可能阻塞 event loop
- 临时文件无自动清理机制
