# Ruff Lint + Format 编辑器配置

用 Ruff 统一负责 Python 的 lint 与 format，并在输入时即时修正格式（类似 ESLint + Prettier 的即时反馈，但格式问题以「自动改回」而非波浪线呈现）。

## 前置条件

1. 安装 [Ruff VS Code 扩展](https://marketplace.visualstudio.com/items?itemName=charliermarsh.ruff)（Cursor 同理）。
2. 在 `backend` 目录创建虚拟环境并安装开发依赖：

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
```

## 步骤 1：配置 `pyproject.toml`

在 `backend/pyproject.toml` 中声明 Ruff 规则与行宽（与 Black 兼容，行宽 88）：

```toml
[tool.ruff]
line-length = 88
target-version = "py313"
exclude = [".venv", "diff_logs", "temp"]

[tool.ruff.lint]
select = ["E", "W", "F", "I", "B", "UP"]
ignore = ["B008"]

[tool.ruff.lint.isort]
known-first-party = ["app"]
```

## 步骤 2：配置 VS Code / Cursor

### 仅打开 `backend` 目录时

编辑 `backend/.vscode/settings.json`：

```json
{
  "python.defaultInterpreterPath": "${workspaceFolder}/.venv/bin/python",
  "python.analysis.extraPaths": ["${workspaceFolder}"],
  "[python]": {
    "editor.defaultFormatter": "charliermarsh.ruff",
    "editor.formatOnSave": true,
    "editor.formatOnType": true,
    "editor.formatOnPaste": true,
    "editor.codeActionsOnSave": {
      "source.fixAll.ruff": "always",
      "source.organizeImports.ruff": "always"
    }
  },
  "ruff.nativeServer": "on",
  "ruff.configuration": "${workspaceFolder}/pyproject.toml",
  "ruff.lint.run": "onType",
  "ruff.organizeImports": true
}
```

### 打开仓库根目录 `pdf-diff` 时

编辑根目录 `.vscode/settings.json`，将路径指向 `backend`：

```json
{
  "python.defaultInterpreterPath": "${workspaceFolder}/backend/.venv/bin/python",
  "python.analysis.extraPaths": ["${workspaceFolder}/backend"],
  "[python]": {
    "editor.defaultFormatter": "charliermarsh.ruff",
    "editor.formatOnSave": true,
    "editor.formatOnType": true,
    "editor.formatOnPaste": true,
    "editor.codeActionsOnSave": {
      "source.fixAll.ruff": "always",
      "source.organizeImports.ruff": "always"
    }
  },
  "ruff.nativeServer": "on",
  "ruff.configuration": "${workspaceFolder}/backend/pyproject.toml",
  "ruff.path": ["${workspaceFolder}/backend/.venv/bin/ruff"],
  "ruff.interpreter": ["${workspaceFolder}/backend/.venv/bin/python"],
  "ruff.lint.enable": true,
  "ruff.lint.run": "onType",
  "ruff.organizeImports": true
}
```

### 关键项说明

| 配置 | 作用 |
|------|------|
| `editor.defaultFormatter: charliermarsh.ruff` | 用 Ruff 做 formatter，不再依赖 Black 扩展 |
| `editor.formatOnType: true` | 换行/输入时即时格式化（拆行会立刻被合并） |
| `editor.formatOnPaste: true` | 粘贴后自动格式化 |
| `editor.formatOnSave: true` | 保存时格式化 |
| `source.fixAll.ruff` | 保存时自动修复可 fix 的 lint 问题 |
| `source.organizeImports.ruff` | 保存时整理 import |
| `ruff.lint.run: onType` | lint 问题在输入时实时显示波浪线 |
| `ruff.nativeServer: on` | 使用 Rust 原生 language server（更快） |

> **说明**：Ruff LSP 目前不会像 ESLint + Prettier 那样对「格式即将被改掉」显示波浪线；格式反馈依赖 `formatOnType` 的即时修正。

## 步骤 3：Makefile 命令

`backend/Makefile` 提供常用命令：

```bash
make format        # ruff format + 整理 import
make format-check  # 只检查格式，不改文件（适合 CI）
make lint          # ruff check
make fix           # ruff check --fix
make check         # format-check + lint
```

## 步骤 4：验证

1. 执行 **Developer: Reload Window**，或命令面板运行 **Ruff: Restart Server**。
2. 打开任意 `.py` 文件，将短函数调用故意拆成两行，例如：

```python
log_path.parent.mkdir(
    parents=True, exist_ok=True)
```

3. 在第二行末尾再按 **Enter** → 应立刻被合并为单行。
4. 终端执行 `make format-check`，未格式化文件会报错退出。

## 与 Black 扩展的对比

| 方案 | 格式反馈方式 |
|------|-------------|
| Black 扩展 + `formatOnSave` | 仅保存时改，输入阶段无提示 |
| Ruff + `formatOnType`（当前方案） | 输入/换行时立刻改回，lint 实时波浪线 |

Black 仍保留在 `requirements-dev.txt` 中（可选）；日常开发与 CI 以 `ruff format` 为准即可。
