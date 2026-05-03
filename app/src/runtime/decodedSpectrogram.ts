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

const HISTORY_EMPTY = -1;
const HISTORY_LEVELS = 256;
const MAX_BROWSER_OVERVIEW_PCM_BYTES = 96 * 1024 * 1024;
const MAX_BROWSER_OVERVIEW_COLUMNS = 720;

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

export function pickDecodedSpectrogramColumnCount(pixelWidth: number): number {
  return Math.max(1, Math.min(MAX_BROWSER_OVERVIEW_COLUMNS, Math.round(pixelWidth)));
}

export function buildDecodedSpectrogramHistory(input: DecodedSpectrogramInput): Int16Array {
  const width = Math.max(1, Math.round(input.width));
  const height = input.rowBands.length;
  const history = new Int16Array(width * height);
  history.fill(HISTORY_EMPTY);

  if (height <= 0 || input.buffer.length <= 0) return history;

  const fftSize = nearestPowerOfTwo(input.fftSize);
  const plan = createFftPlan(fftSize);
  const real = new Float64Array(fftSize);
  const imag = new Float64Array(fftSize);
  const left = input.buffer.getChannelData(0);
  const right = input.buffer.numberOfChannels > 1 ? input.buffer.getChannelData(1) : left;
  const fftBinCount = fftSize / 2;

  for (let x = 0; x < width; x++) {
    real.fill(0);
    imag.fill(0);
    const centerSample = Math.round(((x + 0.5) / width) * input.buffer.length);
    const startSample = centerSample - Math.floor(fftSize / 2);

    for (let i = 0; i < fftSize; i++) {
      const sampleIndex = startSample + i;
      if (sampleIndex < 0 || sampleIndex >= input.buffer.length) continue;
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
  }

  return history;
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

function nearestPowerOfTwo(value: number): number {
  const safe = Math.max(2, Math.round(value));
  return 2 ** Math.round(Math.log2(safe));
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
