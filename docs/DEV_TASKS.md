# ev 开发任务清单（按阶段）

本清单基于 `docs/TECH_DESIGN.md`，按里程碑拆分任务与验收标准，便于分阶段交付。

## Milestone 0：工程初始化与可运行骨架（MVP Skeleton）

### 目标

- 能在三平台启动并展示基础 UI（分组列表 + 右侧编辑区占位）
- 自动主题（随系统）
- 三语切换（UI 文案最小集合）
- 顶栏 GitHub 按钮可打开链接

### 任务

- **T0.1**：初始化 Tauri v2 + Vite + React + TS 工程
  - 验收：`pnpm tauri dev`（或 `npm run tauri dev`）可启动；窗口标题为 `ev`
- **T0.2**：接入 `@tauri-apps/plugin-shell`（仅用于 `open(url)`）
  - 验收：点击 GitHub 按钮可打开 `https://github.com/poneding/ev`
- **T0.3**：接入 i18n（zh-CN/zh-TW/en）与语言切换 UI
  - 验收：切换语言后 UI 文案即时变化，且能持久化
- **T0.4**：基础主题（CSS + Monaco theme 预留）
  - 验收：系统切换深浅色后，页面配色自动变化（至少背景/文字/边框）

## Milestone 1：分组与持久化（Groups + Store）

### 目标

- 分组 CRUD（除 `Current`）
- `Current` 分组可刷新同步当前环境变量（只读展示）
- 分组内容以 dotenv-like 文本保存

### 任务

- **T1.1**：接入 `@tauri-apps/plugin-store`，定义 store schema（settings + groups）
  - 验收：重启应用后数据仍存在
- **T1.2**：`Current` 同步：Rust command `get_current_env()`
  - 验收：展示当前进程环境变量数量，支持手动刷新
- **T1.3**：自定义分组：新增/重命名/删除（删除需二次确认）
  - 验收：`Current` 无删除按钮；自定义分组可删除

## Milestone 2：Monaco Editor 编辑与保存快捷键

### 目标

- 右侧使用 Monaco Editor 编辑 dotenv-like 文本
- `Ctrl+S`/`Cmd+S` 保存到 store
- 显示“未保存/已保存”状态；基础校验提示

### 任务

- **T2.1**：集成 `@monaco-editor/react` + `monaco-editor`，完成 Vite workers 配置
  - 验收：编辑器可输入，不卡死；打包后可运行
- **T2.2**：快捷键保存（`CtrlCmd + S`）
  - 验收：按下快捷键触发保存；浏览器默认行为不触发
- **T2.3**：dotenv 解析与提示（重复 key / 非法 key）
  - 验收：提示区域能看到错误/警告数量

## Milestone 3：分组生效切换（Apply/Disable）

### 目标

- 同时最多一个分组生效（`activeGroupId`）
- Windows：写用户级环境变量并广播
- macOS/Linux：生成 `~/.config/ev/*` hook 与 `active.env`，引导用户 source

### 任务

- **T3.1**：Rust：解析 dotenv-like → 变量 map（保留最后覆盖）
  - 验收：解析错误返回详细行号与原因
- **T3.2**：Windows 平台 apply/disable
  - 验收：切换后新开的终端读取到新值；disable 后恢复为空/删除变量
- **T3.3**：macOS/Linux 平台 apply/disable（写 hook 文件）
  - 验收：写入文件成功；UI 提示用户重载 shell
- **T3.4**：UI：分组开关与当前生效标识
  - 验收：只有一个分组处于 enabled；切换时有 loading/结果提示

## Milestone 4：打磨与发布准备

### 目标

- 更美观的 UI（间距、字体、按钮状态、空态/错误态）
- 语言覆盖完整
- 文档完善：安装/构建/发布说明

### 任务

- **T4.1**：UI 视觉打磨（简洁、现代）
  - 验收：空态、错误态、loading 态齐全
- **T4.2**：i18n 文案全覆盖，默认语言检测更合理
  - 验收：无明显硬编码中文/英文
- **T4.3**：补齐 `README.md`（开发、构建、shell hook 指引、平台限制）
  - 验收：新开发者可照文档跑起来

## 分阶段实现顺序（推荐）

- 先做 Milestone 0（能跑起来）→ Milestone 1（数据模型稳定）→ Milestone 2（编辑体验）→ Milestone 3（核心“生效”能力）→ Milestone 4（完善）
