# Carvis — 本地开发服务管理工具

**菜维斯，为你分担一点点🤏工作**

Carvis 是一款面向开发者的本地服务管理桌面应用，用图形化界面替代繁琐的命令行操作，让启动、监控、管理多个开发服务变得像点击按钮一样简单。

---

## 目录

- [功能特性](#功能特性)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [架构说明](#架构说明)
- [快速开始](#快速开始)
- [构建指南](#构建指南)
- [打包说明](#打包说明)
- [配置说明](#配置说明)
- [依赖变化（Electron → Tauri）](#依赖变化electron--tauri)
- [工具对比](#工具对比)
- [License](#license)

---

## 功能特性

### 服务生命周期管理
- **启动 / 停止 / 重启** — 单个服务的完整生命周期控制
- **批量操作** — 一键启动全部 / 停止全部服务；分组批量控制
- **状态实时同步** — 侧边栏状态指示灯（🟢 运行中 / 🟡 启动中 / ⚪ 已停止）
- **智能状态感知** — 端口轮询检测（500ms）+ 日志关键词识别（`[OK] 已就绪`）+ 60 秒超时兜底
- **防重复启动** — 同一服务不允许重复启动；优雅退出时自动停止所有服务

### 终端日志系统
- **实时日志流** — stdout / stderr 实时采集，终端风格滚动显示
- **多服务 Tab 切换** — 顶部 Tab 栏快速切换（按分组过滤）
- **智能日志着色** — `[ERROR]` 红色 / `[WARN]` 黄色 / `[OK]` 绿色 / `[STDERR]` 橙色
- **HTTP 地址可点击** — 自动识别 URL，点击调用系统浏览器打开
- **内存保护** — 单服务日志最大 500 条，超限自动裁剪；ANSI 码自动清洗

### 端口清理
- **占用检测** — 跨平台扫描（Windows: netstat / macOS: lsof）
- **智能保护** — 自动跳过由 Carvis 管理的服务端口，防止误杀
- **一键终止** — 自动识别 PID 并执行跨平台强制终止

### 服务分组管理
- 创建 / 重命名 / 删除分组；上移 / 下移排序；展开 / 折叠
- 右键菜单快速分配服务到分组；分组内批量启停

### 配置中心
- 图形化服务 CRUD（ID、显示名称、工作目录、命令、参数、端口）
- 分组管理 + 端口清理列表配置
- 自动校验修复异常配置；配置自动持久化

### 主题与界面
- **三模主题** — 亮色 / 暗色 / 跟随系统；CSS 变量驱动，零运行时开销
- **无边框窗口** — 自定义标题栏 + 窗口控制（最小化 / 最大化 / 关闭）
- **系统托盘** — 最小化到托盘；托盘菜单「打开」/「退出」
- **单实例** — 只允许一个实例运行，重复打开聚焦已有窗口
- **开机自启** — 可选随系统启动

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vue 3 (Composition API) + Vite 6 |
| 桌面框架 | **Tauri 2**（Rust 后端 + 系统 WebView）|
| 系统能力 | tauri-plugin-shell / opener / autostart / single-instance |
| 构建打包 | tauri build（NSIS / DMG / AppImage / deb）|
| 样式 | 纯 CSS（无 UI 框架依赖）|
| 字体 | Inter（界面）+ JetBrains Mono（终端）|
| 平台支持 | Windows 10+ / macOS 11+ / Linux |

> **关于体积**：Tauri 使用系统自带的 WebView 渲染界面，不再内嵌完整浏览器内核。
> 安装包约 **2 MB**（NSIS），安装后占用约 **5 MB** 磁盘空间。相比之下 Electron 版安装包约 60+ MB。

---

## 项目结构

```
carvis/
├── src-tauri/                   # Rust 后端（Tauri 2）
│   ├── src/
│   │   ├── main.rs              # 入口
│   │   ├── lib.rs               # 应用装配：插件/托盘/单例/窗口事件/命令注册
│   │   ├── state.rs             # 全局托管状态
│   │   ├── config.rs            # 配置模型 + 校验 + 加载/持久化/迁移
│   │   ├── process.rs           # 进程管理
│   │   ├── port.rs              # 端口探测/清理/固定
│   │   └── commands.rs          # 28 个 IPC 命令
│   ├── icons/                   # 应用图标（多尺寸，tauri icon 生成）
│   ├── Cargo.toml               # Rust 依赖
│   ├── Cargo.lock               # 依赖锁定（必须提交，保证可复现构建）
│   ├── build.rs
│   └── tauri.conf.json          # 窗口/打包/应用标识配置
├── src/                         # Vue 前端
│   ├── services/
│   │   └── tauriApi.ts          # 桥接层（镜像旧 serviceAPI）
│   ├── components/              # 组件
│   │   ├── TerminalPanel.vue    # 终端日志面板
│   │   ├── SettingsModal.vue    # 设置弹窗
│   │   └── PortKiller.vue       # 端口清理组件
│   ├── styles/
│   │   └── marvis-light.css     # 主题样式
│   ├── App.vue                  # 根组件
│   └── main.js                  # Vue 入口
├── public/                      # 静态资源（品牌图等）
├── release/                     # 预构建便携版 exe（非 git 追踪）
├── package.json
├── vite.config.js
└── index.html
```

> `src-tauri/target/`、`node_modules/`、`dist/` 均为构建产物，已被 `.gitignore` 排除，不进入版本控制。本地可安全删除以节省空间（见下方「构建缓存清理」）。

---

## 架构说明

```
┌─────────────────────────────────────────────┐
│              渲染层 (Renderer / WebView)       │
│  ┌───────────────┐  ┌──────────────────────┐  │
│  │  Vue 3 + Vite │  │   纯 CSS 主题          │  │
│  │  (无边框窗口)  │  │  (亮色/暗色/系统)      │  │
│  └───────────────┘  └──────────────────────┘  │
├─────────────────────────────────────────────┤
│  Bridge: src/services/tauriApi.ts             │
│  · _invoke（5s 超时）统一返回 {success,data?,error?} │
│  · 事件订阅 onLog / onStatusChange / onAppShutdownReady │
├─────────────────────────────────────────────┤
│              核心层 (Rust / Tauri)             │
│  ┌────────────────┐  ┌─────────────────────┐  │
│  │  commands.rs   │  │  process.rs         │  │
│  │  28 个 IPC 命令 │  │  进程/端口就绪检测   │  │
│  ├────────────────┼──┼─────────────────────┤  │
│  │  config.rs     │  │  port.rs            │  │
│  │  配置/迁移/校验 │  │  端口清理/固定        │  │
│  ├────────────────┴──┴─────────────────────┤  │
│  │  插件: shell / opener / autostart / single-instance │
│  │  托盘创建 / 窗口事件 / 自启 / 单实例锁     │
│  └─────────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
         ↕ OS 层: std::process::Command / TcpStream
         (cmd.exe / taskkill / netstat  ← win32)
         (sh / kill / lsof            ← darwin/linux)
```

---

## 快速开始

### 环境要求

| 依赖 | 用途 | 安装方式 |
|------|------|----------|
| **Node.js >= 18** | 前端构建 & npm 包管理 | [nodejs.org](https://nodejs.org/) |
| **Rust 工具链** (stable) | 编译 Tauri 后端 | `winget install Rustlang.Rustup` 或 [rustup.rs](https://rustup.rs/) |
| **MSVC 链接器**（仅 Windows）| Rust 编译器需 link.exe | `winget install Microsoft.VisualStudio.2022.BuildTools --override "--wait --quiet --add Microsoft.VisualStudio.Workload.VCTools --add Microsoft.VisualStudio.Component.VC.Tools.x86.x64"` |
| **系统 WebView** | 渲染 UI | Win10+ 自带 WebView2（Win11 预装）；macOS 自带 WKWebView；Linux 需安装 `webkit2gtk` |

> **注意**：Tauri CLI 通过 npm script 调用，**无需全局安装** `@tauri-apps/cli`。

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
# Tauri 窗口 + Vite 热更新（推荐）
npm run tauri:dev

# 仅前端页面调试（无桌面外壳）
npm run dev
```

### 生产构建

```bash
# 构建当前平台的安装包（Windows → NSIS）
npm run tauri:build
```

---

## 构建指南

### 构建前置条件（Windows 完整安装步骤）

如果你是第一次在本机构建，按以下顺序安装：

```powershell
# 1. Rust 工具链（若未装）
winget install Rustlang.Rustup

# 2. VS 2022 Build Tools（MSVC 链接器，若未装）
winget install Microsoft.VisualStudio.2022.BuildTools --override "--wait --quiet --add Microsoft.VisualStudio.Workload.VCTools --add Microsoft.VisualStudio.Component.VC.Tools.x86.x64"

# 3. NSIS（安装包打包工具，若上方 tauri:build 下载失败则手动安装）
# 浏览器打开 https://nsis.sourceforge.io/Download 下载 nsis-3.11.exe 并安装

# 4. 验证
rustc --version    # 应输出 rustc 1.xx
cargo --version    # 应输出 cargo 1.xx
& "C:\Program Files (x86)\NSIS\makensis.exe" /VERSION   # 应输出 v3.11
```

### 构建产物位置

运行 `npm run tauri:build` 后，产物按平台输出到：

```
src-tauri/target/release/bundle/
├── nsis/
│   └── Carvis_0.10.0_x64-setup.exe      ← Windows 安装包（~2.2 MB）
├── msi/
│   └── Carvis_0.10.0_x64.msi            ← Windows MSI 安装包
├── dmg/
│   └── Carvis_0.10.0_x64.dmg            ← macOS DMG 安装包（需在 macOS 构建）
├── macos/
│   └── Carvis.app                       ← macOS 应用包
├── appimage/
│   └── Carvis_0.10.0_amd64.AppImage      ← Linux AppImage
└── deb/
    └── carvis_0.10.0_amd64.deb           ← Linux deb 包
```

其中 **NSIS 安装包** 是 Windows 上最常用的分发格式，用户双击即可安装。

### 构建流程详解

`npm run tauri:build` 实际执行以下步骤：

1. **`vite build`** — 编译 Vue 前端到 `dist/`
2. **`cargo build --release`** — 编译 Rust 后端，将 `dist/` 内嵌到二进制，生成 `carvis.exe`
3. **Tauri 打包器** — 将 `carvis.exe` 打包为 NSIS/DMG 等安装包格式

首次构建会：
- 下载并编译全部 Rust 依赖（约 200+ crate，约 2-3 分钟）
- 自动从 GitHub 下载 NSIS 工具（约 10 秒，若网络不可达则手动安装 NSIS）

后续构建仅增量编译，通常 < 1 分钟。

### 更换应用图标

```bash
# 准备一张 ≥1024×1024 的正方形 PNG
npm run tauri:icon path/to/icon.png

# 重新构建（新图标会自动嵌入二进制和安装包）
npm run tauri:build
```

> `tauri icon` 会自动生成 Windows ICO（6 尺寸内嵌）、macOS ICNS、Android / iOS 等全部平台所需的图标文件到 `src-tauri/icons/`。

### 构建缓存清理

以下目录均为可再生的构建产物，安全删除以释放空间：

| 目录 | 典型大小 | 内容 | 重建命令 |
|------|---------|------|---------|
| `src-tauri/target/` | ~1.7 GB | Rust 编译缓存（.rlib/.pdb/.exe） | `npm run tauri:build` |
| `node_modules/` | ~976 MB | npm 依赖包 | `npm install` |
| `dist/` | ~752 KB | 前端构建产物 | `npm run build` |

> `release/` 目录下的 `Carvis.exe` 是预构建的便携版，可直接双击运行，无需安装。

---

## 打包说明

### 打包配置

由 `src-tauri/tauri.conf.json` 中的 `bundle.targets` 控制：

| 配置项 | 值 |
|--------|-----|
| `identifier` | `com.carvis.app` |
| `productName` | Carvis |
| Windows 打包格式 | NSIS 安装包（含中文语言包，可选安装目录） |
| macOS 打包格式 | DMG 磁盘映像 + `.app` |
| Linux 打包格式 | AppImage + deb |
| 图标 | `src-tauri/icons/`（tauri icon 生成）|

> 各平台安装包需在对应平台上构建。Windows 上只能构建 NSIS/MSI，macOS 上只能构建 DMG。

### NSIS 安装包特点

- **语言**：简体中文 + English
- **安装路径**：默认 `C:\Program Files\Carvis\`
- **快捷方式**：自动创建开始菜单（可选桌面快捷方式）
- **卸载**：通过 Windows「添加或删除程序」卸载
- **静默安装**：支持 `/S` 参数（`Carvis_0.10.0_x64-setup.exe /S`）

---

## 配置说明

服务配置存储在 Tauri 应用配置目录：

```
Windows: %APPDATA%/com.carvis.app/config.json
macOS:   ~/Library/Application Support/com.carvis.app/config.json
Linux:   ~/.config/com.carvis.app/config.json
```

**平滑迁移**：旧版 Electron 的配置（`%APPDATA%/Carvis/config.json`）会在首次启动时自动被读取并写入新的 Tauri 配置目录，无需手动拷贝。

### 配置结构

```json
{
  "services": [
    {
      "id": "frontend",
      "name": "frontend",
      "label": "前端服务",
      "cwd": "C:/projects/my-app",
      "command": "pnpm",
      "args": ["run", "dev"],
      "port": 3000
    }
  ],
  "groups": [
    {
      "id": "group-xxx",
      "name": "前端组",
      "serviceIds": ["frontend"],
      "_expanded": true
    }
  ],
  "portKiller": {
    "ports": [8080, 3000]
  },
  "settings": {
    "autoStart": false,
    "minimizeToTray": false,
    "theme": "system"
  }
}
```

---

## 依赖变化（Electron → Tauri）

**已移除（Electron 时代）**：
- `electron` / `electron-builder` — 桌面框架与打包工具
- `sharp` / `png-to-ico` / `create-icon.js` — 图标生成脚本（改用 `tauri icon`）
- `concurrently` / `wait-on` — 开发期并行脚本
- 目录 `electron/`、`site/`、`scripts/`（不再需要）

**新增（Tauri 时代）**：
- 运行时：`@tauri-apps/api`、`@tauri-apps/plugin-shell`、`@tauri-apps/plugin-opener`、`@tauri-apps/plugin-autostart`
- 开发期：`@tauri-apps/cli`
- 后端（Rust / `Cargo.toml`）：`tauri`、`tauri-plugin-shell`、`tauri-plugin-opener`、`tauri-plugin-autostart`、`tauri-plugin-single-instance`、`serde`、`serde_json`、`tokio`、`dirs`

> **说明**：单实例能力由 Rust 端的 `tauri-plugin-single-instance` 在初始化回调中实现，没有对应的 JS 包，因此不出现在 `package.json` 的前端依赖里。

---

## 工具对比

| 能力维度 | Carvis | VS Code 终端 | PM2 | 手动 PowerShell |
|---------|--------|-------------|-----|-----------------|
| **图形化界面** | ✅ 专业 GUI | ✅ 内嵌终端 | ❌ 纯 CLI | ❌ 纯终端 |
| **多服务统一视图** | ✅ 侧边栏 + Tab | ⚠️ 需多分屏 | ✅ 列表形式 | ❌ 多窗口混乱 |
| **一键批量启停** | ✅ 分组/全部 | ❌ 逐个操作 | ✅ 支持 | ❌ 逐个操作 |
| **实时状态感知** | ✅ 端口+日志双检测 | ❌ 无状态概念 | ✅ 进程检测 | ❌ 无感知 |
| **端口清理** | ✅ 一键清理（带服务保护） | ❌ 需手动 | ❌ 不支持 | ❌ 需手动查杀 |
| **日志聚合展示** | ✅ Tab 切换 + 着色 | ⚠️ 分散在各终端 | ✅ log 支持 | ❌ 各自窗口 |
| **服务分组** | ✅ 可视化分组管理 | N/A | ⚠️ 需配置 | N/A |
| **配置门槛** | ✅ 图形化 | N/A | ⚠️ 需编辑 JSON | N/A |
| **安装体积** | ~2 MB（NSIS 安装包） | >300 MB | npm 包 | 0 |
| **上手成本** | 极低 | 低 | 中等 | 高 |

---

## 版本说明

当前为 **0.10.0（Tauri 版）**。本版本将底层桌面框架从 Electron 迁移至 Tauri 2，功能与交互完全保持一致，但：
- **安装包**：~60 MB → **~2 MB**（减少 97%）
- **内存占用**：更低（无 Chromium 内核常驻）
- **启动速度**：更快（无需初始化浏览器引擎）

---

## License

MIT
