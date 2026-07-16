# MemeFlow 开发者指南

> 面向外部开发者的项目概览与技术决策参考

## 项目定位

**MemeFlow**（随机表情包）是一个跨平台的表情包管理/启动器，核心场景是：**一键点击，即时分享表情包**。用户只需将表情包图片放入指定目录，即可在移动端浏览、搜索、快速使用。

- **Android 移动端**：Capacitor WebView 应用，支持分享到其他 App
- **桌面端（已停止维护）**：Electron 应用，支持复制到剪贴板

> 当前只维护 Android 版本。桌面 Electron 版本代码保留但不再更新。

## 技术栈决策

| 层级 | 选择 | 理由 |
|------|------|------|
| 移动框架 | **Capacitor 8** | 基于 Web 技术，一套前端代码生成 Android 应用 |
| 前端 | **Vanilla JS（零框架）** | 极简体积，无构建步骤，直接修改 HTML/CSS/JS 即可生效 |
| 数据存储 | **localStorage** | 客户端存储权重、标签、使用记录、网格配置 |
| 图片源 | **assets/public/** | 构建时通过 `build-web.js` 复制到 Capacitor 资源目录 |
| 构建脚本 | **Python** | 自动化复制资源、同步 Capacitor、构建 APK |

### 为什么是 Vanilla JS 而不是 React/Vue？

- 应用逻辑简单，主要是网格渲染 + 点击事件
- 零构建步骤，修改 HTML 即可热更新开发
- 包体积极小（移动端尤其重要）
- 降低贡献门槛，任何懂前端的人都能立即修改

## 版本历史

| 版本 | 说明 |
|------|------|
| v1.3.4 | 当前最新。迁移改坏版功能：顺序浏览、长按返回、网格行列编辑、新图标 |
| v1.3.2 | 新增搜索分类、最多/最近使用、历史页面、配置导入导出 |
| v1.3.0 | 新增加权随机算法、标签系统、ZIP 导入 |
| v1.1 | Android 8.1+ 兼容性、ES5 重写 |
| v1.0 | 初始版本 |

## 项目结构速览

```
picture-awa-manual/
├── web/
│   ├── index.html          # 唯一前端代码（移动端 UI，内联 CSS + JS）
│   └── jszip.min.js        # ZIP 解压库（批量导入）
├── android/                # Android 原生项目（Capacitor 生成）
├── assets/                 # 表情包图片源目录（运行时数据）
├── -qq-vv-awa/             # 图片素材源（构建时复制到 assets）
├── build-web.js            # 构建脚本：图片 -> web/assets
├── build_all.py            # 全自动构建脚本（APK）
├── capacitor.config.json   # Capacitor 配置
├── package.json            # npm 依赖与脚本
├── icon.png                # 应用图标（512x512）
└── DEVELOPER_GUIDE.md      # 本文档
```

## 核心功能详解

### 1. 搜索与筛选

搜索弹窗提供两种模式：

- **标签搜索**：输入关键词，在已有标签文本中匹配
- **分类筛选**：按 4 个预设分类（快乐/滑稽、悲伤/委屈、震惊/愤怒、阴阳怪气/社交）筛选
- **排序模式**（分类下可用）：
  - **顺序浏览**：按文件名顺序排列
  - **最多使用**：按使用次数降序排列
  - **最近使用**：按最后使用时间降序排列

### 2. 网格排列设置

- 行数：1-6
- 列数：1-4
- 支持展开/收起自定义设置区域
- 提供快捷预设按钮（1x1 ~ 3x4）
- 配置保存在 `localStorage`（`meme-grid-config`）

### 3. 历史页面与后退

- 自动保存最近 10 页的浏览历史
- **长按刷新按钮 500ms** 返回上一页
- 左上角显示当前位置（如 `3/10`）
- 历史中前进到末尾后，再次刷新生成新页面

### 4. 加权随机算法

高频使用的表情包更大概率被展示：

1. 每个表情包维护一个 `weight` 值（初始 1）
2. 每次分享使用，权重 +1
3. 按权重比例随机选择
4. 数据持久化到 `localStorage`（`meme-weights`）

### 5. 标签系统

- 长按表情包 500ms 弹出标签编辑框
- 支持文本标签 + 分类选择
- 标签用于搜索匹配
- 数据持久化到 `localStorage`（`meme-tags`）

### 6. 数据存储结构

| localStorage key | 内容 | 说明 |
|------------------|------|------|
| `meme-weights` | 权重数据 | `{ filename: number }` |
| `meme-tags` | 标签数据 | `{ filename: { text, category } }` |
| `meme-usage` | 使用统计 | `{ filename: { count, lastUsed } }` |
| `meme-grid-config` | 网格配置 | `{ rows, cols }` |

## 如何参与开发

### 前置条件

| 工具 | 用途 | 版本要求 |
|------|------|----------|
| Node.js | 运行 Capacitor CLI | >= 18 |
| Python | 运行构建脚本 | >= 3.8 |
| JDK | Android 编译 | >= 17 |
| Android SDK | Android 编译 | API 36（compileSdk） |

### 开发流程

```bash
# 1. 安装依赖
npm install

# 2. 准备图片资源
# 将图片放入 -qq-vv-awa/ 目录（或直接放入 assets/）

# 3. 构建 web 资源
npm run prepare:web

# 4. 同步到 Android
npx cap sync android

# 5. 用 Android Studio 打开 android/ 目录运行

# 6. 构建 APK
cd android
.\gradlew.bat assembleDebug
```

### 完整构建（自动化）

```bash
# 完整构建 APK（含图片）
python build_all.py apk

# 完整构建（APK + EXE，不推荐）
python build_all.py full
```

APK 输出位置：`release/meme-random-v{version}.apk`

## 架构要点

### 数据流

```
用户操作 → web/index.html (WebView)
                ↓
          localStorage (权重/标签/配置)
                ↓
          Capacitor Filesystem 插件 (图片读写)
```

- 所有 UI 逻辑在 `web/index.html` 中内联
- 数据持久化使用 `localStorage`（JSON 序列化）
- 图片资源默认打包在 APK 中（`assets/public/`）

### 跨平台兼容性

- 代码使用 ES5 语法（兼容 Android 8.1+ WebView）
- 通过 `Capacitor.isNativePlatform()` 判断运行环境
- 非 Android 环境（浏览器调试）通过 `fetch('assets/memes.json')` 加载图片列表

## 已知限制与改进方向

### 当前限制
- 无单元测试 / E2E 测试
- 无 CI/CD 流水线
- 图片多时 APK 体积较大（当前 ~120MB）
- 所有数据存储在本地，无云同步

### 值得贡献的方向
- **自动化测试**：引入 Vitest / Playwright
- **CI 集成**：GitHub Actions 自动构建 APK
- **云同步**：对接 Cloudflare R2/D1 实现跨设备同步
- **暗黑模式**：CSS 变量方案
- **图片优化**：运行时压缩 / WebP 转换以减少 APK 体积
- **性能优化**：虚拟滚动/懒加载优化大量图片场景

## 许可

MIT License - 可自由使用、修改、分发。