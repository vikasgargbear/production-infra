# Windows private app

The Windows wrapper is an unsigned, sideloaded desktop shell for the live
AASOPharma ERP. It uses the package identifier `com.aasopharma.erp` and produces
an NSIS `*-setup.exe` installer. It does not use the Microsoft Store or require a
Windows signing certificate for private testing. The installer bundles the
Microsoft WebView2 offline runtime so installation does not depend on a working
WebView2 download; expect the setup file to be roughly 130 MB larger.

## Update model

- ERP frontend and backend fixes remain on Railway. The installed app loads that
  live HTTPS origin, so normal business fixes appear without reinstalling it.
- A new setup file is required only when the Windows shell, application icon,
  OAuth bridge, or native file/window behavior changes.
- Native automatic updates are intentionally deferred. Until they are added,
  install a newer setup file over the existing app; the installer keeps the same
  application identity and current-user installation scope.

## Build

Use the **Windows private app** GitHub Actions workflow. It builds on
`windows-latest`, runs the wrapper contract and Rust tests, and uploads the
`AASOPharma-ERP-Windows-Setup` artifact for seven days.

For a local Windows build with Node 22, Rust stable, and Microsoft C++ Build
Tools installed:

```powershell
cd frontend
npm ci
npm run desktop:check
cargo test --manifest-path src-tauri/Cargo.toml
npm run desktop:build:windows
```

The installer is written under:

```text
frontend\src-tauri\target\release\bundle\nsis\
```

## Install and replace

1. Download and unzip the Actions artifact. Keep the setup file and
   `SHA256SUMS.txt` together, and verify the setup file checksum before running it.
2. Run `AASOPharma ERP_*_x64-setup.exe`. Installation is scoped to the current
   Windows user and does not require administrator access.
3. For the unsigned private build, Windows may show **Windows protected your
   PC**. Verify that the file came from the repository Actions run, then choose
   **More info** and **Run anyway**.
4. Start **AASOPharma ERP** from the Start menu.
5. Google login opens in the default Windows browser and returns to the app via
   the registered `aasopharma://` link.

If Windows does not offer **Run anyway**, right-click the downloaded setup file,
open **Properties**, select **Unblock** if shown, apply the change, and run the
installer again. A future Authenticode certificate is required to remove this
unsigned-publisher warning for general distribution.

To replace the wrapper later, close the app and run the newer setup file. To
remove it, use Windows **Settings > Apps > Installed apps > AASOPharma ERP**.

## Acceptance checks

- Google authorization never renders inside the embedded WebView.
- The callback returns only to the exact ERP origin and preserves PKCE state.
- Login, logout, and account switching work after closing and reopening the app.
- Browser back/forward, keyboard input, file upload, generated invoice download,
  printing/PDF, and external links work on Windows 10 and Windows 11.
- Ordinary Railway frontend changes appear after an app reload without a new
  installer.
