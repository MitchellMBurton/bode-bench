# Global Memory

## 2026-03-11

### Accepted Baseline

- Current accepted baseline is commit `b8443c3` on `master`.
- The app is stable again after reverting the experimental native-video-audio fallback.
- Build and lint were both passing at the accepted stop point.

### Implemented Today

- Added a new `FrequencyResponsePanel` beneath the oscilloscope and sized it at roughly 2x the oscilloscope height.
- Fixed mono analysis routing so mono files no longer show a dead right channel.
- Reworked waveform overview logic:
  - true clip detection instead of near-peak false positives
  - stereo-aware RMS envelope
  - cleaned panel copy and rendering behavior
- Fixed reset behavior for video preview and file reloading:
  - reset now clears preview state correctly
  - hidden file input is cleared so a new file can be loaded without page refresh
- Fixed the lint failure by separating metadata export concerns.
- Added a diagnostics log panel under the left-side controls.
- Added transport logging for:
  - file loads
  - play / pause / seek / rate changes
  - decode sample rate vs context sample rate
  - file crest / peak / RMS
  - multichannel warning state
- Added playback-rate propagation into transport state.
- Adjusted scrolling waveform / spectrogram timing to behave better with time dilation, then backed away from the broken refactor and kept the stable version.
- Reduced some live rendering cost:
  - lower analysis cadence to `20 fps`
  - `fftSize` reduced to `2048`
  - capped panel DPR on always-running canvases
  - improved spectrogram row sampling by averaging log-frequency bands instead of using a single FFT bin per row
- Added explicit multichannel stereo fold-down in the audio engine so analysis and playback do not rely entirely on implicit browser routing.

### Important Investigation Results

- The Evangelion MKV crackle is not explained by sample-rate mismatch.
- Diagnostics showed:
  - context sample rate: `48.0 kHz`
  - decoded buffer sample rate: `48.0 kHz`
  - channel count: `6`
- The file is multichannel, and Web Audio playback through the current buffer-source path is still the most likely place where the remaining audible roughness is introduced.

### Rolled Back Today

- A larger audio-time rewrite for scrolling-history panels was rolled back after it broke waveform/spectrogram rendering.
- An experimental native-video-audio monitoring fallback was rolled back after it made playback worse.
- The accepted baseline keeps the diagnostics improvements and engine/panel fixes, but not those failed playback-path experiments.

### Known Open Issue

- Some longer / higher-quality video files, especially `6ch` MKVs, still produce audible crackling in this player even though the same files sound correct in VLC.
- The crackle is still unresolved in the accepted baseline.
- Current best hypothesis: browser/Web Audio playback backend behavior on these multichannel video decodes, not score logic, not overview logic, and not sample-rate mismatch.

### Recommended Next Step

- Investigate a dedicated heavy-video playback path from first principles instead of layering more patches onto the current `decodeAudioData -> AudioBufferSourceNode` flow.
- Keep any future playback-backend experiment isolated and easy to revert.
