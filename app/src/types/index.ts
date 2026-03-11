// ============================================================
// Shared TypeScript interfaces and data contracts
// All values crossing domain boundaries must use these types.
// Units are explicit: seconds, Hz, dB, normalised 0–1.
// ============================================================

// ----------------------------------------------------------
// Audio Domain
// ----------------------------------------------------------

/** One analysis frame extracted per requestAnimationFrame. */
export interface AudioFrame {
  /** Wall-clock timestamp of this frame (seconds, from AudioContext.currentTime) */
  readonly currentTime: number;
  /** Time-domain waveform samples, normalised –1 to +1. Length = fftSize */
  readonly timeDomain: Float32Array;
  /** Frequency-domain magnitude in dB. Length = fftSize / 2 */
  readonly frequencyDb: Float32Array;
  /** Right channel frequency-domain magnitude in dB. Length = fftSize / 2 */
  readonly frequencyDbRight: Float32Array;
  /** Peak amplitude this frame, normalised 0–1 */
  readonly peakLeft: number;
  readonly peakRight: number;
  /** RMS amplitude this frame, normalised 0–1 */
  readonly rmsLeft: number;
  readonly rmsRight: number;
  /** Sample rate of the source buffer (Hz) */
  readonly sampleRate: number;
  /** Increments each time play() is called — retained for backward compat */
  readonly playId: number;
  /** Increments each time load() is called — panels use this to clear scroll history on new file */
  readonly fileId: number;
  /** Display gain computed from file peak — multiply waveform samples by this to fill the visual range.
   *  = 0.95 / filePeak. Audio playback is unaffected. */
  readonly displayGain: number;
  /** FFT bin count: frequencyDb.length */
  readonly fftBinCount: number;
}

/** Coarse frequency band (aggregated from FFT bins). */
export interface FrequencyBand {
  /** Label e.g. "100 Hz" */
  readonly label: string;
  /** Centre frequency (Hz) */
  readonly centerHz: number;
  /** Low edge (Hz) */
  readonly lowHz: number;
  /** High edge (Hz) */
  readonly highHz: number;
  /** Energy level, normalised 0–1 */
  readonly level: number;
}

/** Transport / playback state. */
export interface TransportState {
  readonly isPlaying: boolean;
  readonly currentTime: number; // seconds
  readonly duration: number;    // seconds
  readonly filename: string | null;
}

// ----------------------------------------------------------
// Score Domain
// ----------------------------------------------------------

/** A single note event from the preprocessed score JSON. */
export interface NoteEvent {
  /** MIDI pitch number, e.g. 48 = C3 */
  readonly pitch: number;
  /** Human-readable pitch name, e.g. "C3" */
  readonly pitchName: string;
  /** Onset time in seconds (aligned to recording) */
  readonly onset_s: number;
  /** Duration in seconds */
  readonly duration_s: number;
  /** Measure number (1-indexed) */
  readonly measure: number;
  /** Beat within measure (1-indexed, may be fractional) */
  readonly beat: number;
}

/** Metadata for a single movement. */
export interface MovementMetadata {
  readonly suite: number;
  readonly movement: string;
  readonly key: string;
  readonly tempoMarking: string;
  readonly timeSignature: string;
  readonly estimatedDurationS: number;
  readonly composer: string;
  readonly instrument: string;
}

/** The full processed score file shape. */
export interface ProcessedScore {
  readonly version: 1;
  readonly metadata: MovementMetadata;
  readonly events: NoteEvent[];
}
