# ev / AGENTS.md

本文件定义 `ev`（Rust + Tauri v2）项目的协作规范与开发约束，适用于人类与 AI Agent 协作开发。

## 项目目标

`ev` 是一个跨平台（Windows/macOS/Linux）的环境变量管理应用，核心能力：

- 环境变量按“分组”管理（含不可删除的 `Current` 分组）
- 分组可切换“是否生效”
- 自动深色/浅色主题
- 多语言（简体中文/繁体中文/English）
- 环境变量编辑界面使用 Monaco Editor，支持 Ctrl/Cmd+S 保存

## 技术栈约定

- **Tauri**：v2（Rust 后端 + Web 前端）
- **前端**：Vite + React + TypeScript
- **编辑器**：`@monaco-editor/react` + `monaco-editor`
- **i18n**：`i18next` + `react-i18next`（资源打包到本地，不依赖网络加载）
- **持久化**：优先使用 `@tauri-apps/plugin-store`（配置与分组数据）；敏感字段（如 token）后续可引入 keyring 插件

## 目录结构建议（初始化后）

- `src-tauri/`：Rust/Tauri 后端
  - `src/commands/`：`#[tauri::command]` 命令
  - `src/env/`：跨平台环境变量读取/应用逻辑（分平台模块）
  - `tauri.conf.json`、`capabilities/`：Tauri 能力与权限声明
- `src/`：前端（React）
  - `components/`：UI 组件
  - `features/`：按功能划分（groups/editor/settings）
  - `i18n/`：语言资源与初始化
  - `theme/`：主题与样式
  - `store/`：前端状态与持久化封装

## 分支/提交规范

- **默认分支**：`main`
- **开发分支**：`feat/<topic>`、`fix/<topic>`、`chore/<topic>`
- **提交信息**：遵循 Conventional Commits
  - 例：`feat(groups): add Current group sync`
  - 例：`fix(editor): handle Ctrl+S on Windows`

## 代码风格与质量

- TypeScript：开启严格模式（`strict: true`），避免 `any`
- Rust：`cargo fmt`、`clippy` 无明显警告（允许针对平台差异使用 `cfg`）
- UI：优先组件化与可访问性（键盘可用、可聚焦、合理 aria）
- 错误处理：对用户显示可理解信息；对开发者记录详细日志（必要时）

## IPC / Command 设计约束

- 所有跨平台敏感操作仅在 Rust 侧实现，前端通过 `invoke` 调用
- Command 入参/出参使用明确的数据结构（JSON 可序列化），避免传递“拼接 shell 命令字符串”
- 所有文件/系统访问必须显式声明并最小化权限（Tauri v2 capabilities）

## 跨平台“生效”策略（默认约定）

为保证跨平台一致性与可预期性，默认采用：

- **Windows**：写入“用户级”环境变量（HKCU）并广播环境变更；需要重启终端/应用才能读取到最新值（部分进程可实时感知）。
- **macOS/Linux**：不直接修改系统级配置；通过写入 `~/.config/ev/` 下的脚本/片段并提供 shell hook（zsh/bash/fish 可选），用户按指引在 shell 启动脚本中 `source` 即可生效；切换分组后提示“重新加载 shell 或重开终端”。

> 如未来需要“系统级”或“针对特定 Shell/IDE 即时注入”的能力，可在设计文档的扩展章节中迭代。

## 安全与隐私

- **默认不上传任何环境变量**（离线应用）
- 如未来支持导入/导出或同步：必须显式提示用户，并提供脱敏预览
- `Current` 分组同步时，UI 需要提供“隐藏值/显示值”的开关（默认隐藏）

## 需求变更与疑问处理

- 当需求存在歧义（例如“生效”的范围：当前 shell/用户/系统），优先把**默认假设**写入 `docs/TECH_DESIGN.md`，并在 PR/提交说明里标注。
- 若歧义可能导致返工或安全风险，必须先向用户确认再继续。
