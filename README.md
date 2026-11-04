# Branchline

Branchline 是一款面向日常开发的桌面 Git 工作台。它把提交历史、工作区变更、分支和仓库管理放在同一界面中，适合需要频繁检查和操作多个 Git 仓库的开发者。

Branchline 使用 Tauri 2、React 和 Rust 构建，并通过系统中已安装的 Git 命令行工具访问仓库。

## 使用方式

| 方式 | 适合场景 | 本地仓库操作 |
| --- | --- | --- |
| 桌面版 | 日常使用、完整 Git 工作流 | 支持 |
| Web 预览 | 查看和开发前端界面 | 不支持；浏览器模式不能调用桌面端的文件系统和 Git 能力 |

## 快速开始

### 桌面开发

准备以下环境：

- Git，并确保 `git` 命令可以从终端运行
- Node.js 和 pnpm（仓库指定 pnpm `10.15.0`）
- Rust stable 工具链
- 对应系统的 Tauri 构建依赖：[Windows、macOS 和 Linux 环境要求](https://v2.tauri.app/start/prerequisites/)

Windows 还需要 Visual Studio Build Tools 2022 的“使用 C++ 的桌面开发”组件和 Windows SDK。

在仓库根目录运行：

    pnpm install
    pnpm desktop:dev

启动后，从左上角的仓库切换器打开本地仓库，或创建、克隆一个仓库。

### Web 预览

Web 预览用于开发和检查前端界面。它不具备桌面版的本地仓库访问能力。

    pnpm install
    pnpm dev

## 功能

- **仓库管理：** 打开、克隆和初始化仓库；管理最近使用和收藏的仓库。
- **提交历史：** 查看虚拟化提交图谱、分支和标签引用；按提交信息、Hash 或作者搜索。
- **变更审阅：** 查看文件 Diff，使用列表或目录树浏览文件，按文件名或路径筛选，并查看文件历史和 Blame。
- **暂存与提交：** 暂存文件或 Diff 片段，可选择仅暂存非空白修改，编辑提交信息，使用提交模板、Amend 和签名提交。
- **分支与同步：** 创建、切换和删除分支；Fetch、Pull、Push、合并、Rebase 和 Cherry-pick。
- **仓库协作结构：** 管理 Worktree、Submodule、标签和 Stash；比较引用并查看合并队列。
- **冲突处理：** 查看冲突文件和 Diff，逐步处理 Rebase 等未完成的 Git 操作。
- **工作环境：** 深色和浅色主题、全局快捷键、命令日志及可配置的后台 Fetch。

### 界面语言与提示

标题栏提供语言选择，可选“跟随系统”、简体中文和 English。首次启动跟随系统的语言偏好，不支持的语言回退到简体中文；手动选择会被记住，也可随时切回跟随系统。切换语言立即生效，并保留当前仓库、筛选和未保存的输入。

应用说明、日期和显示数字随语言切换；提交信息、文件内容、路径、引用名称及 Git/系统原始诊断保留原文。鼠标停留在按钮或截断内容上可查看统一提示，键盘聚焦时立即显示，按 Escape 关闭。

## 开发

### 项目结构

    apps/frontend/        React + Vite 前端
    apps/desktop/         Tauri 2 + Rust 桌面宿主和 Git 后端
    packages/git-client/  前端使用的桌面命令封装
    packages/git-models/  前后端共享的数据模型

这些包由 pnpm workspace 管理。

### 常用命令

    # 类型检查与前端测试
    pnpm typecheck
    pnpm --filter @branchline/frontend exec vitest run

    # Rust 检查与测试
    pnpm rust:fmt
    pnpm rust:check
    cargo test --manifest-path apps/desktop/Cargo.toml

    # 构建
    pnpm build
    pnpm desktop:build

当前 Tauri 配置尚未启用安装包打包；`pnpm desktop:build` 用于构建桌面应用，不会生成可分发的安装包。

### 新增界面文案

中英文资源位于 `apps/frontend/src/i18n/locales/{zh-CN,en-US}/`，按功能命名空间组织。新增文案时同时补齐两种语言，使用语义 key、完整句子和插值；数量文案使用 i18next 的 `count` 及英文复数形式，日期和显示数字使用 Intl 格式化。

组件通过 `useAppTranslation` 获取当前翻译。跨语言切换仍需保留的通知和确认信息使用 `message` 描述符，应用错误通过稳定错误码翻译，Git/系统诊断放入原始详情。应用 Tooltip 使用共用 `Button` 的 `tooltip` 属性，其他 DOM 元素使用 `Tooltip` 包裹；图标按钮仍需独立的 `aria-label`，不再使用原生 HTML `title` 提示。

前端测试包含资源一致性、文案源码和原生提示属性审计，新增语言或修改文案后运行前端测试与类型检查。

## 技术说明

- 前端负责工作区界面、提交图谱和 Diff 展示。
- Rust 桌面端通过 Git CLI 读取仓库状态并执行 Git 操作。
- `packages/git-models` 定义共享数据结构，`packages/git-client` 隔离前端与 Tauri 命令的交互。
- 提交历史和文件列表使用窗口化渲染；仓库状态、历史和 Diff 分开加载。
