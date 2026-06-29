# Carvis — 本地开发服务管理工具

**菜维斯，为你分担一点点🤏工作**

Carvis 是一款面向开发者的本地服务管理桌面应用，用图形化界面替代繁琐的命令行操作，让启动、监控、管理多个开发服务变得像点击按钮一样简单。

<img width="1920" height="1400" alt="PixPin_2026-06-29_12-55-28" src="https://github.com/user-attachments/assets/e47a3623-00bc-44e1-82ab-65ab51d8e9ea" />


## 应用场景

### 早晨开工，一键启动全部

打开 Carvis → 点击各分组的「启动全部」→ 所有开发服务依次启动 → 侧边栏逐个变绿 → 开始写代码

### 排查问题，查看实时日志

某个服务报错了 → 在侧边栏点击对应服务 → 右侧终端面板实时显示日志 → 发现错误堆栈 → 定位问题修复

### 端口冲突，快速清理

改完代码重启服务提示端口被占用 → 在侧边栏找到端口清理区域 → 点击「清理端口」→ 僵尸进程被终止 → 重新启动成功

### 新人入职，零学习成本

新同事打开 Carvis 设置界面 → 看到按分组组织的服务配置 → 了解每个服务的命令和端口 → 无需询问老员工


## 功能特性

### 服务生命周期管理

- **启动 / 停止 / 重启** — 单个服务的完整生命周期控制
- **批量操作** — 一键启动全部 / 停止全部服务
- **分组批量控制** — 按分组启动或停止组内所有服务
- **状态实时同步** — 侧边栏状态指示灯与右侧内容区联动
  - 🟢 运行中 (running)
  - 🟡 启动中 (starting) / 停止中 (stopping)
  - ⚪ 已停止 (stopped)-已停止 (stopped)
- **智能状态感知**：
  - 端口轮询检测（500ms 间隔），服务就绪后即时标记为 running
  - 日志关键词识别（`[OK] 已就绪`），双重保障状态准确性
  - 60 秒超时兜底机制，防止状态卡死
- **防重复启动** — 同一服务不允许重复启动，避免端口冲突
- **优雅退出** — 应用关闭时自动停止所有运行中的服务，不留僵尸进程

### 终端日志系统

- **实时日志流** — stdout / stderr 实时采集，终端风格滚动显示
- **多服务 Tab 切换** — 顶部 Tab 栏快速切换不同服务的日志视图（按分组过滤）
- **智能日志着色**：
  - `[ERROR]` → 红色高亮
  - `[WARN]` → 黄色高亮
  - `[OK]` → 绿色高亮
  - `[INFO]` → 灰色默认
  - `[STDERR]` → 橙色区分
- **HTTP 地址可点击** — 自动识别日志中的 URL，点击直接调用系统浏览器打开
- **ANSI 码清洗** — 自动剥离终端颜色码，确保界面渲染干净
- **日志清空** — 一键清除当前 Tab 日志
- **自动滚动** — 新日志自动滚到底部，支持手动回溯查看
- **内存保护** — 单服务日志最大 500 条，超限自动裁剪

### 端口清理

- **占用检测** — 跨平台扫描指定端口的监听进程（Windows: netstat / macOS: lsof）
- **智能保护** — 自动跳过正在由 Carvis 管理的服务端口，防止误杀
- **一键终止** — 自动识别 PID 并执行跨平台强制终止（Windows: taskkill / POSIX: kill -9）
- **清理反馈** — 详细的终止结果日志（终止数 / 跳过数 / 失败数）

### 服务分组管理

- **创建分组** — 按项目或功能模块将服务组织到分组中
- **重命名 / 删除** — 随时调整分组名称和结构
- **排序调整** — 支持上移 / 下移调整分组排列顺序
- **展开 / 折叠** — 分组头部一键展开或折叠，默认收起
- **服务分配** — 右键菜单快速将服务分配到指定分组（或取消分组）
- **分组内批量操作** — 分组内的服务支持一键全部启动或停止

### 图形化配置中心

- **服务 CRUD** — 添加、编辑、删除服务配置，所见即所得
- **字段完备** — ID、显示名称、工作目录、启动命令、命令参数、监听端口
- **分组管理** — 创建 / 重命名 / 删除 / 排序分组，分配服务
- **端口清理配置** — 独立管理需要监控的端口列表
- **配置校验** — 自动校验并修复异常配置，服务 ID 和端口范围双重校验
- **持久化存储** — 配置自动保存至 `%APPDATA%/carvis/config.json`

### 主题与界面适配

- **三模主题** — 亮色 / 暗色 / 跟随系统，满足不同光线环境和使用偏好
- **CSS 变量驱动** — 通过 CSS 自定义属性覆盖实现主题切换，零运行时开销
- **暗色品牌形象** — 暗色模式下自动替换为适配深色背景的品牌图片
- **系统偏好感知** — 跟随系统模式自动监听 `prefers-color-scheme` 变化，无需重启

### 用户体验设计

- **无边框窗口** — 自定义标题栏，现代化的视觉风格
- **窗口控制** — 最小化 / 最大化 / 关闭，原生级交互体验
- **系统托盘** — 最小化到托盘，托盘菜单「打开」/「退出」
- **搜索过滤** — 侧边栏搜索框，快速定位服务（支持名称 + ID 模糊匹配）
- **右键菜单** — 服务与分组右键快捷操作（重命名、分配到组、打开文件夹）
- **重命名弹窗** — 统一的弹窗式重命名交互
- **服务信息卡片** — 工作目录（支持一键打开文件夹）、运行端口、启动命令一览无余
- **品牌形象** — 可爱的小鸟形象「菜维斯」，暗色模式自动替换适配深色背景
- **主题选择** — 亮色 / 暗色 / 跟随系统三模切换，基础设置中随时调整

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vue 3 (Composition API) + Vite |
| 桌面框架 | Electron 35 |
| 构建打包 | electron-builder (NSIS / DMG) |
| 样式 | 纯 CSS（无 UI 框架依赖） |
| 字体 | Inter（界面）+ JetBrains Mono（终端） |
| 生产依赖 | 仅 Vue 3 |
| 平台支持 | Windows 10+ / macOS 11+ (Intel + Apple Silicon) |

## 项目结构

```
carvis/
├── electron/                    # Electron 主进程
│   ├── main.js                  # 主进程入口（窗口/托盘/IPC/生命周期）
│   ├── preload.js               # 预加载脚本（安全暴露 IPC API）
│   ├── processManager.js        # 进程管理核心（启动/停止/端口检测/配置持久化）
│   └── platform.js              # 平台差异集中管理（跨平台抽象层）
├── src/                         # Vue 前端
│   ├── components/              # 组件
│   │   ├── TerminalPanel.vue    # 终端日志面板（Tab 切换 + 日志渲染）
│   │   ├── SettingsModal.vue    # 设置弹窗（服务/分组/端口/应用设置）
│   │   └── PortKiller.vue       # 端口清理按钮组件
│   ├── styles/
│   │   └── marvis-light.css     # 主题样式（亮色 + 暗色 CSS 变量覆盖）
│   ├── App.vue                  # 根组件（侧边栏 + 主内容区 + 状态管理）
│   └── main.js                  # Vue 入口
├── build/                       # 构建资源
│   ├── icon.png                 # 应用图标（源 PNG）
│   └── icon.ico                 # 应用图标（Windows ICO）
├── site/                        # 品牌宣传页面
│   ├── index.html
│   └── juese.png                # 品牌形象图片
├── dist/                        # Vite 构建输出（可通过 npm run build 重新生成）
├── package.json
├── vite.config.js
└── index.html
```

### 架构说明

```
┌─────────────────────────────────────┐
│            渲染进程 (Renderer)        │
│  ┌───────────┐  ┌────────────────┐  │
│  │  Vue 3    │  │  纯 CSS 主题      │  │
│  │  Vite     │  │  (亮色/暗色/系统) │  │
│  └───────────┘  └────────────────┘  │
├─────────────────────────────────────┤
│         IPC Bridge (preload)        │
│   contextIsolation + 安全通信       │
│   统一返回格式: { success, data?,   │
│                      error? }       │
├─────────────────────────────────────┤
│            主进程 (Main)             │
│  ┌───────────┐  ┌────────────────┐  │
│  │  Electron │  │ processManager │  │
│  │  窗口/托盘│  │  │  │  进程/端口/配置  │  │
│  │  └────────┼─────────┘  │
│  │     platform.js        │
│  │   (跨平台抽象层)        │
└────────────────────────────┘
         ↕ OS 层: child_process / net
         (cmd.exe / taskkill / netstat ← win32)
         (sh / kill / lsof ← darwin/linux)
```

## 快速开始

### 环境要求

- Node.js >= 18
- npm 或 pnpm

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
# 启动 Electron + Vite 开发服务器
npm run electron:dev

# 仅启动前端页面（不含 Electron）
npm run dev
```

### 生产构建

```bash
# 构建 Windows 安装包
npm run electron:build:win

# 构建 macOS DMG 安装包（需在 macOS 上执行）
npm run electron:build:mac

# 同时构建 Windows + macOS（需在 macOS 上执行）
npm run electron:build:all
```

构建命令会依次执行 `vite build`（前端构建）和 `electron-builder`（平台打包），输出到 `release/` 目录。

> **注意**：macOS 构建必须在 macOS 系统上执行。Windows 上只能构建 Windows 安装包。

## 配置说明

服务配置存储在用户目录下：

```
%APPDATA%/carvis/config.json
```

可通过设置界面管理，也可手动编辑（修改后需重启应用）。

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

## 打包说明

### 打包输出

输出目录由 `build.directories.output` 配置，打包产物文件名由 `artifactName` 控制（默认 `${productName}-${version}.${ext}`）。

```
release/
├── win-unpacked/                    # Windows 解压版（可直接运行）
│   ├── Carvis.exe
│   └── resources/
│       └── app.asar
├── Carvis-1.0.2.exe                 # Windows NSIS 安装包
├── Carvis-1.0.2.exe.blockmap
├── mac-arm64/                       # macOS 解压版（Apple Silicon）
│   └── Carvis.app
├── Carvis-1.0.2.dmg                 # macOS DMG 安装包
└── Carvis-1.0.2-mac.zip             # macOS ZIP 分发包
```

### 打包配置

| 配置项 | Windows | macOS |
|--------|---------|-------|
| `appId` | `com.carvis.app` | `com.carvis.app` |
| `productName` | Carvis | Carvis |
| 打包格式 | NSIS 安装包 | DMG 磁盘映像 + ZIP |
| 图标格式 | `icon.ico` | `icon.icns`（从 PNG 自动生成）|
| 安装目录 | 可自定义 | 拖入 Applications |
| 分类 | — | `developer-tools` |

### 更换应用图标

1. 准备一张正方形 PNG 图片（建议 1024x1024 或更大）
2. 临时安装图标生成依赖：

```bash
npm install --no-save sharp png-to-ico
```

3. 运行图标生成脚本：

```bash
node create-icon.js <你的图标文件>
# 例如: node create-icon.js ./logo.png
```

该脚本会生成：
- `build/icon.png` — 256x256 跨平台应用图标（圆角）
- `build/icon.ico` — Windows ICO 图标
- `build/icon-tray.png` — 16x16 macOS 托盘图标
- `build/icon.icns` — macOS ICNS 图标（仅在 macOS 上生成）

4. 清理临时依赖：

```bash
npm uninstall sharp png-to-ico
```

5. 重新执行打包命令

## 项目维护

### 文件清理

项目已进行以下优化，不影响核心功能：

1. **移除冗余依赖**：`sharp` 和 `png-to-ico` 已从 `package.json` 中移除
   - 这两个包仅用于图标生成，已生成的图标文件保留在 `build/` 目录
   - 需要更新图标时，可临时安装依赖（见上方"更换应用图标"步骤）

2. **清理空目录**：已删除 `.agents/` 空目录

3. **修复资源引用**：已将 `public/juese.png` 复制到 `site/` 目录，修复品牌宣传页面图片缺失问题

4. **构建产物**：`dist/` 目录为 Vite 构建输出，可通过 `npm run build` 重新生成
   - 该目录已被 `.gitignore` 排除，不影响版本控制

### 依赖管理

当前生产依赖仅有 Vue 3，开发依赖包括：
- `@vitejs/plugin-vue`：Vite 插件
- `concurrently`：并行运行开发命令
- `electron`：桌面框架
- `electron-builder`：打包工具
- `vite`：构建工具
- `wait-on`：等待服务就绪


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
| **安装体积** | ~60MB | >300MB | npm 包 | 0 |
| **上手成本** | 极低 | 低 | 中等 | 高 |

## License

MIT
