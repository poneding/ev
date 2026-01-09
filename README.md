# ev

跨平台环境变量管理应用（Rust + Tauri v2）。

## 开发运行

在 `ev/` 目录：

- 安装依赖：`npm install`
- 启动：`npm run tauri dev`

## 核心概念

- **Current**：同步当前进程可见的环境变量（只读，不能删除）
- **自定义分组**：你自己维护的一组环境变量（可编辑/重命名/删除）
- **生效（Enabled）**：同一时间最多一个分组“生效”。切换生效会根据平台写入用户环境变量或生成 shell hook 文件。

## macOS / Linux：生效方式（Shell Hook）

当你把某个分组切换为“生效”后，`ev` 会在系统“配置目录”下生成脚本文件（通常在 `~/.config/ev/`）：

- `ev.sh` / `ev.zsh`：bash/zsh 适用
- `ev.fish`：fish 适用
- `active.env`：调试用（KEY=VALUE）

你需要在 shell 启动脚本中 `source` 一次：

- zsh：在 `~/.zshrc` 添加：
  - `source ~/.config/ev/ev.zsh`
- bash：在 `~/.bashrc` 添加：
  - `source ~/.config/ev/ev.sh`
- fish：在 `~/.config/fish/config.fish` 添加：
  - `source ~/.config/ev/ev.fish`

完成后，重载 shell（或打开新终端）即可生效。

## Windows：生效方式（用户级环境变量）

Windows 下“生效”会写入 **HKCU 用户级环境变量**并广播变更。

- 新开的终端/应用会读取到更新后的环境变量
- 已经运行的进程是否立即感知取决于程序自身；通常需要重启终端/应用

## 隐私与安全

- `ev` 默认不上传任何环境变量
- `Current` 默认隐藏值，你可以切换显示/复制

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
