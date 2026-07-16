# MemeFlow 开发者指南

> 面向外部开发者的项目概览与技术决策参考

## 项目定位

**MemeFlow**（随机表情包）是一个跨平台的表情包管理/启动器，核心场景是：**一键点击，即时复制/分享表情包**。用户只需将表情包图片放入指定目录，即可在桌面端或移动端浏览、搜索、快速使用。

- **桌面端**：Electron 应用，支持复制到剪贴板
- **移动端**：Android 应用（Capacitor WebView），支持分享到其他 App

## 技术栈决策

| 层级 | 选择 | 理由 |
|------|------|------|
| 桌面框架 | **Electron 40** | 成熟稳定，直接访问文件系统，打包方便 |
| 移动框架 | **Capacitor 8** | 基于 Web 技术，一套前端代码生成 Android/iOS 应用 |
| 前端 | **Vanilla JS（零框架）** | 极简体积，无构建步骤，直接修改 HTML/CSS/JS 即可生效 |
| 数据存储 | **JSON 本地文件** | 数据量小（图片列表 + 权重 + 标签），无需数据库 |
| 构建脚本 | **Python** | 自动化复制资源、同步 Capacitor、构建 APK/EXE |

### 为什么是 Vanilla JS 而不是 React/Vue？

- 应用逻辑简单，主要是网格渲染 + 点击事件
- 零构建步骤，修改 HTML 即可热更新开发
- 包体积极小（移动端尤其重要）
- 降低贡献门槛，任何懂前端的人都能立即修改

## 项目结构速览

```
picture-awa-manual/
├── main.js                 # Electron 主进程（文件系统、IPC、窗口管理）
├── index.html              # 桌面端 UI（内联 CSS + JS）
├── web/
│   ├── index.html          # 移动端 UI（Capacitor WebView 加载）
│   └── jszip.min.js        # ZIP 解压库（批量导入）
├── android/                # Android 原生项目（Capacitor 生成）
├── assets/                 # 表情包图片源目录
├── -qq-vv-awa/             # 图片素材源（构建时复制到 assets）
├── build-web.js            # 构建脚本：图片 -> web/assets
├── build_all.py            # 全自动构建脚本（APK + EXE）
├── capacitor.config.json   # Capacitor 配置
└── package.json            # npm 依赖与脚本
```

## 如何参与开发

### 前置条件

| 工具 | 用途 | 版本要求 |
|------|------|----------|
| Node.js | 运行 Electron、Capacitor | >= 18 |
| Python | 运行构建脚本 | >= 3.8 |
| JDK | Android 编译 | >= 17 |
| Android SDK | Android 编译 | API 36（compileSdk） |

### 核心开发流程

```bash
# 1. 安装依赖
npm install

# 2. 桌面端开发（热更新）
# 直接修改 index.html / main.js，然后：
npm start

# 3. 移动端开发
# 3a. 同步 web 资源到 Android
npm run sync:android

# 3b. 用 Android Studio 打开 android/ 目录运行
```

### 完整构建（自动化）

```bash
# 完整构建（含图片）
python build_all.py full

# 仅构建 APK
python build_all.py apk

# 仅构建 EXE
python build_all.py exe
```

## 架构要点

### 数据流

```
用户操作 → 渲染进程 (index.html)
                ↓ IPC
          Electron 主进程 (main.js)
                ↓
          文件系统 (JSON + 图片)
```

- 桌面端通过 Electron IPC 进行文件读写
- 移动端通过 Capacitor Filesystem 插件操作文件
- 两种平台共享同一套前端 UI 逻辑（`web/index.html`）

### 加权随机算法

高频使用的表情包更大概率被展示：

1. 每个表情包维护一个 `weight` 值
2. 使用次数越多，权重越高
3. 构建前缀和数组，二分查找实现 O(log n) 随机选择
4. 数据持久化到 `meme-weights.json`

### 跨平台代码复用

- `web/index.html` 是移动端入口，`index.html` 是桌面端入口
- 两者代码相似但有差异（复制 vs 分享，快捷键不同等）
- 构建时 `build-web.js` 将图片复制到 `web/assets/` 供移动端使用

## 现有 README 文档

另有面向用户的说明文档：
- [README.md](./README.md) - English
- [README_CN.md](./README_CN.md) - 简体中文
- [README_FR.md](./README_FR.md) - Français
- [信息.md](./信息.md) - 项目详细技术文档（中文）

## 技术债务与改进方向

### 已知限制
- 无单元测试 / E2E 测试
- 移动端与桌面端 UI 各自维护，代码有重复
- 无 CI/CD 流水线
- 图片多时 APK 体积较大（当前 ~120MB）

### 值得贡献的方向
- **自动化测试**：引入 Vitest / Playwright
- **UI 统一**：将桌面端和移动端 UI 抽取为共享模块
- **CI 集成**：GitHub Actions 自动构建 APK
- **云同步**：对接 Cloudflare R2/D1 实现跨设备同步
- **暗黑模式**：CSS 变量方案
- **图片优化**：运行时压缩 / WebP 转换以减少 APK 体积

## 许可

MIT License - 可自由使用、修改、分发。