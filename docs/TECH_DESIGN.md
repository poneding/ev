# ev 技术设计文档（Tauri v2 + Rust）

本文档描述 `ev` 的技术架构、数据模型、跨平台“生效”策略、权限与安全边界，以及 UI/i18n/主题/编辑器方案。实现将严格遵循 `AGENTS.md` 的约束。

## 1. 目标与非目标

### 1.1 目标

- **跨平台**：Windows / macOS / Linux
- **自动主题**：跟随系统深色/浅色
- **多语言**：简体中文（zh-CN）/繁体中文（zh-TW）/English（en）
- **分组管理**：
  - `Current`：同步当前所有环境变量；不可删除；不可编辑为“生效来源”（只读视图）
  - 自定义分组：可新增/重命名/删除/编辑
  - 分组可切换“是否生效”（同时最多 1 个分组生效，避免冲突；可扩展为多分组叠加）
- **编辑体验**：Monaco Editor 编辑环境变量文本（支持 `Ctrl+S`/`Cmd+S` 保存）
- **开源入口**：GitHub 按钮打开 `https://github.com/poneding/ev`

### 1.2 非目标（第一阶段不做）

- 系统级（管理员/root）环境变量修改
- 立即影响“当前已经运行”的所有进程（OS 本身限制）
- 在线同步/账号体系
- 复杂语法校验（如引用展开、条件语句）；仅做基础 KEY=VALUE 解析与提示

## 2. 总体架构

### 2.1 分层

- **前端（React）**：UI、交互、编辑、i18n、主题、调用后端 commands
- **后端（Rust）**：
  - 读取当前环境变量（`std::env::vars`）
  - 执行跨平台“生效/撤销”
  - 生成 shell hook（macOS/Linux）
  - Windows 用户级环境变量写入与广播
- **持久化（Plugin Store）**：
  - 分组与变量数据（非敏感）
  - 用户设置（语言、是否显示值、最后生效分组、UI 状态）

### 2.2 数据流

- App 启动：
  - 前端加载 Store（settings + groups）
  - 调用后端 `get_current_env()` 获取 `Current`
  - 应用主题与语言
- 用户编辑分组：
  - Monaco 编辑文本 → 前端解析预览 → 保存到 Store
- 用户切换生效：
  - 前端调用 `apply_group(groupId)` 或 `disable_active_group()`
  - 后端执行平台逻辑并返回结果（需要提示重启终端/应用时，返回 `restartHint`）

## 3. 数据模型

### 3.1 核心对象

#### Group

- `id: string`（uuid）
- `name: string`（`Current` 为保留名）
- `kind: "current" | "custom"`
- `enabled: boolean`（仅 custom 可用；current 固定 false）
- `format: "dotenv"`（预留扩展）
- `content: string`（dotenv-like 原文，保留注释与顺序）
- `updatedAt: number`（epoch ms）

#### Settings

- `language: "zh-CN" | "zh-TW" | "en"`
- `hideValuesByDefault: boolean`
- `activeGroupId: string | null`
- `shellIntegration`（macOS/Linux）：
  - `enabled: boolean`
  - `shells: ("zsh" | "bash" | "fish")[]`

### 3.2 文本格式（dotenv-like）

- 支持：
  - 空行
  - `#` 开头注释
  - `KEY=VALUE`
- 约束：
  - `KEY` 必须匹配 `[A-Za-z_][A-Za-z0-9_]*`
  - `VALUE` 原样保留（不做引用展开），前端仅做轻量提示

## 4. 跨平台“生效”策略

> 该部分是最关键的产品取舍：不同 OS 对环境变量的“永久生效”机制不同，且无法强制影响已运行进程。我们采用“最小权限、可回滚、可解释”的实现。

### 4.1 Windows（用户级环境变量）

- 写入目标：**HKCU 用户环境变量**（不写系统级）
- 更新后：
  - 广播环境变更（让 Explorer/新进程可感知）
  - 提示用户：已打开的终端/应用需重启才能读取到新值

### 4.2 macOS / Linux（shell hook）

- 写入目标：`~/.config/ev/` 下生成可读可回滚的脚本文件
  - `active.env`：当前生效分组的 key/value 规范化输出（export 格式或 shell-specific）
  - `ev.sh` / `ev.zsh` / `ev.fish`：可被 source 的 hook
- 用户启用方式：
  - 在 `~/.zshrc` 或 `~/.bashrc` 或 `~/.config/fish/config.fish` 里加一行 `source`
  - App 提供“一键复制”与检测提示
- 切换分组：
  - 更新 `active.env` 内容
  - 提示用户 `source` 重载或重启终端

### 4.3 同时最多一个分组生效

第一阶段默认“单活跃分组”：

- 避免变量冲突与优先级歧义
- UI 清晰：开关即“当前生效的分组”

后续可扩展：

- 多分组叠加（按顺序覆盖）
- 变量级别的启用/禁用

## 5. Tauri 安全与权限（Capabilities）

- 最小化权限：
  - Store：应用设置/分组数据
  - Shell plugin：仅用于打开 GitHub 链接（`open(url)`），不执行任意命令
  - FS plugin：仅允许访问 `$APPDATA` / `~/.config/ev`（按平台映射）
- 任何写系统级文件、执行任意命令都不在 v1 范围内

## 6. UI/UX 设计

### 6.1 页面结构

- 左侧：分组列表（`Current` 固定第一项）
  - New Group
  - 分组条目：名称 + 启用开关（Current 无开关）
- 右侧：分组详情
  - 顶部：标题、保存状态（已保存/未保存）、保存按钮
  - 中部：Monaco Editor（dotenv-like）
  - 底部：解析预览（键数量、重复 key 警告、非法 key 提示）

### 6.2 顶栏

- 应用名 `ev`
- 语言切换
- 主题（自动，无需手动切换；可预留“强制浅/深/自动”）
- GitHub 按钮：打开开源地址

## 7. Monaco Editor 集成

采用 `@monaco-editor/react`（monaco-react）：

- Vite worker 配置（Monaco 在 Vite 下需要配置 workers）
- 快捷键：
  - 使用 `editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, ...)`
  - `CtrlCmd` 自动兼容 Windows/Linux（Ctrl）与 macOS（Cmd）
- 保存逻辑：
  - 若内容无变化不写入
  - 写入成功后更新状态提示

## 8. i18n 与自动主题

- i18n：`i18next + react-i18next`
  - 语言资源随应用打包（不走 http backend）
  - 默认语言：系统语言映射（zh-Hans → zh-CN，zh-Hant → zh-TW），fallback en
- 主题：
  - CSS 使用 `prefers-color-scheme`
  - Monaco theme：浅色 `vs`，深色 `vs-dark`

## 9. 错误处理与提示

后端命令统一返回：

- `ok: boolean`
- `message?: string`（用户可读）
- `detail?: string`（开发者诊断，必要时）
- `restartHint?: string`（提示重启终端/应用）

## 10. 风险与取舍

- **macOS/Linux**：不修改系统级配置 → 需要用户一次性配置 shell hook（可接受，且安全可控）
- **Windows**：写入用户级环境变量仍需要重启部分应用才能读取
- **dotenv-like**：不做复杂展开，避免“看起来对但实际不可预期”的行为

## 11. 需要用户确认的问题（若不确认则按默认实现）

1. “分组生效”是否需要支持**多分组叠加**？（默认：单分组）
2. Windows 是否需要支持**系统级**环境变量？（默认：仅用户级）
3. macOS/Linux 是否要求直接修改 `~/.zshrc`/`~/.bashrc`？（默认：不自动修改，只生成 hook + 引导）
