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
  /** Right-channel time-domain waveform samples, normalised –1 to +1. Length = fftSize */
  readonly timeDomainRight: Float32Array;
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
  /** Spectral centroid of left channel power spectrum (Hz).
   *  Weighted mean frequency: Σ(freq_k × power_k) / Σ(power_k). */
  readonly spectralCentroid: number;
  /** Estimated fundamental frequency (Hz) from autocorrelation, or null if no pitch detected.
   *  Covers cello range: ~60–1000 Hz. */
  readonly f0Hz: number | null;
  /** Autocorrelation confidence for f0Hz in range 0–1. Values below ~0.4 indicate noise/silence. */
  readonly f0Confidence: number;
  /** Phase correlation between L and R channels: Σ(L·R) / √(Σ(L²)·Σ(R²)).
   *  Range −1 (out-of-phase) to +1 (mono). Computed per frame in engine. */
  readonly phaseCorrelation: number;
}

/** File-level quality analysis computed once from the decoded AudioBuffer on load. */
export interface FileAnalysis {
  /** Crest factor: peak dBFS minus integrated RMS dBFS. Higher = more dynamic range.
   *  Unmastered classical: ~14–20 dB. Moderate mastering: ~9–13 dB. Brick-wall: ~5–8 dB. */
  readonly crestFactorDb: number;
  /** Peak amplitude of entire file in dBFS (0 = full scale, negative = below full scale). */
  readonly peakDb: number;
  /** Integrated RMS amplitude in dBFS across all channels. */
  readonly rmsDb: number;
  /** Number of samples where |x| >= 0.9999 across all channels (hard clipping indicator). */
  readonly clipCount: number;
  /** Total duration in seconds. */
  readonly duration: number;
  /** Number of audio channels in the source file. */
  readonly channels: number;
  /** Sample rate of the decoded AudioBuffer after browser decode/resample (Hz). */
  readonly decodedSampleRate: number;
  /** AudioContext sample rate used for playback/analysis (Hz). */
  readonly contextSampleRate: number;
  /** fileId at the time of analysis — panels can discard stale callbacks. */
  readonly fileId: number;
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
export type ScrubStyle = 'step' | 'tape' | 'wheel';

/** Transport / playback state. */
export interface TransportState {
  readonly isPlaying: boolean;
  readonly currentTime: number; // seconds
  readonly duration: number;    // seconds
  readonly filename: string | null;
  /** Playback backend currently driving the session transport. */
  readonly playbackBackend: 'decoded' | 'streamed';
  /** True while the user is actively scrubbing a seek surface. */
  readonly scrubActive: boolean;
  /** Tempo/speed multiplier. Does not change pitch. */
  readonly playbackRate: number;
  /** Pitch transposition in semitones. Does not change duration. */
  readonly pitchSemitones: number;
  /** True when the studio pitch-shift engine is active for the current file/runtime. */
  readonly pitchShiftAvailable: boolean;
  /** Loop region start time in seconds, or null if no loop is set. */
  readonly loopStart: number | null;
  /** Loop region end time in seconds, or null if no loop is set. */
  readonly loopEnd: number | null;
}

// ----------------------------------------------------------
// Markers
// ----------------------------------------------------------

/** A user-placed timeline marker, set via the M key during playback. */
export interface Marker {
  /** Unique sequential id, e.g. 1, 2, 3 */
  readonly id: number;
  /** Position in seconds from file start */
  readonly time: number;
  /** Short label, e.g. "M1", "M2" */
  readonly label: string;
}

/** A named time range for export, comparison, or repair review. */
export interface RangeMark {
  /** Unique sequential id, e.g. 1, 2, 3 */
  readonly id: number;
  /** Inclusive range start in seconds from file start. */
  readonly startS: number;
  /** Inclusive range end in seconds from file start. */
  readonly endS: number;
  /** Short label, e.g. "R1", "R2" */
  readonly label: string;
}

export type ProcessorKind = 'ffmpeg' | 'external-cli' | 'python-worker' | 'ai-service';
export type MediaJobKind = 'clip-export' | 'audio-repair' | 'video-repair';
export type MediaJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'canceled';
export type MediaQualityMode = 'copy-fast' | 'exact-master';
export type DerivedArtifactRole = 'media' | 'manifest' | 'preview' | 'report' | 'confidence' | 'mask' | 'stems' | 'frames';
export type JobSettingValue = string | number | boolean | null;

export interface ProcessorDescriptor {
  readonly kind: ProcessorKind;
  readonly name: string;
  readonly version: string | null;
}

export interface ExportPreset {
  readonly id: string;
  readonly label: string;
  readonly container: string;
  readonly audioCodec: string | null;
  readonly videoCodec: string | null;
  readonly qualityMode: MediaQualityMode;
}

export interface ClipSpec {
  readonly startS: number;
  readonly endS: number;
  readonly presetId: string;
}

export interface RepairRecipe {
  readonly id: string;
  readonly label: string;
  readonly target: 'audio' | 'video';
  readonly processorKind: ProcessorKind;
  readonly settings: Readonly<Record<string, JobSettingValue>>;
}

export interface DerivedArtifact {
  readonly id: string;
  readonly role: DerivedArtifactRole;
  readonly path: string;
  readonly sha256: string | null;
  readonly createdAtMs: number;
}

export type MediaJobSpec =
  | {
      readonly kind: 'clip-export';
      readonly sourceAssetId: string;
      readonly label: string;
      readonly clip: ClipSpec;
      readonly preset: ExportPreset;
      readonly processor: ProcessorDescriptor;
    }
  | {
      readonly kind: 'audio-repair';
      readonly sourceAssetId: string;
      readonly label: string;
      readonly range: RangeMark;
      readonly recipe: RepairRecipe;
      readonly processor: ProcessorDescriptor;
    }
  | {
      readonly kind: 'video-repair';
      readonly sourceAssetId: string;
      readonly label: string;
      readonly range: RangeMark;
      readonly recipe: RepairRecipe;
      readonly processor: ProcessorDescriptor;
    };

export interface MediaJobProgress {
  readonly percent: number;
  readonly message: string;
}

export interface MediaJobResult {
  readonly artifacts: readonly DerivedArtifact[];
  readonly metrics: Readonly<Record<string, number>>;
}

export interface MediaJobManifest {
  readonly version: 1;
  readonly jobId: string;
  readonly sourceAssetId: string;
  readonly processor: ProcessorDescriptor;
  readonly completedAtMs: number;
  readonly artifacts: readonly DerivedArtifact[];
}

export interface MediaJobRecord {
  readonly id: string;
  readonly spec: MediaJobSpec;
  readonly status: MediaJobStatus;
  readonly queuedAtMs: number;
  readonly startedAtMs: number | null;
  readonly finishedAtMs: number | null;
  readonly progress: MediaJobProgress | null;
  readonly result: MediaJobResult | null;
  readonly errorText: string | null;
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

/** Metadata for a single structural section (movement, track, chapter, etc.). */
export interface MovementMetadata {
  /** Optional human-readable parent work or collection title. */
  readonly collectionTitle?: string;
  /** Optional series or collection number. For Bach suites: 1–6. Omit for single works. */
  readonly suite?: number;
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
