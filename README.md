# Branchline

Branchline 是一个面向大型仓库的桌面 Git 工作台。当前版本使用 Tauri 2 + Rust，并通过 pnpm workspace 管理桌面应用与共享 Git 包。桌面端可以通过系统目录选择器打开真实 Git 仓库或 Worktree，并读取提交、工作区变更、分支、Worktree 和 Submodule 信息。

## 目录结构

```text
apps/frontend/             独立 React/Vite 前端应用
apps/desktop/              独立 Tauri/Rust 桌面后端与宿主
packages/git-models/       前后端共享的仓库、提交、Diff 数据模型
packages/git-client/       Tauri 命令封装和桌面能力边界
```

## 运行

仅查看 Web 演示界面：

```bash
pnpm install
pnpm dev
```

Web 模式无法访问本地文件系统，因此“打开本地仓库”会提示使用桌面版。

运行桌面版前请安装：

- [Rust](https://rustup.rs/)（MSVC 工具链）
- Visual Studio Build Tools 2022，并选择“使用 C++ 的桌面开发”和 Windows SDK

然后运行：

```bash
pnpm install
pnpm desktop:dev
```

在左上角仓库切换器中选择“打开本地仓库”，即可选择现有 Git 仓库或 Worktree。

Web 生产构建：

```bash
pnpm build
```

桌面端构建：

```bash
pnpm desktop:build
```

验证完整 workspace：

```bash
pnpm typecheck
pnpm rust:fmt
pnpm rust:check
cargo test --manifest-path apps/desktop/Cargo.toml
```

## 当前能力

- 打开真实 Git 仓库和 Worktree
- 读取当前分支、远程、领先/落后、Worktree 和 Submodule 数量
- 读取最近 500 条提交、完整提交信息、父级提交和提交/作者时间
- 读取工作区变更和真实文本 Diff
- 多仓库最近记录、Worktree 和 Submodule 快速切换
- 真实 Fetch、每 5 分钟低优先级自动 Fetch
- 真实暂存、取消暂存、提交、Amend 和签名提交
- gitlink 冲突本地优先解析命令
- 虚拟化提交图谱的界面结构
- 按提交信息、Hash、提交人搜索
- 完整提交元数据、父级 Hash、作者和提交日期
- 统一/并排 Diff、宽屏聚焦模式、文件树形/列表视图
- 分支前缀树（如 `feat/1248`）及前缀级操作入口
- 文件提交历史与逐行 Blame 历史
- 分支前缀删除前预览、二次确认和并发变更校验
- Worktree、Submodule、标签、Stash 和文件/行历史入口
- 暂存、提交模板、Amend、签名提交流程
- 深色/浅色主题和全局快捷键面板
- 在同一仓库切换器中快速进入 Worktree 与 Submodule
- 900px 以上桌面窗口响应式布局

## 后续实现路线

当前使用 Tauri 2 + Rust 后端，通过受控的 Git CLI 读取仓库。后续可将高频只读操作迁移到 `gix` 或 `git2`，复杂写操作继续使用 Git CLI 保持行为兼容。

1. 仓库层：统一 `RepositoryService`，支持发现、打开、最近仓库、状态缓存和文件监听。
2. 提交层：流式解析提交、拓扑和 refs，分页送入前端并做可见区域渲染。
3. 操作层：stage、commit、branch、merge、rebase、cherry-pick、stash、tag、remote、worktree 和 submodule。
4. 历史层：继续增加任意文件选择、指定行范围和提交跳转。
5. 自动化层：可暂停的定时 Fetch、网络/电源策略、凭据代理和通知。
6. 冲突层：检测 mode `160000` 的 gitlink 冲突，默认执行本地优先策略，同时保留确认和撤销记录。

分支前缀批量删除会先展示受影响的本地分支，并在后端再次校验删除范围；“删除前缀”实际是删除其下所有实际 refs，Git 本身不存在目录型分支。

## 性能边界

- 提交列表和 Diff 使用窗口化渲染，禁止一次性向前端发送完整大型历史。
- Rust 侧维护可取消的任务队列；搜索、切换仓库和关闭窗口时中止旧任务。
- 文件状态、提交图谱和 Diff 分开缓存，缓存使用条目和字节双重上限。
- 定时 Fetch 在后台低优先级执行，同一仓库只允许一个网络任务。
- 前端避免 Electron 常驻进程；目标空闲内存控制在 100 MB 左右，具体以接入 Tauri 后的基准测试为准。
