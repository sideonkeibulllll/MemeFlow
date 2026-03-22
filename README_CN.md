<p align="center">
  <a href="README.md">English</a> | 
  <a href="README_CN.md">简体中文</a> | 
  <a href="README_FR.md">Français</a>
</p>

<h1 align="center">✨ MemeFlow</h1>

<p align="center">
  <strong>你的专属表情包启动器。一键复制，瞬间回应。</strong>
</p>

<p align="center">
  <a href="#功能特性">功能特性</a> •
  <a href="#安装指南">安装指南</a> •
  <a href="#开发者专区">开发者专区</a> •
  <a href="#技术栈">技术栈</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-windows%20%7C%20android-lightgrey" alt="Platform">
  <img src="https://img.shields.io/badge/electron-40.8-blue" alt="Electron">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
</p>

---

## v1.1 更新内容

🔧 **Android 兼容性修复** — 现已完全兼容 Android 8.1+ (API 27+)。将 JavaScript 重写为 ES5 语法，支持更多 WebView 版本。

⚡ **性能优化** — 优化表情包加载和渲染流程。

🐛 **Bug 修复** — 修复 ZIP 导入计数问题，解决旧版 Android 设备上的脚本加载问题。

---

## 功能特性

🚀 **极速响应** — 点击即复制，粘贴即发送。告别翻文件夹找表情的日子。

🎲 **智能随机** — 权重算法学习你的偏好，常用表情出现概率更高。

🏷️ **标签分类** — 自定义标签 + 四种情绪分类：快乐、悲伤、震惊、社交。

🔍 **快速搜索** — 按标签或分类筛选，秒速找到完美表情。

📦 **便捷导入** — 拖放 ZIP 文件批量导入你的表情包收藏。

📱 **跨平台** — Windows 桌面端现已推出，Android 端即将上线。同样流畅的体验。

⌨️ **快捷键支持** — 长按 `空格` 自动刷新，按 `S` 打开搜索。为效率党设计。

---

## 安装指南

### Windows（推荐）

1. 前往 [Releases](https://github.com/sideonkeibulllll/MemeFlow/releases) 下载最新版本
2. 运行安装程序或便携版可执行文件
3. 通过 ZIP 导入表情包，或直接放入 assets 文件夹
4. 开始斗图！🎉

### 从源码构建

```bash
# 克隆仓库
git clone https://github.com/sideonkeibulllll/MemeFlow.git

# 安装依赖
npm install

# 开发模式运行
npm start

# 构建 Windows 版本
npm run build:win
```

### Android

```bash
npm run build:android
# 然后用 Android Studio 打开 android/ 目录
```

---

## 使用方法

| 操作 | 结果 |
|------|------|
| **左键点击** | 复制表情到剪贴板 |
| **右键点击** | 编辑标签和分类 |
| **长按空格** | 每秒自动刷新 |
| **按 S 键** | 打开搜索面板 |
| **点击刷新** | 加载新的随机表情 |

---

## 开发者专区

MemeFlow 以简洁和可扩展为设计理念。欢迎贡献或 Fork：

### 项目架构

```
├── main.js           # Electron 主进程（IPC 处理、文件操作）
├── index.html        # 桌面端 UI（原生 JS，无框架开销）
├── web/              # Capacitor 移动端资源
├── android/          # Android 原生项目
└── build-web.js      # 移动端构建脚本
```

### 设计决策

- **零框架前端** — 原生 JS 实现最小体积和即时加载
- **JSON 存储** — 无需数据库，用户数据本地化、可移植
- **加权随机算法** — 简单高效的个性化推荐
- **IPC 通信** — Electron 与渲染进程清晰分离

### 参与贡献

欢迎各种形式的贡献：

- 🐛 Bug 修复
- ✨ 新功能（深色模式、GIF 支持等）
- 📱 iOS 支持
- 🌍 翻译改进

```bash
# Fork 后：
git checkout -b feature/amazing-feature
git commit -m "Add amazing feature"
git push origin feature/amazing-feature
# 创建 Pull Request
```

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面端 | Electron |
| 移动端 | Capacitor |
| 前端 | 原生 JavaScript, CSS Grid |
| 构建 | electron-builder |
| 解压 | adm-zip |

---

## 开发路线

- [ ] 深色模式
- [ ] GIF 动画预览
- [ ] iOS 支持
- [ ] 云同步（可选）
- [ ] 插件系统

---

## 许可证

MIT © [sideonkeibulllll](https://github.com/sideonkeibulllll)

---

<p align="center">
  为所有表情包爱好者 💖 制作
</p>
