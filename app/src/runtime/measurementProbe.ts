import type { AudioFrame } from '../types';
import { CANVAS } from '../theme';
import { levelToDb } from '../utils/canvas';
import { formatTransportTime } from '../utils/format';

export type MeasurementProbeFieldId = 'time' | 'levels' | 'lufs' | 'f0' | 'centroid' | 'band' | 'correlation';

export interface MeasurementProbeField {
  readonly id: MeasurementProbeFieldId;
  readonly text: string;
  readonly compactText: string;
  readonly tinyText: string;
}

export interface MeasurementProbeSnapshot {
  readonly time: string;
  readonly levels: string;
  readonly momentaryLufs: string;
  readonly f0: string;
  readonly centroid: string;
  readonly band: string;
  readonly correlation: string;
  readonly fields: readonly MeasurementProbeField[];
}

const PITCH_CONFIDENCE_MIN = 0.45;
const EMPTY_VALUE = '--';

export function buildLiveMeasurementProbe(
  frame: AudioFrame | null,
  momentaryLufsValue: number | null,
  transportTimeS: number | null,
): MeasurementProbeSnapshot {
  const time = formatProbeTime(transportTimeS);
  const levels = formatStereoPeakDb(frame, 'full');
  const compactLevels = formatStereoPeakDb(frame, 'compact');
  const momentaryLufs = formatMomentaryLufs(momentaryLufsValue, 'full');
  const compactMomentaryLufs = formatMomentaryLufs(momentaryLufsValue, 'compact');
  const f0 = formatF0(frame, 'full');
  const compactF0 = formatF0(frame, 'compact');
  const centroid = formatCentroid(frame, 'full');
  const compactCentroid = formatCentroid(frame, 'compact');
  const band = formatStrongestBand(frame, 'full');
  const compactBand = formatStrongestBand(frame, 'compact');
  const correlation = formatCorrelation(frame, 'full');
  const compactCorrelation = formatCorrelation(frame, 'compact');

  return {
    time,
    levels,
    momentaryLufs,
    f0,
    centroid,
    band,
    correlation,
    fields: [
      { id: 'time', text: time, compactText: time, tinyText: time },
      { id: 'levels', text: levels, compactText: compactLevels, tinyText: compactLevels.replace('L/R ', '') },
      { id: 'lufs', text: momentaryLufs, compactText: compactMomentaryLufs, tinyText: compactMomentaryLufs },
      { id: 'f0', text: f0, compactText: compactF0, tinyText: compactF0.replace('F0 ', '') },
      { id: 'centroid', text: centroid, compactText: compactCentroid, tinyText: compactCentroid },
      { id: 'band', text: band, compactText: compactBand, tinyText: compactBand },
      { id: 'correlation', text: correlation, compactText: compactCorrelation, tinyText: compactCorrelation.replace('CORR ', '') },
    ],
  };
}

function formatProbeTime(seconds: number | null): string {
  return seconds !== null && Number.isFinite(seconds) ? formatTransportTime(Math.max(0, seconds)) : EMPTY_VALUE;
}

function formatStereoPeakDb(frame: AudioFrame | null, density: 'full' | 'compact'): string {
  const left = formatDbNumber(frame?.peakLeft ? levelToDb(frame.peakLeft) : Number.NEGATIVE_INFINITY);
  const right = formatDbNumber(frame?.peakRight ? levelToDb(frame.peakRight) : Number.NEGATIVE_INFINITY);
  const suffix = left === EMPTY_VALUE && right === EMPTY_VALUE ? '' : ' dB';
  return `L/R ${left}/${right}${density === 'full' ? suffix : ''}`;
}

function formatMomentaryLufs(value: number | null, density: 'full' | 'compact'): string {
  return value !== null ? `M ${value.toFixed(1)}${density === 'full' ? ' LUFS' : ''}` : 'M --';
}

function formatF0(frame: AudioFrame | null, density: 'full' | 'compact'): string {
  if (!frame?.f0Hz || frame.f0Confidence <= PITCH_CONFIDENCE_MIN) return 'F0 --';
  return `F0 ${formatHzNumber(frame.f0Hz, density)}`;
}

function formatCentroid(frame: AudioFrame | null, density: 'full' | 'compact'): string {
  if (!frame || !Number.isFinite(frame.spectralCentroid) || frame.spectralCentroid <= 0) return 'CTR --';
  return `CTR ${formatHzNumber(frame.spectralCentroid, density)}`;
}

function formatStrongestBand(frame: AudioFrame | null, density: 'full' | 'compact'): string {
  if (!frame) return 'BAND --';
  const band = strongestBand(frame);
  return band ? `${density === 'full' ? 'BAND ' : ''}${band}` : 'BAND --';
}

function formatCorrelation(frame: AudioFrame | null, density: 'full' | 'compact'): string {
  if (!frame || !Number.isFinite(frame.phaseCorrelation)) return 'CORR --';
  const corr = Math.max(-1, Math.min(1, frame.phaseCorrelation));
  const value = `${corr >= 0 ? '+' : ''}${density === 'full' ? corr.toFixed(2) : corr.toFixed(2).replace(/^([+-])0\./, '$1.')}`;
  return `CORR ${value}`;
}

function formatDbNumber(db: number): string {
  if (!Number.isFinite(db)) return EMPTY_VALUE;
  return String(Math.round(db));
}

function formatHzNumber(hz: number, density: 'full' | 'compact'): string {
  if (!Number.isFinite(hz) || hz <= 0) return EMPTY_VALUE;
  if (density === 'compact' && hz >= 1000) return `${(hz / 1000).toFixed(1)}k`;
  return `${Math.round(hz)}${density === 'full' ? ' Hz' : ''}`;
}

function strongestBand(frame: AudioFrame): string | null {
  if (frame.frequencyDb.length === 0 || frame.sampleRate <= 0) return null;
  const binCount = frame.frequencyDb.length;
  let bestLabel: string | null = null;
  let bestDb: number = CANVAS.dbMin;
  for (const band of CANVAS.frequencyBands) {
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
      bestLabel = band.label;
    }
  }
  return bestLabel && bestDb > CANVAS.dbMin + 1 ? bestLabel : null;
}
