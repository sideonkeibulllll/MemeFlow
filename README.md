# MemeFlow

A cross-platform meme/sticker management application with intelligent random display, tagging system, and seamless clipboard integration.

## Features

- **Random Display**: Grid-based meme display with customizable layout (1x1 to 4x4)
- **Smart Weight System**: Frequently used memes get higher probability of appearing
- **Tag & Category**: Add custom tags and categorize memes (Happy, Sad, Shock, Social)
- **Quick Search**: Search by tags or filter by category
- **One-Click Copy**: Click to copy meme to clipboard instantly
- **ZIP Import**: Import meme collections from ZIP files
- **Cross-Platform**: Desktop (Electron) and Android (Capacitor) support

## Tech Stack

- **Desktop**: Electron
- **Mobile**: Capacitor + Android
- **Frontend**: Vanilla JavaScript, CSS Grid
- **Build**: electron-builder

## Installation

### Desktop (Windows)

```bash
# Install dependencies
npm install

# Run in development
npm start

# Build Windows executable
npm run build:win
```

### Android

```bash
# Prepare web assets and sync to Android
npm run build:android
```

## Usage

| Action | Description |
|--------|-------------|
| **Click** | Copy meme to clipboard |
| **Right-click** | Edit tag and category |
| **Space (hold)** | Auto-refresh every second |
| **S key** | Open search panel |

## Project Structure

```
├── main.js              # Electron main process
├── index.html           # Desktop UI
├── web/                 # Capacitor web assets
├── android/             # Android project
├── assets/              # Meme storage (dev)
├── build-web.js         # Web build script
└── dist/                # Built executables
```

## Data Storage

- **Weights**: `meme-weights.json` (user data directory)
- **Tags**: `meme-tags.json` (user data directory)
- **Assets**: User data directory (production) / `assets/` (development)

## License

MIT
