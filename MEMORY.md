# Global Memory

## 2026-03-14

### Accepted Direction

- The project is no longer defined primarily as a Bach-specific suite console.
- The accepted direction is a general-purpose local media analysis instrument with optional structural overlays.
- Legacy branding remains in package names, installer names, and sample data, but that is now considered transitional.

### Implemented Recently

- Added and stabilized desktop/browser parity through the shared frontend and Tauri wrapper.
- Added diagnostics logging suitable for review, copy, and saved support traces.
- Added video preview modes:
  - docked
  - windowed
  - theater
  - in-app full screen
- Added scrub mode variants and substantially improved transport stability around:
  - seek bursts
  - loop wrap
  - rate and pitch changes
  - file switching
  - long windowed-video interaction
- Preserved panel layout across style switches and made `RESET LAYOUT` reset geometry without wiping session state.

### Current Product Reality

- The runtime handles arbitrary local audio and video usefully even without annotation data.
- The Bach / MusicXML pipeline remains valuable as an example annotation workflow, not the product definition.
- The diagnostics system is now part of the intended UX, not just temporary debugging scaffolding.

### Known Transitional State

- Repo and installer naming still say `Bach Cello Console`.
- Bundled overlay data is still Suite No. 1 Prelude sample data.
- Some docs had to be updated to match the broader product direction.

### Recommended Next Direction

- Keep improving runtime credibility and expert workflow quality.
- Treat further generalization as a product-definition task, not just a rename pass.
- Defer full branding cleanup until the broader workflow shape is fully settled.

## 2026-03-11

### Accepted Baseline

- Current accepted baseline is commit `b8443c3` on `master`.
- The app was stable again after reverting the experimental native-video-audio fallback.
- Build and lint were both passing at that stop point.

### Historical Notes

- Added a new `FrequencyResponsePanel` beneath the oscilloscope.
- Fixed mono analysis routing so mono files no longer show a dead right channel.
- Reworked waveform overview logic.
- Fixed reset behavior for video preview and file reloading.
- Added the diagnostics log panel and early transport logging.
- Reduced live rendering cost and improved explicit multichannel stereo fold-down.

### Historical Open Issue

- Some longer or higher-quality video files, especially `6ch` MKVs, still produced audible crackling in the older baseline.
- That issue drove the later playback-hardening work summarized above.
