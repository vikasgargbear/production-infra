# App Icons

Place your application icons here:

## Required Files

| File | Size | Purpose |
|------|------|---------|
| `icon.ico` | 256x256 | Windows app icon |
| `icon.png` | 512x512 | macOS/Linux app icon |
| `installer.ico` | 256x256 | Windows installer icon |
| `header.ico` | 150x57 | Installer header banner |
| `uninstaller.ico` | 256x256 | Uninstaller icon |

## Creating Icons

### Option 1: Online Tools
- [ConvertICO](https://convertico.com/) - PNG to ICO
- [Favicon.io](https://favicon.io/) - Generate all sizes

### Option 2: From PNG
Use ImageMagick:
```bash
convert icon-512.png -resize 256x256 icon.ico
```

## Placeholder
Until you have proper icons, the build will use Electron's default icon.
