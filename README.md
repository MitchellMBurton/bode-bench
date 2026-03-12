# Bach Cello Suites — Analysis Console

A local-first, desktop-grade scientific listening instrument for J.S. Bach's Six Cello Suites.

Real-time audio diagnostics fused with symbolic musical structure in a four-quadrant analysis console.

---

## What This Is

This is not a music player. This is not a visualiser.

It is a rigorous analysis console for listening to Bach's cello suites while observing waveform, spectrum, levels, frequency bands, and symbolic score structure in coherent real-time agreement.

Its authority comes from the harmony of interfaces. Its beauty comes from precision.

---

## Requirements

| Dependency | Minimum | Notes |
|---|---|---|
| Node.js | 18+ | v22 confirmed working |
| npm | 9+ | pnpm also works if installed |
| Rust | stable | Only for the Tauri desktop wrapper |
| Python | 3.9+ | Only for score preprocessing |
| music21 | any | `pip install music21` — score parsing only |
| FFmpeg | any | Optional — `probe_audio.py` only |

No Rust or Tauri required to run the browser frontend.

---

## Quick Start

### 1. Install and launch the frontend

```bash
cd app
npm install
npm run dev
```

Open `http://localhost:5173` in any modern browser.

### 1b. Launch the desktop shell

```bash
cd desktop
npm install
npm run dev
```

This wraps the existing frontend in Tauri. It requires the Rust/Tauri desktop prerequisites on the host machine.

### 2. Load audio

- **Drag and drop** any audio file onto the ingest zone (top-left panel).
- Or **click** the ingest zone to open a file picker.
- Supported formats: anything your browser decodes — MP3, FLAC, WAV, OGG, AAC, M4A.
- The file is loaded into memory for the session. Nothing is written to disk.

### 3. Play

Press **▶** to start playback. The four panels activate immediately:

| Panel | Location | What you see |
|---|---|---|
| **Oscilloscope** | Top right | Live time-domain waveform with zero-crossing trigger |
| **Spectrogram** | Bottom right | Scrolling frequency-vs-time waterfall, log scale |
| **Levels** | Bottom left (upper) | L/R peak and RMS bars with dB scale and peak hold |
| **Freq Bands** | Bottom left (lower) | 10-band energy distribution with smoothing |

Use the **seek bar** to jump anywhere in the recording. **⏸** to pause, **■** to stop and return to the start.

---

## Score Overlay

The spectrogram panel can display note events from the preprocessed score JSON as amber horizontal markers, aligned to the playback timeline.

### Using the stub data (default)

A stub arpeggio pattern for the Suite No. 1 Prelude is already generated and served. It gives a rough visual reference but is not timing-accurate to any specific recording.

### Using real score data

1. Obtain a MusicXML file for the Suite No. 1 Prelude (public domain editions available from IMSLP and MuseScore).
2. Place it at:
   ```
   data/raw/suite1_prelude.xml
   ```
3. Run the preprocessor:
   ```bash
   cd scripts
   pip install music21          # first time only
   python parse_scores.py
   ```
   This reads the MusicXML, extracts note events with timestamps, and writes:
   - `data/processed/suite1_prelude.json` — the canonical output
   - `app/public/data/processed/suite1_prelude.json` — served to the browser automatically

4. Restart or reload the frontend. The overlay appears during playback.

### Aligning the overlay to a recording

Score-derived timestamps assume a fixed tempo. To shift all events by an offset (e.g. to account for recording start silence):

```bash
cd scripts
python export_events.py 2.5    # shifts all events forward by 2.5 seconds
python export_events.py -1.0   # shifts back by 1 second
```

---

## Score Data Format

```jsonc
{
  "version": 1,
  "metadata": {
    "suite": 1,
    "movement": "Prelude",
    "key": "G major",
    "tempoMarking": "Unmeasured",
    "timeSignature": "4/4",
    "estimatedDurationS": 156.0,
    "composer": "J.S. Bach",
    "instrument": "Cello solo"
  },
  "events": [
    {
      "pitch": 43,           // MIDI pitch number
      "pitchName": "G2",     // human-readable
      "onset_s": 0.0,        // seconds from start
      "duration_s": 0.4167,  // seconds
      "measure": 1,          // 1-indexed
      "beat": 1.0            // beat within measure
    }
    // ...
  ]
}
```

---

## Audio Probing

Before loading an unusual file, you can inspect it:

```bash
cd scripts
python probe_audio.py path/to/recording.flac
```

Requires FFmpeg (`ffmpeg.org`). Reports codec, sample rate, channels, bit depth, and duration.

---

## Project Layout

```
bach-cello-console/
  app/                        # React + Vite frontend
    src/
      types/index.ts          # Shared TypeScript interfaces
      theme/index.ts          # Colours, fonts, spacing, canvas constants
      audio/
        engine.ts             # Web Audio graph, transport, frame extraction
        frameBus.ts           # Pub/sub — frames to panels without React re-renders
      score/
        loader.ts             # Fetch + validate processed JSON
      panels/
        OscilloscopePanel.tsx
        SpectrogramPanel.tsx
        LevelsPanel.tsx
        FrequencyBandsPanel.tsx
      layout/
        ConsoleLayout.tsx     # Four-quadrant shell
      controls/
        TransportControls.tsx # Ingest, play/pause/stop, seek, time
        MetadataDisplay.tsx   # Movement identity
  scripts/
    parse_scores.py           # MusicXML → JSON (music21)
    export_events.py          # Timing offset tool
    probe_audio.py            # FFprobe wrapper
  data/
    raw/                      # Place MusicXML source files here
    processed/                # Preprocessor output JSON
  audio/
    sessions/                 # Ephemeral session files (gitignored)
```

---

## Development Commands

```bash
# Start dev server
cd app && npm run dev

# Start desktop shell
cd desktop && npm run dev

# Build desktop shell
cd desktop && npm run build

# Type check (no emit)
cd app && npx tsc --noEmit

# Lint
cd app && npm run lint

# Regenerate score data
cd scripts && python parse_scores.py

# Shift overlay timing
cd scripts && python export_events.py <offset_seconds>
```

---

## Project Documents

| Document | Purpose |
|---|---|
| `PROJECT.md` | Product definition and invariants |
| `UX_PRINCIPLES.md` | Interface doctrine |
| `ARCHITECTURE.md` | Technical structure and domain boundaries |
| `DECISION_RULES.md` | How to choose between alternatives |
| `TASKS.md` | Current build sequence and status |
| `CLAUDE.md` | Agent instructions and repo conventions |

---

## What Is Built (v1 Milestone)

- [x] Vite + React + TypeScript scaffold, strict mode, no `any` at domain boundaries
- [x] Theme constants — dark instrument palette, typography, spacing, canvas config
- [x] Four-quadrant fixed layout
- [x] Audio ingest (drag-drop or file picker, session-scoped)
- [x] Transport — play, pause, stop, seek, time readout
- [x] Frame bus — typed `AudioFrame` per animation frame, no React re-renders in panels
- [x] Levels panel — peak + RMS bars, dB scale, peak hold
- [x] Frequency bands panel — 10-band FFT aggregation with smoothing
- [x] Oscilloscope panel — zero-crossing triggered waveform, amplitude grid
- [x] Spectrogram panel — scrolling FFT waterfall, log frequency axis
- [x] Metadata display — Suite No. 1 Prelude identity
- [x] Score preprocessing script — MusicXML → JSON, stub data for development
- [x] Symbolic overlay — note events on spectrogram, timeline-aligned

## What Remains

- [ ] T02 — Tauri desktop wrapper
- [ ] T15 — Screenshot audit
- [ ] T16 — Presentation test with full Prelude playback
- Future: remaining five suites, phrase overlays, performer comparison, helix rendering
