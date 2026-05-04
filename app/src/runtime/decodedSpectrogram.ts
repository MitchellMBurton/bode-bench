import type { SpectrogramViewMode } from '../types';

export interface SpectrogramRowBand {
  readonly lowBin: number;
  readonly highBin: number;
}

export interface DecodedSpectrogramInput {
  readonly buffer: AudioBuffer;
  readonly fftSize: number;
  readonly width: number;
  readonly rowBands: readonly SpectrogramRowBand[];
  readonly dbMin: number;
  readonly dbMax: number;
}

export interface DecodedSpectrogramSource {
  readonly left: Float32Array;
  readonly right: Float32Array;
  readonly length: number;
  readonly sampleRate: number;
  readonly numberOfChannels: number;
}

export interface DecodedSpectrogramSourceInput {
  readonly source: DecodedSpectrogramSource;
  readonly fftSize: number;
  readonly width: number;
  readonly rowBands: readonly SpectrogramRowBand[];
  readonly dbMin: number;
  readonly dbMax: number;
}

export interface DecodedSpectrogramColumnRange {
  readonly startColumn: number;
  readonly endColumn: number;
}

export interface DecodedSpectrogramBuildResult {
  readonly completedColumns: number;
  readonly builtRanges: readonly DecodedSpectrogramColumnRange[];
}

export interface DecodedSpectrogramBuilder {
  readonly history: Int16Array;
  readonly width: number;
  readonly height: number;
  readonly completedColumns: number;
  readonly done: boolean;
  advance(maxMs: number, priorityRange?: DecodedSpectrogramColumnRange | null): DecodedSpectrogramBuildResult;
}

export interface DecodedSpectrogramViewRange {
  readonly start: number;
  readonly end: number;
}

const HISTORY_EMPTY = -1;
const HISTORY_LEVELS = 256;
const MAX_BROWSER_OVERVIEW_PCM_BYTES = 384 * 1024 * 1024;
const MAX_BROWSER_OVERVIEW_COLUMNS = 24_576;
const OVERVIEW_COLUMN_DENSITY = 1.25;
const WINDOW_DETAIL_TARGET_SECONDS = 12;
const SHORT_SOURCE_DETAIL_SECONDS = 8;
const SHORT_SOURCE_COLUMNS_PER_SECOND = 1_600;
const SHORT_SOURCE_MIN_COLUMNS = 4_096;
const SHORT_SOURCE_TEMPORAL_WINDOWS = 48;
const MIN_DECODED_FFT_SIZE = 1_024;

interface FftPlan {
  readonly size: number;
  readonly bitReverse: Uint32Array;
  readonly window: Float32Array;
}

export function estimateDecodedPcmBytes(buffer: AudioBuffer): number {
  return buffer.length * buffer.numberOfChannels * Float32Array.BYTES_PER_ELEMENT;
}

export function canBuildDecodedSpectrogramOverview(buffer: AudioBuffer | null): boolean {
  if (!buffer || buffer.length <= 0 || buffer.sampleRate <= 0 || buffer.numberOfChannels <= 0) return false;
  return estimateDecodedPcmBytes(buffer) <= MAX_BROWSER_OVERVIEW_PCM_BYTES;
}

export function pickDecodedSpectrogramColumnCount(pixelWidth: number, durationS?: number): number {
  const safePixelWidth = Math.max(1, Math.round(pixelWidth));
  const safeDurationS = typeof durationS === 'number' && Number.isFinite(durationS) && durationS > 0
    ? durationS
    : null;
  const overviewColumns = safePixelWidth * OVERVIEW_COLUMN_DENSITY;
  const windowInspectionColumns = safeDurationS !== null
    ? safePixelWidth * (safeDurationS / WINDOW_DETAIL_TARGET_SECONDS)
    : 0;
  const shortSourceColumns = safeDurationS !== null && safeDurationS <= SHORT_SOURCE_DETAIL_SECONDS
    ? Math.max(SHORT_SOURCE_MIN_COLUMNS, safeDurationS * SHORT_SOURCE_COLUMNS_PER_SECOND)
    : 0;
  return Math.max(
    1,
    Math.min(
      MAX_BROWSER_OVERVIEW_COLUMNS,
      Math.round(Math.max(overviewColumns, windowInspectionColumns, shortSourceColumns)),
    ),
  );
}

export function pickDecodedSpectrogramFftSize(requestedFftSize: number, durationS: number, sampleRate: number): number {
  const requested = nearestPowerOfTwo(requestedFftSize);
  if (
    !Number.isFinite(durationS)
    || durationS <= 0
    || durationS > SHORT_SOURCE_DETAIL_SECONDS
    || !Number.isFinite(sampleRate)
    || sampleRate <= 0
  ) {
    return requested;
  }

  const maxWindowSamples = (sampleRate * durationS) / SHORT_SOURCE_TEMPORAL_WINDOWS;
  const shortFft = nearestPowerOfTwoAtMost(maxWindowSamples);
  return Math.min(requested, Math.max(MIN_DECODED_FFT_SIZE, shortFft));
}

export function buildDecodedSpectrogramHistory(input: DecodedSpectrogramInput): Int16Array {
  const builder = createDecodedSpectrogramBuilder(input);
  builder.advance(Number.POSITIVE_INFINITY);
  return builder.history;
}

export function createDecodedSpectrogramBuilder(input: DecodedSpectrogramInput): DecodedSpectrogramBuilder {
  return createDecodedSpectrogramSourceBuilder({
    ...input,
    source: getDecodedSpectrogramSource(input.buffer),
  });
}

export function getDecodedSpectrogramSource(buffer: AudioBuffer): DecodedSpectrogramSource {
  const left = buffer.getChannelData(0);
  return {
    left,
    right: buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left,
    length: buffer.length,
    sampleRate: buffer.sampleRate,
    numberOfChannels: buffer.numberOfChannels,
  };
}

export function copyDecodedSpectrogramSource(buffer: AudioBuffer): DecodedSpectrogramSource {
  const left = new Float32Array(buffer.getChannelData(0));
  return {
    left,
    right: buffer.numberOfChannels > 1 ? new Float32Array(buffer.getChannelData(1)) : new Float32Array(left),
    length: buffer.length,
    sampleRate: buffer.sampleRate,
    numberOfChannels: buffer.numberOfChannels,
  };
}

export function getDecodedSpectrogramSourceTransferables(source: DecodedSpectrogramSource): Transferable[] {
  return source.left.buffer === source.right.buffer
    ? [source.left.buffer]
    : [source.left.buffer, source.right.buffer];
}

export function createDecodedSpectrogramSourceBuilder(input: DecodedSpectrogramSourceInput): DecodedSpectrogramBuilder {
  const width = Math.max(1, Math.round(input.width));
  const height = input.rowBands.length;
  const history = new Int16Array(width * height);
  history.fill(HISTORY_EMPTY);

  if (height <= 0 || input.source.length <= 0) {
    return {
      history,
      width,
      height,
      completedColumns: width,
      done: true,
      advance: () => ({ completedColumns: width, builtRanges: [] }),
    };
  }

  const fftSize = nearestPowerOfTwo(input.fftSize);
  const plan = createFftPlan(fftSize);
  const real = new Float64Array(fftSize);
  const imag = new Float64Array(fftSize);
  const { left, right } = input.source;
  const fftBinCount = fftSize / 2;
  let completedColumns = 0;
  let nextSequentialColumn = 0;
  let priorityKey = '';
  let priorityCursor = 0;
  const builtColumns = new Uint8Array(width);

  const buildColumn = (x: number): void => {
    real.fill(0);
    imag.fill(0);
    const centerSample = Math.round(((x + 0.5) / width) * input.source.length);
    const startSample = centerSample - Math.floor(fftSize / 2);

    for (let i = 0; i < fftSize; i++) {
      const sampleIndex = startSample + i;
      if (sampleIndex < 0 || sampleIndex >= input.source.length) continue;
      real[i] = ((left[sampleIndex] + right[sampleIndex]) * 0.5) * plan.window[i];
    }

    fftInPlace(real, imag, plan);

    for (let y = 0; y < height; y++) {
      const band = input.rowBands[y];
      history[y * width + x] = dbToHistoryLevel(
        bandAverageDb(real, imag, band.lowBin, band.highBin, fftBinCount, fftSize),
        input.dbMin,
        input.dbMax,
      );
    }
  };

  const findPriorityColumn = (priorityRange?: DecodedSpectrogramColumnRange | null): number | null => {
    if (!priorityRange) return null;
    const start = Math.max(0, Math.min(width, Math.floor(priorityRange.startColumn)));
    const end = Math.max(start, Math.min(width, Math.ceil(priorityRange.endColumn)));
    if (start >= end) return null;

    const key = `${start}:${end}`;
    if (key !== priorityKey) {
      priorityKey = key;
      priorityCursor = start;
    }

    for (let column = priorityCursor; column < end; column++) {
      if (builtColumns[column] === 0) {
        priorityCursor = column + 1;
        return column;
      }
    }

    for (let column = start; column < Math.min(priorityCursor, end); column++) {
      if (builtColumns[column] === 0) {
        priorityCursor = column + 1;
        return column;
      }
    }

    return null;
  };

  const findSequentialColumn = (): number | null => {
    while (nextSequentialColumn < width && builtColumns[nextSequentialColumn] !== 0) {
      nextSequentialColumn++;
    }
    return nextSequentialColumn < width ? nextSequentialColumn : null;
  };

  const addBuiltRange = (ranges: DecodedSpectrogramColumnRange[], column: number): void => {
    const lastRange = ranges[ranges.length - 1];
    if (lastRange && lastRange.endColumn === column) {
      ranges[ranges.length - 1] = {
        startColumn: lastRange.startColumn,
        endColumn: column + 1,
      };
      return;
    }
    ranges.push({ startColumn: column, endColumn: column + 1 });
  };

  return {
    history,
    width,
    height,
    get completedColumns() {
      return completedColumns;
    },
    get done() {
      return completedColumns >= width;
    },
    advance(maxMs: number, priorityRange?: DecodedSpectrogramColumnRange | null): DecodedSpectrogramBuildResult {
      const builtRanges: DecodedSpectrogramColumnRange[] = [];
      if (completedColumns >= width) return { completedColumns, builtRanges };

      if (!Number.isFinite(maxMs)) {
        while (completedColumns < width) {
          const column = findSequentialColumn();
          if (column === null) break;
          buildColumn(column);
          builtColumns[column] = 1;
          completedColumns++;
          addBuiltRange(builtRanges, column);
        }
        return { completedColumns, builtRanges };
      }

      const deadline = nowMs() + Math.max(0, maxMs);
      do {
        const column = findPriorityColumn(priorityRange) ?? findSequentialColumn();
        if (column === null) break;
        buildColumn(column);
        builtColumns[column] = 1;
        completedColumns++;
        addBuiltRange(builtRanges, column);
      } while (completedColumns < width && nowMs() < deadline);

      return { completedColumns, builtRanges };
    },
  };
}

export function projectDecodedSpectrogramHistory(
  source: Int16Array,
  sourceWidth: number,
  targetWidth: number,
  height: number,
  startRatio: number,
  endRatio: number,
): Int16Array {
  const safeTargetWidth = Math.max(1, Math.round(targetWidth));
  const projected = new Int16Array(safeTargetWidth * height);
  projected.fill(HISTORY_EMPTY);
  if (sourceWidth <= 0 || height <= 0 || source.length < sourceWidth * height) return projected;

  const start = clamp(startRatio, 0, 1);
  const end = clamp(endRatio, start, 1);
  const span = Math.max(0, end - start);
  if (span <= 0) return projected;

  for (let x = 0; x < safeTargetWidth; x++) {
    const ratio = start + ((x + 0.5) / safeTargetWidth) * span;
    const sourceX = Math.max(0, Math.min(sourceWidth - 1, Math.floor(ratio * sourceWidth)));
    for (let y = 0; y < height; y++) {
      projected[y * safeTargetWidth + x] = source[y * sourceWidth + sourceX];
    }
  }

  return projected;
}

export function resolveDecodedSpectrogramPlaybackRatio(
  viewMode: SpectrogramViewMode,
  currentTimeS: number,
  durationS: number,
  viewRange: DecodedSpectrogramViewRange,
): number | null {
  if (viewMode === 'live' || durationS <= 0 || !Number.isFinite(currentTimeS)) return null;

  if (viewMode === 'full') {
    return clamp(currentTimeS / durationS, 0, 1);
  }

  const span = viewRange.end - viewRange.start;
  if (span <= 0 || currentTimeS < viewRange.start || currentTimeS > viewRange.end) return null;
  return clamp((currentTimeS - viewRange.start) / span, 0, 1);
}

export function resolveDecodedSpectrogramTime(
  viewMode: SpectrogramViewMode,
  visibleRatio: number,
  durationS: number,
  viewRange: DecodedSpectrogramViewRange,
): number | null {
  if (viewMode === 'live' || durationS <= 0 || !Number.isFinite(durationS)) return null;
  const ratio = clamp(visibleRatio, 0, 1);

  if (viewMode === 'full') {
    return ratio * durationS;
  }

  const start = clamp(viewRange.start, 0, durationS);
  const end = clamp(viewRange.end, start, durationS);
  const span = end - start;
  if (span <= 0) return null;
  return clamp(start + ratio * span, 0, durationS);
}

export function resolveDecodedSpectrogramRange(
  viewMode: SpectrogramViewMode,
  startVisibleRatio: number,
  endVisibleRatio: number,
  durationS: number,
  viewRange: DecodedSpectrogramViewRange,
  minDurationS = 0.01,
): { readonly startS: number; readonly endS: number } | null {
  const startTime = resolveDecodedSpectrogramTime(viewMode, startVisibleRatio, durationS, viewRange);
  const endTime = resolveDecodedSpectrogramTime(viewMode, endVisibleRatio, durationS, viewRange);
  if (startTime === null || endTime === null) return null;

  const startS = Math.min(startTime, endTime);
  const endS = Math.max(startTime, endTime);
  if (endS - startS < minDurationS) return null;
  return { startS, endS };
}

function nearestPowerOfTwo(value: number): number {
  const safe = Math.max(2, Math.round(value));
  return 2 ** Math.round(Math.log2(safe));
}

function nearestPowerOfTwoAtMost(value: number): number {
  if (!Number.isFinite(value) || value <= 2) return 2;
  return 2 ** Math.floor(Math.log2(value));
}

function createFftPlan(size: number): FftPlan {
  const bits = Math.round(Math.log2(size));
  const bitReverse = new Uint32Array(size);
  for (let index = 0; index < size; index++) {
    let reversed = 0;
    for (let bit = 0; bit < bits; bit++) {
      reversed = (reversed << 1) | ((index >> bit) & 1);
    }
    bitReverse[index] = reversed;
  }

  const window = new Float32Array(size);
  for (let index = 0; index < size; index++) {
    window[index] = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / Math.max(1, size - 1));
  }

  return { size, bitReverse, window };
}

function fftInPlace(real: Float64Array, imag: Float64Array, plan: FftPlan): void {
  const { size, bitReverse } = plan;
  for (let index = 0; index < size; index++) {
    const swap = bitReverse[index];
    if (swap <= index) continue;
    [real[index], real[swap]] = [real[swap], real[index]];
    [imag[index], imag[swap]] = [imag[swap], imag[index]];
  }

  for (let length = 2; length <= size; length *= 2) {
    const half = length / 2;
    const theta = (-2 * Math.PI) / length;
    const wMulR = Math.cos(theta);
    const wMulI = Math.sin(theta);

    for (let start = 0; start < size; start += length) {
      let wR = 1;
      let wI = 0;
      for (let offset = 0; offset < half; offset++) {
        const even = start + offset;
        const odd = even + half;
        const tR = wR * real[odd] - wI * imag[odd];
        const tI = wR * imag[odd] + wI * real[odd];
        real[odd] = real[even] - tR;
        imag[odd] = imag[even] - tI;
        real[even] += tR;
        imag[even] += tI;

        const nextWR = wR * wMulR - wI * wMulI;
        wI = wR * wMulI + wI * wMulR;
        wR = nextWR;
      }
    }
  }
}

function bandAverageDb(
  real: Float64Array,
  imag: Float64Array,
  lowBin: number,
  highBin: number,
  fftBinCount: number,
  fftSize: number,
): number {
  const lo = Math.max(1, Math.min(fftBinCount - 1, Math.floor(lowBin)));
  const hi = Math.max(lo, Math.min(fftBinCount - 1, Math.ceil(highBin)));
  let powerSum = 0;
  let count = 0;

  for (let bin = lo; bin <= hi; bin++) {
    const magnitude = (Math.sqrt(real[bin] * real[bin] + imag[bin] * imag[bin]) * 2) / fftSize;
    powerSum += magnitude * magnitude;
    count++;
  }

  if (count <= 0 || powerSum <= 0) return -120;
  return 10 * Math.log10(powerSum / count);
}

function dbToHistoryLevel(db: number, dbMin: number, dbMax: number): number {
  const t = clamp((db - dbMin) / (dbMax - dbMin), 0, 1);
  return Math.round(t * (HISTORY_LEVELS - 1));
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
