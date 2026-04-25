export interface AudioFrameFeatures {
  readonly peakLeft: number;
  readonly peakRight: number;
  readonly rmsLeft: number;
  readonly rmsRight: number;
  readonly spectralCentroid: number;
  readonly f0Hz: number | null;
  readonly f0Confidence: number;
  readonly phaseCorrelation: number;
}

const PITCH_RMS_FLOOR = 0.005;
const PITCH_MIN_HZ = 60;
const PITCH_MAX_HZ = 1000;
const PITCH_MIN_CONFIDENCE = 0.4;
const PITCH_MAX_WINDOW_SAMPLES = 2048;

export function detectFundamental(
  samples: Float32Array,
  sampleRate: number,
  rms: number,
): { f0: number | null; confidence: number } {
  const size = Math.min(PITCH_MAX_WINDOW_SAMPLES, samples.length);
  if (size <= 1 || rms < PITCH_RMS_FLOOR) {
    return { f0: null, confidence: 0 };
  }

  const minLag = Math.floor(sampleRate / PITCH_MAX_HZ);
  const maxLag = Math.min(Math.floor(sampleRate / PITCH_MIN_HZ), size - 1);
  if (maxLag < minLag) {
    return { f0: null, confidence: 0 };
  }

  let bestLag = -1;
  let bestCorr = 0;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    let norm1 = 0;
    let norm2 = 0;
    const limit = size - lag;
    for (let i = 0; i < limit; i++) {
      const a = samples[i];
      const b = samples[i + lag];
      sum += a * b;
      norm1 += a * a;
      norm2 += b * b;
    }
    const denom = Math.sqrt(norm1 * norm2);
    const corr = denom > 0 ? sum / denom : 0;
    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }

  const f0 = bestLag > 0 && bestCorr > PITCH_MIN_CONFIDENCE ? sampleRate / bestLag : null;
  return { f0, confidence: Math.max(0, bestCorr) };
}

export function computeAudioFrameFeatures(
  timeDomainLeft: Float32Array,
  timeDomainRight: Float32Array,
  frequencyDbLeft: Float32Array,
  sampleRate: number,
): AudioFrameFeatures {
  const sampleCount = Math.min(timeDomainLeft.length, timeDomainRight.length);
  let peakLeft = 0;
  let peakRight = 0;
  let rmsLeftSum = 0;
  let rmsRightSum = 0;
  let sumLR = 0;

  for (let index = 0; index < sampleCount; index++) {
    const left = timeDomainLeft[index];
    const right = timeDomainRight[index];
    const absLeft = Math.abs(left);
    const absRight = Math.abs(right);

    if (absLeft > peakLeft) peakLeft = absLeft;
    if (absRight > peakRight) peakRight = absRight;
    rmsLeftSum += left * left;
    rmsRightSum += right * right;
    sumLR += left * right;
  }

  const rmsLeft = sampleCount > 0 ? Math.sqrt(rmsLeftSum / sampleCount) : 0;
  const rmsRight = sampleCount > 0 ? Math.sqrt(rmsRightSum / sampleCount) : 0;
  const corrDenom = Math.sqrt(rmsLeftSum * rmsRightSum);
  const phaseCorrelation = corrDenom > 0 ? sumLR / corrDenom : 0;

  const binCount = frequencyDbLeft.length;
  const binHz = sampleRate / (binCount * 2);
  let centroidNum = 0;
  let centroidDen = 0;
  for (let index = 1; index < binCount; index++) {
    const power = Math.pow(10, frequencyDbLeft[index] / 10);
    centroidNum += index * binHz * power;
    centroidDen += power;
  }

  const { f0, confidence } = detectFundamental(timeDomainLeft, sampleRate, rmsLeft);
  return {
    peakLeft: Math.min(peakLeft, 1),
    peakRight: Math.min(peakRight, 1),
    rmsLeft: Math.min(rmsLeft, 1),
    rmsRight: Math.min(rmsRight, 1),
    spectralCentroid: centroidDen > 0 ? centroidNum / centroidDen : 0,
    f0Hz: f0,
    f0Confidence: confidence,
    phaseCorrelation,
  };
}
