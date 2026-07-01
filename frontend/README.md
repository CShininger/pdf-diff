# PDF Diff Frontend

PDF 合同比对工具的前端界面。用户上传模版 PDF 与正式 PDF，调用后端比对接口，并排展示两份文档并在差异位置高亮标注。

## 技术栈

| 依赖       | 版本    | 用途                        |
| ---------- | ------- | --------------------------- |
| React      | ^19.2   | UI 框架                     |
| TypeScript | ~6.0    | 类型安全                    |
| Vite       | ^8.1    | 构建与 dev server           |
| react-pdf  | ^10.4   | PDF 渲染（基于 pdfjs-dist） |
| pdfjs-dist | 5.4.296 | PDF.js 引擎                 |
| oxlint     | ^1.69   | 代码检查                    |

## 目录结构

```
frontend/src/
├── main.tsx                 # 入口
├── App.tsx                  # 根组件，上传/结果视图切换
├── App.css                  # 全局样式
├── types/
│   └── compare.ts           # 与后端对齐的 TypeScript 类型
├── hooks/
│   └── useCompare.ts        # 比对接口调用与状态管理
└── components/
    ├── UploadPanel.tsx      # 双 PDF 上传表单
    ├── DiffSideBySide.tsx   # 并排 diff 主布局
    ├── PdfViewer.tsx        # 单份 PDF 渲染 + 高亮
    ├── DiffOverlay.tsx      # SVG 差异高亮层
    └── ChangeList.tsx       # 差异列表面板
```

## 启动方式

```bash
cd frontend
npm install
npm run dev
```

默认访问 `http://localhost:5173`。开发环境下 Vite 将 `/api` 代理到 `http://localhost:8000`（见 `vite.config.ts`）。

```bash
npm run build    # 生产构建
npm run preview  # 预览构建产物
```

**前提**：后端需已在 8000 端口运行。

## 页面流程

```
┌─────────────────────────────────────────┐
│  App（无 result）                        │
│  ├── UploadPanel：选择模版 + 正式 PDF    │
│  └── 点击「开始比对」→ useCompare.compare │
└─────────────────────────────────────────┘
                    ↓ POST /api/compare
┌─────────────────────────────────────────┐
│  App（有 result）                        │
│  └── DiffSideBySide                     │
│       ├── summary-bar（统计摘要）        │
│       ├── PdfViewer × 2（左右并排）     │
│       └── ChangeList（差异列表）         │
└─────────────────────────────────────────┘
```

## 组件说明

### App.tsx

根组件，负责视图切换：

- **上传阶段**：渲染 `UploadPanel`，展示 loading 和 error
- **结果阶段**：渲染 `DiffSideBySide`，提供「重新上传」按钮（调用 `reset()`）

状态全部来自 `useCompare()` hook，无全局状态库。

### UploadPanel.tsx

双文件上传表单：

- 模版 PDF（招标文件）
- 正式 PDF（业主合同）
- 两个文件都选中且非 loading 时，「开始比对」按钮才可点击
- 通过 `onCompare(template, contract)` 回调触发比对

### useCompare.ts

封装比对接口的自定义 Hook：

```typescript
const { loading, error, result, compare, reset } = useCompare()
```

**compare 流程**：

1. 构建 `FormData`：`template`、`contract`、`options`（JSON 字符串）
2. `POST /api/compare`
3. 成功 → 设置 `result`；失败 → 设置 `error`

**默认 options**：

```typescript
{
  ignore_whitespace: true,
  ignore_header_footer: true,
}
```

### DiffSideBySide.tsx

比对结果主布局，三块区域：

1. **summary-bar**：展示删除/新增/修改/未改行数
2. **pdf-columns**：左右两个 `PdfViewer`
3. **ChangeList**：底部差异列表

**联动逻辑**：

- `activeChangeId` 状态：当前选中的差异项
- 选中后计算 `scrollPage`，驱动两侧 PDF 滚动到对应页
- PDF 文件 URL：
  - 模版：`/api/files/{job_id}/template`
  - 正式：`/api/files/{job_id}/contract`

### PdfViewer.tsx

基于 `react-pdf` 渲染单份 PDF：

- 使用 `Document` + 逐页 `Page` 组件
- 关闭 textLayer 和 annotationLayer（`renderTextLayer={false}`）
- 每页加载成功后记录 PDF 原始尺寸（`pdfWidth`、`pdfHeight`）
- 根据 `changes` 和当前 `side`（template/contract）筛选该页需高亮的差异
- 在 PDF 页面上方叠加 `DiffOverlay` SVG 层

**滚动定位**：

- 每页 DOM id 为 `{side}-page-{pageNumber}`（pageNumber 从 1 开始）
- `scrollToPage` 变化时，`scrollIntoView({ behavior: 'smooth', block: 'center' })`

**页码约定**：

- 后端 `page` 为 0-based（0 = 第 1 页）
- 前端渲染和滚动使用 1-based pageNumber

### DiffOverlay.tsx

SVG 矩形高亮层，覆盖在 PDF 页面上：

- `viewBox` 使用 PDF 原始坐标系
- `preserveAspectRatio="none"` 使 SVG 随 PDF 缩放拉伸对齐
- 颜色：模版侧 `rgba(248, 113, 113, 0.45)`（红），正式侧 `rgba(74, 222, 128, 0.45)`（绿）
- `active` 状态时加粗边框（红 `#dc2626` / 绿 `#16a34a`）

坐标来自后端返回的 `bboxes: [[x0, y0, x1, y1], ...]`。

### ChangeList.tsx

差异列表面板：

- 过滤掉 `type === 'equal'` 的项
- 每项显示：类型 badge（删除/新增/修改）、id、模版文本、正式文本
- 点击某项 → `onSelect(change.id)` → 更新 `activeChangeId`，联动 PDF 高亮和滚动
- 空文本显示为 `(空行)`

## 类型定义（compare.ts）

与后端 Pydantic schema 一一对应：

| 类型              | 说明                                           |
| ----------------- | ---------------------------------------------- |
| `CompareOptions`  | 比对选项                                       |
| `SideInfo`        | 单侧行信息（page、text、bboxes）               |
| `ChangeItem`      | 单条差异                                       |
| `LineInfo`        | 行信息                                         |
| `CompareSummary`  | 统计摘要                                       |
| `CompareResult`   | 完整比对结果                                   |
| `CompareResponse` | API 响应包装                                   |
| `ChangeType`      | `'equal' \| 'delete' \| 'insert' \| 'replace'` |

## API 调用

| 方法 | 路径                           | 调用位置                       | 说明                     |
| ---- | ------------------------------ | ------------------------------ | ------------------------ |
| POST | `/api/compare`                 | `useCompare.ts`                | 上传并比对，同步返回结果 |
| GET  | `/api/files/{job_id}/template` | `DiffSideBySide` → `PdfViewer` | 加载模版 PDF             |
| GET  | `/api/files/{job_id}/contract` | `DiffSideBySide` → `PdfViewer` | 加载正式 PDF             |

`GET /api/compare/{job_id}` 后端已实现，前端当前未使用（比对为同步 POST 一次返回）。

## 开发代理

`vite.config.ts`：

```typescript
server: {
  proxy: {
    '/api': 'http://localhost:8000',
  },
}
```

前端所有 `/api/*` 请求在开发时转发到后端，无需配置 CORS。

## 交互特性

- **并排对比**：左右同步展示模版与正式 PDF
- **差异高亮**：delete 在模版侧标红，insert 在正式侧标绿
- **列表联动**：点击差异列表项 → 两侧滚动到对应页 + 高亮边框加粗
- **统计摘要**：顶部展示各类差异行数
- **重新上传**：结果页可 reset 回到上传界面

## 样式

全部使用 `App.css` 中的 CSS class，无 CSS-in-JS 或 UI 组件库。主要 class：

- `.upload-panel` / `.upload-card`：上传区域
- `.diff-layout` / `.pdf-columns`：并排布局
- `.pdf-pane` / `.pdf-page-wrap`：PDF 容器
- `.diff-overlay`：SVG 高亮层（absolute 定位覆盖 PDF）
- `.change-list` / `.change-item`：差异列表
- `.badge-delete` / `.badge-insert`：类型标签

## 已知局限

- 未使用 `template_lines` / `contract_lines` 完整行列表（仅使用 `changes`）
- 无分页加载，大 PDF 会一次性渲染所有页
- 无 diff 选项 UI（options 使用默认值，用户不可配置）
- 无离线/缓存，刷新页面需重新上传
