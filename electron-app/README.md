# Pharma ERP - Desktop Application

Electron wrapper for building Windows/macOS/Linux desktop installers.

## Prerequisites

- Node.js 18+
- npm or yarn
- Python 3.10+ (for backend packaging)
- PyInstaller (for bundling Python backend)

## Quick Start

```bash
# Install dependencies
npm install

# Run in development mode
npm start
```

## Building for Production

### Windows (.exe installer)

```bash
# Full build (frontend + backend + installer)
npm run build-win

# Or step by step:
npm run build-frontend    # Build React app
npm run package-backend   # Bundle Python backend
npm run electron-build    # Create Windows installer
```

Output: `dist/Pharma ERP Setup.exe`

### macOS (.dmg)

```bash
npm run build-mac
```

### Linux (.AppImage, .deb)

```bash
npm run build-linux
```

## Project Structure

```
electron-app/
├── assets/           # App icons (ico, png)
├── electron/
│   ├── main.js       # Main process
│   └── preload.js    # Preload script
├── build/            # React build (copied from frontend)
├── dist/             # Final installers
├── package.json      # Electron config
└── LICENSE.txt       # Shown in installer
```

## Icons Required

Place these in `assets/`:
- `icon.ico` - 256x256 Windows icon
- `icon.png` - 512x512 for macOS/Linux
- `installer.ico` - Installer wizard icon

## Auto-Updates

Configure update server URL in `package.json`:
```json
"publish": [{
  "provider": "generic",
  "url": "https://your-update-server.com/releases"
}]
```
