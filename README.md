<p align="center">
  <a href="README.md">English</a> | 
  <a href="README_CN.md">简体中文</a> | 
  <a href="README_FR.md">Français</a>
</p>

<h1 align="center">✨ MemeFlow</h1>

<p align="center">
  <strong>Your personal meme launcher. One click, instant reaction.</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#screenshots">Screenshots</a> •
  <a href="#installation">Installation</a> •
  <a href="#for-developers">For Developers</a> •
  <a href="#tech-stack">Tech Stack</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-windows%20%7C%20android-lightgrey" alt="Platform">
  <img src="https://img.shields.io/badge/electron-40.8-blue" alt="Electron">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
</p>

---

## What's New in v1.1

🔧 **Android Compatibility Fix** — Now fully compatible with Android 8.1+ (API 27+). Rewrote JavaScript to ES5 for broader WebView support.

⚡ **Performance Improvements** — Optimized meme loading and rendering pipeline.

🐛 **Bug Fixes** — Fixed ZIP import counter, resolved script loading issues on older Android devices.

---

## Features

🚀 **Lightning Fast** — Click to copy, paste to chat. No more digging through folders.

🎲 **Smart Random** — Weighted algorithm learns your favorites. The memes you love appear more often.

🏷️ **Tag & Categorize** — Organize with custom tags and 4 emotion categories: Happy, Sad, Shock, Social.

🔍 **Quick Search** — Find the perfect reaction in seconds with tag/category filters.

📦 **Easy Import** — Drag & drop ZIP files to bulk import your meme collection.

📱 **Cross-Platform** — Desktop (Windows) today, Android tomorrow. Same experience, everywhere.

⌨️ **Keyboard Friendly** — Hold `Space` to auto-refresh, `S` to search. Power user approved.

---

## Screenshots

> Coming soon...

---

## Installation

### Windows (Recommended)

1. Download the latest release from [Releases](https://github.com/sideonkeibulllll/MemeFlow/releases)
2. Run the installer or portable executable
3. Import your memes via ZIP or drop them in the assets folder
4. Start reacting! 🎉

### From Source

```bash
# Clone the repository
git clone https://github.com/sideonkeibulllll/MemeFlow.git

# Install dependencies
npm install

# Run in development mode
npm start

# Build for Windows
npm run build:win
```

### Android

```bash
npm run build:android
# Then open android/ in Android Studio
```

---

## Usage

| Action | Result |
|--------|--------|
| **Left Click** | Copy meme to clipboard |
| **Right Click** | Edit tag & category |
| **Hold Space** | Auto-refresh every second |
| **Press S** | Open search panel |
| **Click Refresh** | Load new random memes |

---

## For Developers

MemeFlow is built with simplicity and extensibility in mind. Here's why you might want to contribute or fork:

### Architecture

```
├── main.js           # Electron main process (IPC handlers, file ops)
├── index.html        # Desktop UI (vanilla JS, no framework overhead)
├── web/              # Capacitor web assets for mobile
├── android/          # Native Android project
└── build-web.js      # Build script for mobile deployment
```

### Key Design Decisions

- **Zero Framework Frontend** — Vanilla JS for minimal bundle size and instant load times
- **JSON-based Storage** — No database needed, user data stays local and portable
- **Weighted Random Algorithm** — Simple yet effective personalization
- **IPC Communication** — Clean separation between Electron and renderer

### Contributing

Contributions are welcome! Areas of interest:

- 🐛 Bug fixes
- ✨ New features (dark mode, GIF support, etc.)
- 📱 iOS support
- 🌍 Translations

```bash
# Fork, then:
git checkout -b feature/amazing-feature
git commit -m "Add amazing feature"
git push origin feature/amazing-feature
# Open a Pull Request
```

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop | Electron |
| Mobile | Capacitor |
| Frontend | Vanilla JavaScript, CSS Grid |
| Build | electron-builder |
| Archive | adm-zip |

---

## Roadmap

- [ ] Dark mode
- [ ] GIF animation preview
- [ ] iOS support
- [ ] Cloud sync (optional)
- [ ] Plugin system

---

## License

MIT © [sideonkeibulllll](https://github.com/sideonkeibulllll)

---

<p align="center">
  Made with 💖 for meme lovers everywhere
</p>
