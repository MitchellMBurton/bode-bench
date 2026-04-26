# Startup Runbook

Practical daily startup guide for working on the Scientific Listening Instrument repo.

## Purpose

Use this document when you need to:

- get oriented at the start of a work session
- launch the frontend or desktop app
- rebuild the latest installer and browser share bundle
- serve easy local review links
- verify whether your local state matches the current release head

This is intentionally operational. Keep product thinking in `AGENT_BRIEF.md` and interface doctrine in `UX_PRINCIPLES.md`.

## Current Source Of Truth

- Active development branch: `main`
- GitHub repo: `https://github.com/MitchellMBurton/bode-bench`
- `master` is only a mirrored release head when explicitly kept in sync; do not treat it as the working branch by default

## Prerequisites

Expected local tools:

- Node.js + npm
- Rust toolchain
- Python 3
- PowerShell
- Windows desktop environment for Tauri packaging

## First 3 Minutes

From the repo root:

```powershell
git status --short --branch
git rev-parse --short HEAD
git branch -a -vv
```

If the worktree is dirty, stop there and inspect before you pull or rebuild anything. This repo often opens with local doc notes, uncommitted UI work, or generated share artifacts. Do not run `git pull --ff-only origin main` as a blind first step on a dirty tree.

Quick orientation pass:

- `HANDOFF.md`
- `TASKS.md`
- `UX_PRINCIPLES.md`
- `AGENT_BRIEF.md`

If you want to sync to the latest remote `main`, do it explicitly and only from a clean worktree:

```powershell
git fetch origin
git log --oneline --decorate HEAD..origin/main
git pull --ff-only origin main
```

Note: `origin/HEAD` may still point to `master`. Treat `origin/main` as the source of truth for active work.

## Dependency Check

Check the two app workspaces only when needed:

```powershell
cd app
npm install
cd ..\desktop
npm install
cd ..
```

You only need `npm install` again when:

- `node_modules` is missing
- `package-lock.json` changed
- you switched branches and dependencies changed
- a build/test command fails because a dependency is missing

## Daily Work Modes

### 1. Frontend browser development

```powershell
cd app
npm run dev
```

Use this for:

- layout work
- panel rendering
- review chrome iteration
- most React-side UX refinement

Default dev URL:

- `http://127.0.0.1:5173/`

### 2. Desktop development

```powershell
cd desktop
npm run dev
```

Use this for:

- export behavior
- desktop file dialogs
- Tauri command wiring
- bundled ffmpeg workflows

## Verification Before You Trust A Change

Frontend verification:

```powershell
cd app
npm test
npx tsc --noEmit
npm run lint
npm run build
```

Desktop / Rust verification:

```powershell
cd desktop\src-tauri
cargo test
```

Use the full set before commit when you touch export, desktop commands, or shared contracts.

## Build The Latest Shareable Artifacts

From `desktop/`:

```powershell
npm run release:share
```

This does all of the following:

- builds the frontend
- builds the Tauri installer
- refreshes `desktop/share/ScientificListeningInstrument-Setup.exe`
- refreshes `desktop/share/webapp.html`
- regenerates `desktop/share/latest.json`
- regenerates the installer SHA256 file

## Serve Easy Local Review Links

From `desktop/`:

```powershell
npm run serve-share
```

Default local review URLs:

- `http://127.0.0.1:8787/`
- `http://127.0.0.1:8787/webapp.html`
- `http://127.0.0.1:8787/ScientificListeningInstrument-Setup.exe`
- `http://127.0.0.1:8787/latest.json`

The share server disables caching so local testing reflects the newest bundle.

## Useful Checks

Latest local installer details:

```powershell
Get-Content .\desktop\share\latest.json -Raw
```

Latest local installer hash:

```powershell
Get-FileHash .\desktop\share\ScientificListeningInstrument-Setup.exe -Algorithm SHA256
```

Current branch alignment:

```powershell
git status --short --branch
git branch -a -vv
git log -1 --oneline --decorate
```

## Commit / Push Routine

From repo root:

```powershell
git status --short
git add <files>
git commit -m "Your message"
git push origin main
```

Only sync `master` if there is an explicit release-management reason to do so.

## Common Recovery Steps

### Local review link is stale

Run:

```powershell
cd desktop
npm run release:share
npm run serve-share
```

### Browser build is fresh but installer is old

You probably ran `app` build only. Run:

```powershell
cd desktop
npm run build
npm run prepare-share
```

### `cargo tauri build` is unavailable

Use the repo-standard wrapper instead:

```powershell
cd desktop
npm run build
```

### Export or desktop behavior changed but browser app looks correct

Re-run:

```powershell
cd desktop\src-tauri
cargo test
cd ..\
npm run build
```

### Share server is not reachable

Restart it:

```powershell
cd desktop
npm run serve-share
```

## Files Worth Checking During Startup

- `README.md`
- `AGENT_BRIEF.md`
- `TASKS.md`
- `HANDOFF.md`
- `UX_PRINCIPLES.md`
- `desktop/share/latest.json`

## Startup Simulation Notes

These are lessons from actually following this runbook against the repo:

- Start with inspection, not mutation.
- Treat `git fetch` as safer than `git pull` until you know the tree is clean.
- Check `origin/main` directly instead of trusting `origin/HEAD`.
- Do not burn time on daily `npm install` unless dependencies changed.
- Read `HANDOFF.md` and `TASKS.md` before assuming the next priority.

If you need one sentence of guidance:

Start on `main`, inspect the tree before syncing, read the current handoff/task docs, run only the app mode you need, and rebuild the share bundle before asking others to review.
