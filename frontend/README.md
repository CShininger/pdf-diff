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
│   └── compare.ts           # 比对类型（含 TemplateAnchorMode）
├── hooks/
│   ├── useCompare.ts        # 后端比对接口调用
│   └── useFrontendCompare.ts # 前端本地比对
├── lib/compare/
│   ├── diffEngine.ts        # 字符级 diff + 插入锚点计算
│   └── resultMapper.ts      # RawChange → CompareResult
└── components/
    ├── UploadPanel.tsx      # 双 PDF 上传表单
    ├── DiffSideBySide.tsx   # 并排 diff 主布局 + 插入点模式
    ├── PdfViewer.tsx        # 单份 PDF 渲染 + 高亮 + 点击联动
    ├── DiffOverlay.tsx      # SVG 差异高亮层（红/绿/蓝）
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

1. **summary-bar**：展示删除/新增/修改行数，以及「插入点显示」模式切换
2. **pdf-columns**：左右两个 `PdfViewer`
3. **ChangeList**：底部差异列表

**联动逻辑**：

- `activeChangeId` 状态：当前选中的差异项
- 模版、合同各自计算 `scrollToPage`，驱动两侧 PDF 独立滚动到对应页
- 点击 PDF 高亮或差异列表 → 更新 `activeChangeId` → 两侧联动高亮与滚动
- PDF 文件 URL：
  - 模版：`/api/files/{job_id}/template`
  - 正式：`/api/files/{job_id}/contract`

**插入点显示模式**（`templateAnchorMode`）：

| 模式 | 值 | 行为 |
| ---- | -- | ---- |
| 始终显示 | `always` | 模版侧所有蓝色插入锚点一直渲染 |
| 点击后显示 | `on-select` | 模版侧蓝色插入锚点默认隐藏，选中差异项后才显示对应锚点 |

可通过 props 传入默认值，也可在 summary-bar 下拉框切换：

```tsx
<DiffSideBySide result={result} templateAnchorMode="on-select" />
```

### PdfViewer.tsx

基于 `react-pdf` 渲染单份 PDF：

- 使用 `Document` + 逐页 `Page` 组件
- 关闭 textLayer 和 annotationLayer（`renderTextLayer={false}`）
- 每页加载成功后记录 PDF 原始尺寸（`pdfWidth`、`pdfHeight`）
- 根据 `changes`、`side`、`templateAnchorMode`、`activeChangeId` 筛选该页需高亮的差异
- 在 PDF 页面上方叠加 `DiffOverlay` SVG 层

**高亮可见性**（`shouldShowHighlight`）：

- 合同侧：所有差异始终显示
- 模版侧：
  - `delete` / `replace`：始终显示（红色）
  - `insert`（蓝色插入锚点）：
    - `always` 模式：始终显示
    - `on-select` 模式：仅 `change.id === activeChangeId` 时显示

**点击选中**：

- 传入 `onChangeSelect` 后，高亮矩形可点击（`cursor: pointer`）
- 只有 SVG 内的 `<rect>` 响应点击，透明区域不拦截
- 点击后回调 `onChangeSelect(change.id)`，与 ChangeList 共用同一 `activeChangeId`

**滚动定位**：

- 每页 DOM id 为 `{side}-page-{pageNumber}`（pageNumber 从 1 开始）
- 每条差异有滚动锚点 `{side}-change-{changeId}`，按 bbox 百分比定位在页内
- 优先滚动到差异锚点；若无锚点则回退到整页滚动
- 模版、合同各自独立滚动容器，互不影响

**页码约定**：

- 后端 / diff 引擎 `page` 为 0-based（0 = 第 1 页）
- 前端渲染和滚动使用 1-based pageNumber

### DiffOverlay.tsx

SVG 矩形高亮层，覆盖在 PDF 页面上：

- `viewBox` 使用 PDF 原始坐标系
- `preserveAspectRatio="none"` 使 SVG 随 PDF 缩放拉伸对齐
- 颜色：
  - 模版侧删除/修改：`rgba(248, 113, 113, 0.45)`（红）
  - 正式侧新增/修改：`rgba(74, 222, 128, 0.45)`（绿）
  - 模版侧插入锚点：`rgba(59, 130, 246, 0.35)`（蓝虚线）
- `active` 状态时加粗边框；插入锚点选中时显示「插入点」文字标签
- `interactive` 为 true 时，矩形可点击触发 `onSelect`

坐标来自 `bboxes: [[x0, y0, x1, y1], ...]`。

### ChangeList.tsx

差异列表面板：

- 过滤掉 `type === 'equal'` 的项
- 每项显示：类型 badge（删除/新增/修改）、id、模版文本、正式文本
- `insert` 类型模版侧显示「插入点：模版此处无对应内容（见 PDF 蓝色虚线标记）」
- 点击某项 → `onSelect(change.id)` → 更新 `activeChangeId`，联动 PDF 高亮和滚动
- 空文本显示为 `(空行)`

## 插入锚点与点击联动（实现逻辑）

本节描述「合同绿色新增 ↔ 模版蓝色插入点」的完整实现，涉及 diff 引擎数据产出与 UI 展示两层。

### 问题背景

并排对比时，合同侧绿色高亮表示**新增内容**，但模版中本来没有这段文字，无法直接在相同坐标高亮。需要在模版侧标记**语义插入点**——即新增内容在文本流中对应插入的位置。

### 数据层：diffEngine.ts

字符级 diff 产生 insert opcode 时：

```
{ tag: 'insert', i1: i, i2: i, j1: j, j2: j + len }
```

- `i1 == i2`：模版文本流中的插入锚点索引（该位置无新文字）
- `j1 ~ j2`：合同侧实际新增的文字范围

`emitInsertChanges()` 同时产出两侧坐标：

1. **合同侧**（`contractBboxes`）：新增文字的实际 bbox（绿色高亮）
2. **模版侧**（`templateBboxes`）：由 `getAnchorSlice(tplStream, tplAnchor)` 计算的插入锚点 bbox（蓝色虚线）

**锚点坐标计算**（`getAnchorSlice`）：

| 锚点位置 | 参考字符 | 标记位置 |
| -------- | -------- | -------- |
| 文本开头（index ≤ 0） | 第一个字符 | 字符左边缘 |
| 文本中间 | 锚点前一个字符 | 字符右边缘 |
| 文本末尾（index ≥ len） | 最后一个字符 | 字符右边缘 |

锚点 bbox 为窄竖条（宽约 2–3pt），由 `anchorMarkerFromBbox()` 生成。

最终每条 insert 类型的 `ChangeItem` 结构：

```typescript
{
  type: 'insert',
  template: { page, text: '', bboxes: [[x0,y0,x1,y1]] },  // 插入锚点
  contract: { page, text: '新增内容', bboxes: [...] },      // 实际新增
}
```

replace 若无法一对一配对，会拆成 delete + insert，insert 部分同样带锚点（锚点在模版被替换文字之后，即 `tplEnd` 位置）。

### 展示层：TemplateAnchorMode

类型定义（`types/compare.ts`）：

```typescript
export type TemplateAnchorMode = 'always' | 'on-select'
```

控制模版侧**蓝色插入锚点**的渲染时机（不影响红色删除/修改高亮）：

```
                    ┌─────────────────────────────────────┐
  合同侧绿色高亮     │  始终显示（所有 insert 锚点）        │  always
  被点击 / 列表选中  ├─────────────────────────────────────┤
                    │  仅显示当前 activeChangeId 的锚点   │  on-select
                    └─────────────────────────────────────┘
```

`PdfViewer.shouldShowHighlight()` 判断逻辑：

```
side === 'contract'           →  true（始终显示）
change.type !== 'insert'      →  true（模版红色始终显示）
templateAnchorMode === 'always' →  true
change.id === activeChangeId  →  true（on-select 模式下仅选中项）
否则                          →  false（隐藏蓝色锚点）
```

### 交互层：点击 → 选中 → 滚动 → 显示锚点

```
用户点击合同 PDF 绿色矩形
        ↓
DiffOverlay.onSelect → onChangeSelect(change.id)
        ↓
DiffSideBySide.setActiveChangeId(id)
        ↓
┌───────────────────────────────────────────────────┐
│ 1. PdfViewer 重新计算 pageChanges（on-select 下     │
│    模版侧渲染对应 insert 的蓝色锚点）               │
│ 2. DiffOverlay active 态加粗边框                    │
│ 3. useEffect 查找 {side}-change-{id} 滚动锚点       │
│    → scrollIntoView 精确定位                        │
│ 4. ChangeList 同步高亮选中项                        │
└───────────────────────────────────────────────────┘
```

**滚动锚点**（`diff-scroll-marker`）：按 bbox 第一矩形换算为页内百分比定位的不可见 div，供 `scrollIntoView` 使用；SVG 高亮层仍覆盖整页以保持坐标对齐。

**独立滚动**：模版、合同各为 `overflow: auto` 容器，选中 insert 时两侧页码可能不同，各自滚到 `{side}-change-{id}`。

### 涉及文件

| 文件 | 职责 |
| ---- | ---- |
| `lib/compare/diffEngine.ts` | 计算 insert 的模版锚点 bbox |
| `lib/compare/resultMapper.ts` | RawChange → ChangeItem 映射 |
| `types/compare.ts` | `TemplateAnchorMode` 类型 |
| `components/DiffSideBySide.tsx` | 状态管理、模式切换、props 传递 |
| `components/PdfViewer.tsx` | 高亮筛选、点击、滚动 |
| `components/DiffOverlay.tsx` | SVG 渲染（红/绿/蓝）、点击事件 |
| `components/ChangeList.tsx` | 列表联动、insert 文案 |
| `App.css` | `.diff-overlay--interactive`、`.diff-scroll-marker`、模式切换样式 |

### 已知限制

- 锚点是**文本流语义位置**，非像素级空间对齐；版式差异大时两侧页码/垂直位置可能不一致
- 插入锚点功能依赖前端 diff 引擎；后端（Python/Java/Go）返回的结果暂无 `templateBboxes` 锚点数据
- 同一页多个重叠高亮时，后渲染的矩形优先响应点击


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
| `ChangeType`           | `'equal' \| 'delete' \| 'insert' \| 'replace'` |
| `TemplateAnchorMode`   | `'always' \| 'on-select'`，控制模版插入锚点显示时机 |

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
- **差异高亮**：delete 在模版侧标红，insert 在正式侧标绿，insert 锚点在模版侧标蓝虚线
- **插入点模式**：`always` 始终显示蓝色锚点；`on-select` 点击绿色标注后才显示对应蓝色锚点
- **PDF 点击联动**：点击高亮矩形 → 选中差异 → 两侧滚动定位 + 边框加粗
- **列表联动**：点击差异列表项 → 与 PDF 点击效果相同
- **统计摘要**：顶部展示各类差异行数
- **重新上传**：结果页可 reset 回到上传界面

## 样式

全部使用 `App.css` 中的 CSS class，无 CSS-in-JS 或 UI 组件库。主要 class：

- `.upload-panel` / `.upload-card`：上传区域
- `.diff-layout` / `.pdf-columns`：并排布局
- `.pdf-pane` / `.pdf-page-wrap`：PDF 容器
- `.diff-overlay` / `.diff-overlay--interactive`：SVG 高亮层与可点击矩形
- `.diff-scroll-marker`：差异滚动定位锚点
- `.anchor-mode-toggle`：插入点显示模式切换
- `.change-list` / `.change-item`：差异列表
- `.badge-delete` / `.badge-insert`：类型标签
- `.inline-anchor`：列表中插入点说明文字

## 已知局限

- 未使用 `template_lines` / `contract_lines` 完整行列表（仅使用 `changes`）
- 无分页加载，大 PDF 会一次性渲染所有页
- 无 diff 选项 UI（options 使用默认值，用户不可配置）
- 无离线/缓存，刷新页面需重新上传
