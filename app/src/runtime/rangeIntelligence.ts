import { CANVAS } from '../theme';
import type { AudioFrame, RangeMark } from '../types';
import { levelToDb } from '../utils/canvas';
import type { AudioEngine } from '../audio/engine';
import type { FrameBus } from '../audio/frameBus';
import type { SpectralAnatomyStore } from './spectralAnatomy';

type Listener = () => void;

export interface RangeIntelligenceSample {
  readonly timeS: number;
  readonly fileId: number;
  readonly peakDb: number;
  readonly momentaryLufs: number | null;
  readonly f0Hz: number | null;
  readonly centroidHz: number;
  readonly phaseCorrelation: number;
  readonly bandIndex: number | null;
}

export interface RangeIntelligenceSummary {
  readonly durationS: number;
  readonly sampleCount: number;
  readonly coverageRatio: number;
  readonly peakDb: number | null;
  readonly meanMomentaryLufs: number | null;
  readonly f0MinHz: number | null;
  readonly f0MaxHz: number | null;
  readonly meanCentroidHz: number | null;
  readonly meanPhaseCorrelation: number | null;
  readonly strongestBandLabel: string | null;
}

const MAX_SAMPLES = 24000;
const EMIT_INTERVAL_MS = 250;
const MAX_CONTIGUOUS_STEP_S = 0.5;
const PITCH_CONFIDENCE_MIN = 0.45;

export class RangeIntelligenceStore {
  private listeners = new Set<Listener>();
  private version = 0;
  private samples: Array<RangeIntelligenceSample | undefined> = new Array(MAX_SAMPLES);
  private writeIndex = 0;
  private len = 0;
  private fileId: number | null = null;
  private lastEmitAtMs = 0;
  private readonly spectralAnatomy: SpectralAnatomyStore;
  private readonly unsubscribeFrameBus: () => void;
  private readonly unsubscribeReset: () => void;

  constructor(
    frameBus: FrameBus,
    audioEngine: AudioEngine,
    spectralAnatomy: SpectralAnatomyStore,
  ) {
    this.spectralAnatomy = spectralAnatomy;
    this.unsubscribeFrameBus = frameBus.subscribe((frame) => {
      this.handleFrame(frame);
    });
    this.unsubscribeReset = audioEngine.onReset(() => {
      this.reset();
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

  summarizeRange(range: RangeMark): RangeIntelligenceSummary {
    return summarizeRangeIntelligenceSamples(this.getSamples(), range);
  }

  private handleFrame(frame: AudioFrame): void {
    if (this.fileId !== frame.fileId) {
      this.reset(false);
      this.fileId = frame.fileId;
    }

    const sample: RangeIntelligenceSample = {
      timeS: frame.currentTime,
      fileId: frame.fileId,
      peakDb: levelToDb(Math.max(frame.peakLeft, frame.peakRight)),
      momentaryLufs: this.spectralAnatomy.getLatestMomentaryLufs(),
      f0Hz: frame.f0Hz !== null && frame.f0Confidence > PITCH_CONFIDENCE_MIN ? frame.f0Hz : null,
      centroidHz: frame.spectralCentroid,
      phaseCorrelation: frame.phaseCorrelation,
      bandIndex: strongestBandIndex(frame),
    };
    this.samples[this.writeIndex] = sample;
    this.writeIndex = (this.writeIndex + 1) % MAX_SAMPLES;
    this.len = Math.min(this.len + 1, MAX_SAMPLES);
    this.emitThrottled();
  }

  private getSamples(): readonly RangeIntelligenceSample[] {
    const out: RangeIntelligenceSample[] = [];
    for (let i = 0; i < this.len; i++) {
      const index = (this.writeIndex - this.len + i + MAX_SAMPLES) % MAX_SAMPLES;
      const sample = this.samples[index];
      if (sample) out.push(sample);
    }
    return out;
  }

  private reset(emit = true): void {
    this.samples = new Array(MAX_SAMPLES);
    this.writeIndex = 0;
    this.len = 0;
    this.fileId = null;
    if (emit) this.emit();
  }

  private emitThrottled(): void {
    const now = performance.now();
    if (now - this.lastEmitAtMs < EMIT_INTERVAL_MS) return;
    this.lastEmitAtMs = now;
    this.emit();
  }

  private emit(): void {
    this.version++;
    for (const listener of this.listeners) listener();
  }
}

export function summarizeRangeIntelligenceSamples(
  samples: readonly RangeIntelligenceSample[],
  range: Pick<RangeMark, 'startS' | 'endS'>,
): RangeIntelligenceSummary {
  const startS = Math.min(range.startS, range.endS);
  const endS = Math.max(range.startS, range.endS);
  const durationS = Math.max(0, endS - startS);
  const inRange = samples
    .filter((sample) => sample.timeS >= startS && sample.timeS <= endS)
    .slice()
    .sort((a, b) => a.timeS - b.timeS);

  if (inRange.length === 0 || durationS <= 0) {
    return emptySummary(durationS);
  }

  let peakDb = Number.NEGATIVE_INFINITY;
  let lufsSum = 0;
  let lufsCount = 0;
  let f0MinHz = Number.POSITIVE_INFINITY;
  let f0MaxHz = Number.NEGATIVE_INFINITY;
  let centroidSum = 0;
  let centroidCount = 0;
  let corrSum = 0;
  let corrCount = 0;
  const bandCounts = new Map<number, number>();

  for (const sample of inRange) {
    if (Number.isFinite(sample.peakDb) && sample.peakDb > peakDb) peakDb = sample.peakDb;
    if (sample.momentaryLufs !== null && Number.isFinite(sample.momentaryLufs)) {
      lufsSum += sample.momentaryLufs;
      lufsCount++;
    }
    if (sample.f0Hz !== null && Number.isFinite(sample.f0Hz)) {
      f0MinHz = Math.min(f0MinHz, sample.f0Hz);
      f0MaxHz = Math.max(f0MaxHz, sample.f0Hz);
    }
    if (Number.isFinite(sample.centroidHz) && sample.centroidHz > 0) {
      centroidSum += sample.centroidHz;
      centroidCount++;
    }
    if (Number.isFinite(sample.phaseCorrelation)) {
      corrSum += Math.max(-1, Math.min(1, sample.phaseCorrelation));
      corrCount++;
    }
    if (sample.bandIndex !== null) {
      bandCounts.set(sample.bandIndex, (bandCounts.get(sample.bandIndex) ?? 0) + 1);
    }
  }

  return {
    durationS,
    sampleCount: inRange.length,
    coverageRatio: estimateCoverageRatio(inRange, durationS),
    peakDb: Number.isFinite(peakDb) ? peakDb : null,
    meanMomentaryLufs: lufsCount > 0 ? lufsSum / lufsCount : null,
    f0MinHz: Number.isFinite(f0MinHz) ? f0MinHz : null,
    f0MaxHz: Number.isFinite(f0MaxHz) ? f0MaxHz : null,
    meanCentroidHz: centroidCount > 0 ? centroidSum / centroidCount : null,
    meanPhaseCorrelation: corrCount > 0 ? corrSum / corrCount : null,
    strongestBandLabel: strongestBandLabel(bandCounts),
  };
}

export function formatRangeIntelligenceSummary(summary: RangeIntelligenceSummary, density: 'row' | 'active' = 'row'): string {
  const parts = [formatDuration(summary.durationS)];
  if (summary.sampleCount === 0) {
    parts.push('MEASURE --');
    return parts.join('  ');
  }
  if (summary.meanMomentaryLufs !== null) parts.push(`M ${summary.meanMomentaryLufs.toFixed(1)}`);
  if (density === 'row' && summary.peakDb !== null) parts.push(`PK ${Math.round(summary.peakDb)}`);
  if (summary.f0MinHz !== null && summary.f0MaxHz !== null) parts.push(`F0 ${formatPitchRange(summary.f0MinHz, summary.f0MaxHz)}`);
  if (summary.meanPhaseCorrelation !== null) parts.push(`CORR ${formatCorrelation(summary.meanPhaseCorrelation)}`);
  if (density === 'row' && summary.strongestBandLabel !== null) parts.push(summary.strongestBandLabel);
  if (summary.coverageRatio > 0 && summary.coverageRatio < 0.8) parts.push(`PARTIAL ${Math.round(summary.coverageRatio * 100)}%`);
  return parts.join('  ');
}

function emptySummary(durationS: number): RangeIntelligenceSummary {
  return {
    durationS,
    sampleCount: 0,
    coverageRatio: 0,
    peakDb: null,
    meanMomentaryLufs: null,
    f0MinHz: null,
    f0MaxHz: null,
    meanCentroidHz: null,
    meanPhaseCorrelation: null,
    strongestBandLabel: null,
  };
}

function estimateCoverageRatio(samples: readonly RangeIntelligenceSample[], durationS: number): number {
  if (durationS <= 0 || samples.length === 0) return 0;
  if (samples.length === 1) return Math.min(1, 0.05 / durationS);
  const intervals: number[] = [];
  for (let i = 1; i < samples.length; i++) {
    const dt = samples[i].timeS - samples[i - 1].timeS;
    if (dt > 0 && dt <= MAX_CONTIGUOUS_STEP_S) intervals.push(dt);
  }
  const typicalStep = intervals.length > 0 ? intervals.reduce((sum, dt) => sum + dt, 0) / intervals.length : 0.05;
  const coveredS = intervals.reduce((sum, dt) => sum + dt, 0) + typicalStep;
  return Math.max(0, Math.min(1, coveredS / durationS));
}

function strongestBandLabel(counts: ReadonlyMap<number, number>): string | null {
  let bestIndex: number | null = null;
  let bestCount = 0;
  for (const [index, count] of counts) {
    if (count > bestCount) {
      bestIndex = index;
      bestCount = count;
    }
  }
  return bestIndex === null ? null : CANVAS.frequencyBands[bestIndex]?.label ?? null;
}

function strongestBandIndex(frame: AudioFrame): number | null {
  if (frame.frequencyDb.length === 0 || frame.sampleRate <= 0) return null;
  const binCount = frame.frequencyDb.length;
  let bestIndex: number | null = null;
  let bestDb: number = CANVAS.dbMin;
  for (let i = 0; i < CANVAS.frequencyBands.length; i++) {
    const band = CANVAS.frequencyBands[i];
    const lowBin = Math.max(0, Math.floor((band.lowHz / (frame.sampleRate / 2)) * binCount));
    const highBin = Math.min(Math.ceil((band.highHz / (frame.sampleRate / 2)) * binCount), binCount - 1);
    if (highBin < lowBin) continue;
    let sum = 0;
    let count = 0;
    for (let bin = lowBin; bin <= highBin; bin++) {
      const db = frame.frequencyDb[bin];
      if (Number.isFinite(db)) {
        sum += db;
        count++;
      }
    }
    if (count === 0) continue;
    const avgDb = sum / count;
    if (avgDb > bestDb) {
      bestDb = avgDb;
      bestIndex = i;
    }
  }
  return bestIndex !== null && bestDb > CANVAS.dbMin + 1 ? bestIndex : null;
}

function formatDuration(durationS: number): string {
  if (durationS >= 60) return `${Math.round(durationS)}s`;
  return `${durationS.toFixed(1)}s`;
}

function formatPitchRange(minHz: number, maxHz: number): string {
  const min = Math.round(minHz);
  const max = Math.round(maxHz);
  return Math.abs(max - min) <= 2 ? `${min}` : `${min}-${max}`;
}

function formatCorrelation(value: number): string {
  const clamped = Math.max(-1, Math.min(1, value));
  return `${clamped >= 0 ? '+' : ''}${clamped.toFixed(2).replace(/^([+-])0\./, '$1.')}`;
}
