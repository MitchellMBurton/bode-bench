function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export type WaveformDetailRenderMode = 'sample' | 'envelope' | 'event';

export const EVENT_MODE_MIN_VISIBLE_SPAN_S = 12;
export const EVENT_MODE_BLEND_START_S = 10;
export const EVENT_MODE_BLEND_END_S = 14;
export const EVENT_MODE_DB_FLOOR_DB = -54;
const EVENT_MODE_DB_EPSILON = 10 ** (EVENT_MODE_DB_FLOOR_DB / 20);
export const EVENT_SCAFFOLD_COVERAGE_MARGIN = 0.12;

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge1 <= edge0) return value >= edge1 ? 1 : 0;
  const t = clampNumber((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function computeEventModeBlend(visibleSpanS: number): number {
  return smoothstep(EVENT_MODE_BLEND_START_S, EVENT_MODE_BLEND_END_S, visibleSpanS);
}

export function pickWaveformDetailRenderMode(
  visibleSpanS: number,
  useSampleView: boolean,
): WaveformDetailRenderMode {
  if (useSampleView) return 'sample';
  return computeEventModeBlend(visibleSpanS) > 0.5 ? 'event' : 'envelope';
}

export function shouldUseEventScaffold(detailCoverage: number, scaffoldCoverage: number): boolean {
  return scaffoldCoverage > detailCoverage + EVENT_SCAFFOLD_COVERAGE_MARGIN;
}

export function amplitudeToEventHeight(
  amplitude: number,
  floorDb: number = EVENT_MODE_DB_FLOOR_DB,
): number {
  const safeAmplitude = Math.max(Math.abs(amplitude), EVENT_MODE_DB_EPSILON);
  const db = 20 * Math.log10(safeAmplitude);
  return clampNumber((db - floorDb) / -floorDb, 0, 1);
}

export function computeTransientIntensity(
  peakHeight: number,
  rmsHeight: number,
  clipDensity: number,
  neighborContrast: number,
): number {
  const crestGap = Math.max(0, peakHeight - rmsHeight);
  return clampNumber(crestGap * 0.65 + neighborContrast * 0.45 + clipDensity * 0.85, 0, 1);
}
