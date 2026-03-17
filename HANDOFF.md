# Scientific Listening Instrument — Handoff to v0.2

## What This Is

This repo (`bach-cello-console`) is the **v0.1 Alpha** artifact.
Tag: `v0.1-alpha` — 2026-03-17
Remote: https://github.com/MitchellMBurton/bach-cello-console

It is preserved as-is. No further development happens here.
All new work lives in the successor repo (to be named by owner).

---

## What Was Built (v0.1 Alpha)

- Real-time 12-panel analysis console (waveform, spectrogram, pitch, loudness, goniometer, LUFS)
- Three visual modes: DEFAULT / NGE / HYPER — fully coherent across all surfaces
- Decoded + streamed playback backends with studio pitch shifting (ITU-R BS.1770 K-weighting)
- EBU R128 two-pass gated integrated LUFS metering
- Goniometer + phase correlation panel
- Pitch tracker with tuning bar, cents deviation, and interval detection
- Timeline markers (M key), loop regions, three scrub modes
- Panel contextual help system (? icon, per-panel text, Escape/click-away)
- 60 fps RAF rendering with ResizeObserver canvas sizing
- Tauri desktop wrapper (thin — browser and desktop parity preserved)
- Visual mode chrome coherence: transport, metadata, load notices all theme-aware
- Oscilloscope scroll clamped to panel bounds under high displayGain

---

## Architecture: What Is Stable and Must Be Preserved

| Module | Notes |
|--------|-------|
| `app/src/panels/` | All panel components — do not restructure internals |
| `app/src/audio/engine.ts` | Stable. Do not refactor without a full soak test |
| `app/src/core/session.ts` | Frame bus / session context — clean pub/sub pattern |
| `app/src/theme/index.ts` | Visual mode palette — correct, do not break |
| `app/src/layout/SplitPane.tsx` | Fractional pane sizing — keep as a building block |
| `app/src/layout/ConsoleLayout.tsx` | ChromePanel chrome pattern — keep, loosen quadrant assumption |
| `app/src/utils/canvas.ts` | `freqToX`, `xToFreq`, `formatHz` — reuse everywhere |

---

## Known Constraints (carry these into the new repo)

- **Do not raise `MAX_IN_MEMORY_FILE_BYTES`** without a validated soak test — a prior attempt caused instability and was reverted.
- **Do not mock the audio engine in tests** — a prior mock/prod divergence masked a broken path. Use real context.
- **Streaming threshold is deliberate** — the streamed path activates for files above a size limit. Do not adjust without testing protocol.
- **Tauri wrapper must stay thin** — keep desktop-only logic out of the shared frontend.

---

## New Repo: Build Order

### Phase 1 — Panel Registry
**Scope:** ~2h. Zero user-visible change.

Replace the hardcoded panel JSX in `App.tsx` with a panel registry:

```typescript
// app/src/layout/panelRegistry.ts
export const PANEL_REGISTRY: Record<string, PanelRegistryEntry> = {
  waveformScroll:   { component: WaveformScrollPanel,   label: 'WAVEFORM',     minH: 60 },
  spectrogram:      { component: SpectrogramPanel,      label: 'SPECTROGRAM',  minH: 80 },
  oscilloscope:     { component: OscilloscopePanel,     label: 'OSC',          minH: 50 },
  oscScroll:        { component: OscilloscopeScrollPanel, label: 'OSC SCROLL', minH: 50 },
  freqResponse:     { component: FrequencyResponsePanel, label: 'RESPONSE',    minH: 80 },
  pitchTracker:     { component: PitchTrackerPanel,     label: 'PITCH',        minH: 60 },
  loudnessHistory:  { component: LoudnessHistoryPanel,  label: 'LOUDNESS',     minH: 50 },
  loudnessMeter:    { component: LoudnessMeterPanel,    label: 'LUFS',         minH: 50 },
  levels:           { component: LevelsPanel,           label: 'LEVELS',       minH: 60 },
  goniometer:       { component: GoniometerPanel,       label: 'GONIORT',      minH: 80 },
  freqBands:        { component: FrequencyBandsPanel,   label: 'BANDS',        minH: 60 },
  harmonicLadder:   { component: HarmonicLadderPanel,   label: 'PARTIALS',     minH: 60 },
};
```

Layout state becomes a serialisable descriptor:

```typescript
// app/src/layout/layoutTypes.ts
export type LayoutSlot = { panelId: string; size: number };
export type LayoutQuadrant = LayoutSlot[];
export type Layout = {
  topLeft: LayoutQuadrant;
  topRight: LayoutQuadrant;
  bottomLeft: LayoutQuadrant;
  bottomRight: LayoutQuadrant;
  hSplit: number; // fraction, left column width
  vSplit: number; // fraction, top row height
};
```

`App.tsx` reads from layout state and renders panels dynamically. No user-visible change.
**This is the prerequisite for every phase below.**

---

### Phase 2 — Canvas History Externalisation
**Scope:** ~3h. Zero user-visible change. Critical for DnD correctness.

Panels with scroll history own their state in local `useRef`. When a panel moves in the
React tree during DnD, React may unmount/remount it — wiping scroll history.

Create a `PanelHistoryStore` context (a `Map<panelId, HistoryEntry>`) that lives above all
panels. Each panel reads/writes its own slot. On remount, it rehydrates from the store.

**Panels to change:**
- `SpectrogramPanel` — offscreen canvas + Int16Array history
- `OscilloscopeScrollPanel` — offscreen canvas
- `LoudnessMeterPanel` — `allMsRef` Float32Array (7200 frames)
- `LoudnessHistoryPanel` — history array
- `WaveformScrollPanel` — pre-computed peak bins

Pattern:
```typescript
const historyStore = usePanelHistoryStore();
const history = historyStore.get('spectrogram') ?? createInitialHistory();
// On update: historyStore.set('spectrogram', history);
```

---

### Phase 3 — Panel Fullscreen
**Scope:** ~2h. First user-visible feature of the new direction.

Add `onFullscreen?: () => void` to `ChromePanelProps`. Add a `⛶` button to the right of
the chrome header (identical pattern to the existing `PanelHelp` `?` button — same
`btnStyle`, same dim-until-hover, same visual mode color logic).

App-level `fullscreenPanel: string | null` state. When set, render a fixed-position
overlay (`z-index: 500, position: fixed, inset: 0`) containing:
- A slim header strip (category, title, `✕ ESC` close button)
- The panel content div filling remaining height

`Escape` key exits (wire into existing keyboard handler in `App.tsx`).
ResizeObserver in the panel fires and redraws at new dimensions. No unmount. No history
loss. Works identically in browser and Tauri.

---

### Phase 4 — Layout Profiles / Presets
**Scope:** ~2h. Satisfies most layout customisation needs without DnD complexity.

Named presets, each a `Layout` descriptor (Phase 1):
- `ANALYSIS` — default four-quadrant, spectrogram prominent
- `BROADCAST` — LUFS + loudness large, waveform overview top
- `PERFORMANCE` — waveform + pitch + oscilloscope, minimal metadata
- `MINIMAL` — single column, essential panels only

Small preset selector in the global toolbar (left of RESET LAYOUT). Selecting a preset
writes a new `Layout` to state; `SplitPane` fractions update; panels reflow.

---

### Phase 5 — Within-Column Panel Reorder
**Scope:** ~3h. No remount — history preserved.

Drag panels up/down within their column using CSS `order` mutation (not React tree
reorder). Panel sizes swap with their neighbour. A grip icon (⠿) appears on hover at the
left edge of the chrome header. No DnD library needed — custom pointer handlers.

---

### Phase 6 — Cross-Quadrant DnD
**Scope:** ~4h. Requires Phases 1–3 complete.

Panel dragged to a different quadrant. History survives the move because Phase 2 lifted
all state into the external store. The panel component remounts in the new slot and
rehydrates immediately.

Recommended: `@dnd-kit/core` with custom sensors. The registry (Phase 1) provides the
panel metadata needed for drop-target validation (min sizes, compatibility).

---

## Starting the New Repo

```bash
# From the parent directory of this project:
cp -r av_project_claude_2 <new-repo-name>
cd <new-repo-name>

# Remove the alpha remote, point to new repo:
git remote remove origin
git remote add origin https://github.com/MitchellMBurton/<new-repo-name>.git

# Clean commit history start (optional — or keep history for lineage):
# git checkout --orphan fresh && git add -A && git commit -m "Init from v0.1 alpha"

git push -u origin main
```

Update `CLAUDE.md` in the new repo:
- Remove the alpha preservation note
- Update "Current Milestone" to describe Phase 1 (Panel Registry)
- Remove reference to `HANDOFF.md`

Update Claude memory (`MEMORY.md` / `project_state.md`) to point to the new working directory.

---

## Session Memory Location

Claude's persistent memory for this project lives at:
`C:\Users\mitch\.claude\projects\c--audio-visual-av-project-claude-2\memory\`

When starting work in the new repo, update `project_state.md` with the new path and branch.
