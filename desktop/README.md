# Desktop Release

The desktop application is packaged with Tauri and distributed as a Windows NSIS installer.

## Requirements

- Node.js 18+
- npm 9+
- Rust stable toolchain
- Microsoft Visual Studio C++ build tools on Windows

## Commands

```bash
cd desktop
npm install
npm run dev
```

That launches the desktop shell against the local frontend.

For a release build and shareable local download bundle:

```bash
cd desktop
npm run release:share
```

## What `release:share` Does

The release pipeline:

- builds the React frontend
- builds the Tauri desktop shell
- copies the latest NSIS installer into `desktop/share/`
- copies the built browser app into `desktop/share/webapp.html` plus its static assets
- regenerates `desktop/share/latest.json`
- regenerates the SHA256 sidecar file

## Output

Primary share artifacts:

- `desktop/share/BachCelloConsole-Setup.exe`
- `desktop/share/BachCelloConsole-Setup.exe.sha256.txt`
- `desktop/share/latest.json`
- `desktop/share/index.html`
- `desktop/share/webapp.html`
- `desktop/share/assets/*`
- `desktop/share/vite.svg`

The installer, checksum file, manifest, and browser-share bundle are generated locally and ignored by git.

## Local Preview

To preview the download page locally:

```bash
cd desktop
npm run serve-share
```

Default URL:

- `http://127.0.0.1:8787/`

Browser app URL after `release:share`:

- `http://127.0.0.1:8787/webapp.html`

## Upgrade Notes

The NSIS installer now force-closes `bach-cello-console.exe` before install and uninstall steps run. This improves in-place upgrades when an older copy of the app is still open.

If a machine already has stale local builds from older installer behavior:

- close all Bach Cello Console windows
- run `%LOCALAPPDATA%\Bach Cello Console\uninstall.exe` manually if needed
- rerun the latest installer
