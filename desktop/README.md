# Desktop Release

The desktop application is packaged with Tauri and distributed locally as a Windows NSIS installer.

The runtime and current installer identity are now general-purpose `Scientific Listening Instrument`. Older `Bach Cello Console` process names may still be handled during upgrades for compatibility with previously installed local builds.

Release builds now write rotating runtime logs for desktop support and regression triage.

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

That launches the desktop shell against the shared frontend.

For a release build and refreshed local share bundle:

```bash
cd desktop
npm run release:share
```

## What `release:share` Does

- builds the shared frontend
- builds the Tauri desktop shell
- copies the latest NSIS installer into `desktop/share/`
- copies the static browser bundle into `desktop/share/webapp.html`
- regenerates `desktop/share/latest.json`
- regenerates the SHA256 sidecar file
- removes stale installer names so the share folder reflects one authoritative desktop build

## Output

Primary share artifacts:

- `desktop/share/ScientificListeningInstrument-Setup.exe`
- `desktop/share/ScientificListeningInstrument-Setup.exe.sha256.txt`
- `desktop/share/latest.json`
- `desktop/share/index.html`
- `desktop/share/webapp.html`
- `desktop/share/assets/*`

## Local Preview

```bash
cd desktop
npm run serve-share
```

Default URLs:

- `http://127.0.0.1:8787/`
- `http://127.0.0.1:8787/webapp.html`

## Upgrade Notes

The NSIS installer force-closes the current `scientific-listening-instrument.exe` process and the legacy `bach-cello-console.exe` process before install and uninstall steps run. This improves in-place upgrades when an older copy of the app is still open.

If a machine already has stale local builds from older installer behavior:

- close all Scientific Listening Instrument and Bach Cello Console windows
- run `%LOCALAPPDATA%\Bach Cello Console\uninstall.exe` manually if needed
- rerun the latest installer

## Runtime Logs

Installed desktop builds write rotating logs to:

- `%LOCALAPPDATA%\com.mitchellmburton.scientific-listening-instrument\logs\runtime.log`

Older local installs may also have logs under:

- `%LOCALAPPDATA%\com.mitchellmburton.bachcelloconsole\logs\runtime.log`

These logs are intended for desktop troubleshooting and release validation.
