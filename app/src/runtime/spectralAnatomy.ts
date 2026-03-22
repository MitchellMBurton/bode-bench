import { AudioEngine } from '../audio/engine';
import { FrameBus } from '../audio/frameBus';
import { ScrollSpeedStore } from '../audio/scrollSpeed';
import { CANVAS } from '../theme';
import type { AudioFrame } from '../types';

type Listener = () => void;

const HISTORY_MAX = 1200;
const BASE_SCROLL_PX = CANVAS.timelineScrollPx;
const LUFS_FLOOR = -60;
const MOMENTARY_FRAMES = 8;
const SHORT_TERM_FRAMES = 60;
const ABS_GATE_LUFS = -70;
const REL_GATE_LU = 10;
const MAX_STORED_FRAMES = 7200;
const INT_RECOMPUTE_EVERY = 20;

const PRE_B0 = 1.53512485958697;
const PRE_B1 = -2.69169618940638;
const PRE_B2 = 1.19839281085285;
const PRE_A1 = -1.69065929318241;
const PRE_A2 = 0.73248077421585;
const RLB_B0 = 1.0;
const RLB_B1 = -2.0;
const RLB_B2 = 1.0;
const RLB_A1 = -1.99004745483398;
const RLB_A2 = 0.99007225036603;

interface BiquadState {
  px1: number;
  px2: number;
  py1: number;
  py2: number;
  rx1: number;
  rx2: number;
  ry1: number;
  ry2: number;
}

function makeBiquad(): BiquadState {
  return { px1: 0, px2: 0, py1: 0, py2: 0, rx1: 0, rx2: 0, ry1: 0, ry2: 0 };
}

function kWeightMs(samples: Float32Array, state: BiquadState): number {
  let sum = 0;
  let { px1, px2, py1, py2, rx1, rx2, ry1, ry2 } = state;

  for (let i = 0; i < samples.length; i++) {
    let x = samples[i];
    const y1 = PRE_B0 * x + PRE_B1 * px1 + PRE_B2 * px2 - PRE_A1 * py1 - PRE_A2 * py2;
    px2 = px1;
    px1 = x;
    py2 = py1;
    py1 = y1;
    x = y1;

    const y2 = RLB_B0 * x + RLB_B1 * rx1 + RLB_B2 * rx2 - RLB_A1 * ry1 - RLB_A2 * ry2;
    rx2 = rx1;
    rx1 = x;
    ry2 = ry1;
    ry1 = y2;
    sum += y2 * y2;
  }

  state.px1 = px1;
  state.px2 = px2;
  state.py1 = py1;
  state.py2 = py2;
  state.rx1 = rx1;
  state.rx2 = rx2;
  state.ry1 = ry1;
  state.ry2 = ry2;
  return samples.length > 0 ? sum / samples.length : 0;
}

function msToLufs(ms: number): number {
  return ms > 0 ? -0.691 + 10 * Math.log10(ms) : LUFS_FLOOR;
}

function rmsToDb(rms: number): number {
  return rms > 0 ? Math.max(-54, 20 * Math.log10(rms)) : -54;
}

export class SpectralAnatomyStore {
  private listeners = new Set<Listener>();
  private version = 0;

  private readonly advances = new Float32Array(HISTORY_MAX);
  private readonly rmsValues = new Float64Array(HISTORY_MAX);
  private readonly lufsValues = new Float64Array(HISTORY_MAX);
  private readonly spectroLeft: Float32Array[] = Array.from({ length: HISTORY_MAX }, () => new Float32Array(0));
  private readonly spectroRight: Float32Array[] = Array.from({ length: HISTORY_MAX }, () => new Float32Array(0));

  private historyPtr = 0;
  private historyLen = 0;
  private totalFrames = 0;
  private fileId = -1;
  private sampleRate = 44100;
  private fftBinCount = 0;
  private lastFrameAtMs = performance.now();
  private lastAdvanceCssPx: number = BASE_SCROLL_PX;
  private readonly audioEngine: AudioEngine;
  private readonly scrollSpeed: ScrollSpeedStore;

  private biquadL = makeBiquad();
  private biquadR = makeBiquad();
  private readonly kMsBuf = new Float32Array(SHORT_TERM_FRAMES);
  private kMsPtr = 0;
  private kMsLen = 0;
  private allMs = new Float32Array(MAX_STORED_FRAMES);
  private allMsCount = 0;
  private recomputeCounter = 0;
  private integratedLufs = LUFS_FLOOR;
  private hasIntegratedLufs = false;
  private truePeakDb = LUFS_FLOOR;

  private readonly unsubscribeFrameBus: () => void;
  private readonly unsubscribeReset: () => void;

  constructor(
    frameBus: FrameBus,
    audioEngine: AudioEngine,
    scrollSpeed: ScrollSpeedStore,
  ) {
    this.audioEngine = audioEngine;
    this.scrollSpeed = scrollSpeed;
    this.unsubscribeFrameBus = frameBus.subscribe((frame) => {
      this.handleFrame(frame);
    });
    this.unsubscribeReset = audioEngine.onReset(() => {
      this.reset(true);
    });
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): number => {
    return this.version;
  };

  destroy(): void {
    this.unsubscribeFrameBus();
    this.unsubscribeReset();
    this.listeners.clear();
  }

  get capacity(): number {
    return HISTORY_MAX;
  }

  get advanceHistory(): Float32Array {
    return this.advances;
  }

  get rmsHistory(): Float64Array {
    return this.rmsValues;
  }

  get loudnessHistory(): Float64Array {
    return this.lufsValues;
  }

  get spectrogramLeftHistory(): readonly Float32Array[] {
    return this.spectroLeft;
  }

  get spectrogramRightHistory(): readonly Float32Array[] {
    return this.spectroRight;
  }

  get ptr(): number {
    return this.historyPtr;
  }

  get len(): number {
    return this.historyLen;
  }

  get frameCount(): number {
    return this.totalFrames;
  }

  get currentFileId(): number {
    return this.fileId;
  }

  get currentSampleRate(): number {
    return this.sampleRate;
  }

  get currentFftBinCount(): number {
    return this.fftBinCount;
  }

  get latestFrameAtMs(): number {
    return this.lastFrameAtMs;
  }

  get latestAdvanceCssPx(): number {
    return this.lastAdvanceCssPx;
  }

  get integratedValueLufs(): number {
    return this.integratedLufs;
  }

  get hasIntegratedValue(): boolean {
    return this.hasIntegratedLufs;
  }

  get truePeakHoldDb(): number {
    return this.truePeakDb;
  }

  private handleFrame(frame: AudioFrame): void {
    if (frame.fileId !== this.fileId) {
      this.reset(false);
      this.fileId = frame.fileId;
      this.sampleRate = frame.sampleRate;
      this.fftBinCount = frame.frequencyDb.length;
    }

    const historyIndex = this.historyPtr % HISTORY_MAX;
    const advanceCssPx = BASE_SCROLL_PX * this.audioEngine.playbackRate * this.scrollSpeed.value;
    this.lastAdvanceCssPx = advanceCssPx;
    this.lastFrameAtMs = performance.now();
    this.sampleRate = frame.sampleRate;
    this.fftBinCount = frame.frequencyDb.length;

    this.advances[historyIndex] = advanceCssPx;
    this.rmsValues[historyIndex] = rmsToDb(Math.max(frame.rmsLeft, frame.rmsRight));
    this.lufsValues[historyIndex] = this.computeMomentaryLufs(frame);
    this.copySpectrogramSlice(this.spectroLeft, historyIndex, frame.frequencyDb);
    this.copySpectrogramSlice(this.spectroRight, historyIndex, frame.frequencyDbRight);
    this.updateTruePeak(frame);

    this.historyPtr++;
    this.historyLen = Math.min(this.historyLen + 1, HISTORY_MAX);
    this.totalFrames++;
    this.emit();
  }

  private copySpectrogramSlice(target: Float32Array[], historyIndex: number, source: Float32Array): void {
    if (target[historyIndex].length !== source.length) {
      target[historyIndex] = new Float32Array(source.length);
    }
    target[historyIndex].set(source);
  }

  private computeMomentaryLufs(frame: AudioFrame): number {
    const msL = kWeightMs(frame.timeDomain, this.biquadL);
    const msR = kWeightMs(frame.timeDomainRight, this.biquadR);
    const frameMs = (msL + msR) * 0.5;

    const ptr = this.kMsPtr % SHORT_TERM_FRAMES;
    this.kMsBuf[ptr] = frameMs;
    this.kMsPtr++;
    this.kMsLen = Math.min(this.kMsLen + 1, SHORT_TERM_FRAMES);

    let momentarySum = 0;
    const momentaryCount = Math.min(this.kMsLen, MOMENTARY_FRAMES);
    for (let i = 0; i < momentaryCount; i++) {
      const index = ((this.kMsPtr - 1 - i) % SHORT_TERM_FRAMES + SHORT_TERM_FRAMES) % SHORT_TERM_FRAMES;
      momentarySum += this.kMsBuf[index];
    }

    const nextAllIndex = this.allMsCount;
    if (nextAllIndex < MAX_STORED_FRAMES) {
      this.allMs[nextAllIndex] = frameMs;
      this.allMsCount = nextAllIndex + 1;
    }

    this.recomputeCounter++;
    if (this.recomputeCounter >= INT_RECOMPUTE_EVERY) {
      this.recomputeCounter = 0;
      this.recomputeIntegrated();
    }

    return momentaryCount > 0 ? msToLufs(momentarySum / momentaryCount) : LUFS_FLOOR;
  }

  private updateTruePeak(frame: AudioFrame): void {
    const peakLin = Math.max(frame.peakLeft, frame.peakRight);
    if (peakLin <= 0) return;
    const peakDb = 20 * Math.log10(peakLin);
    if (peakDb > this.truePeakDb) {
      this.truePeakDb = peakDb;
    }
  }

  private recomputeIntegrated(): void {
    const frameCount = this.allMsCount;
    if (frameCount === 0) {
      this.integratedLufs = LUFS_FLOOR;
      this.hasIntegratedLufs = false;
      return;
    }

    let absoluteSum = 0;
    let absoluteCount = 0;
    for (let i = 0; i < frameCount; i++) {
      if (msToLufs(this.allMs[i]) > ABS_GATE_LUFS) {
        absoluteSum += this.allMs[i];
        absoluteCount++;
      }
    }

    if (absoluteCount === 0) {
      this.integratedLufs = LUFS_FLOOR;
      this.hasIntegratedLufs = false;
      return;
    }

    const relativeThreshold = msToLufs(absoluteSum / absoluteCount) - REL_GATE_LU;
    let relativeSum = 0;
    let relativeCount = 0;
    for (let i = 0; i < frameCount; i++) {
      const lufs = msToLufs(this.allMs[i]);
      if (lufs > ABS_GATE_LUFS && lufs > relativeThreshold) {
        relativeSum += this.allMs[i];
        relativeCount++;
      }
    }

    if (relativeCount === 0) {
      this.integratedLufs = LUFS_FLOOR;
      this.hasIntegratedLufs = false;
      return;
    }

    this.integratedLufs = msToLufs(relativeSum / relativeCount);
    this.hasIntegratedLufs = true;
  }

  private reset(emit: boolean): void {
    this.advances.fill(0);
    this.rmsValues.fill(0);
    this.lufsValues.fill(0);
    this.historyPtr = 0;
    this.historyLen = 0;
    this.totalFrames = 0;
    this.fileId = -1;
    this.sampleRate = this.audioEngine.sampleRate;
    this.fftBinCount = 0;
    this.lastFrameAtMs = performance.now();
    this.lastAdvanceCssPx = BASE_SCROLL_PX * this.audioEngine.playbackRate * this.scrollSpeed.value;

    this.biquadL = makeBiquad();
    this.biquadR = makeBiquad();
    this.kMsBuf.fill(0);
    this.kMsPtr = 0;
    this.kMsLen = 0;
    this.allMs = new Float32Array(MAX_STORED_FRAMES);
    this.allMsCount = 0;
    this.recomputeCounter = 0;
    this.integratedLufs = LUFS_FLOOR;
    this.hasIntegratedLufs = false;
    this.truePeakDb = LUFS_FLOOR;

    if (emit) {
      this.emit();
    }
  }

  private emit(): void {
    this.version++;
    for (const listener of this.listeners) {
      listener();
    }
  }
}
