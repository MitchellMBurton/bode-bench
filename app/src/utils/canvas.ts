// Shared canvas helpers

import { CANVAS, COLORS } from '../theme';

/** Convert normalised 0–1 level to dB. Returns –Infinity for 0. */
export function levelToDb(level: number): number {
  if (level <= 0) return -Infinity;
  return 20 * Math.log10(level);
}

/** Map dB value to a 0–1 fraction using the display range. */
export function dbToFraction(db: number): number {
  return Math.max(0, Math.min(1, (db - CANVAS.dbMin) / (CANVAS.dbMax - CANVAS.dbMin)));
}

/** Map a 0–1 fraction to canvas height (top=0). */
export function fractionToY(fraction: number, height: number): number {
  return height * (1 - fraction);
}

/** Draw a simple horizontal dB scale on the right edge of a canvas. */
export function drawDbScale(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  height: number,
  tickValues: number[] = [-60, -40, -20, -12, -6, -3, 0],
): void {
  ctx.save();
  ctx.font = `${9}px "JetBrains Mono", monospace`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = COLORS.border;
  ctx.fillStyle = COLORS.textDim;
  ctx.lineWidth = 0.5;

  for (const db of tickValues) {
    const fraction = dbToFraction(db);
    const ty = y + height * (1 - fraction);
    ctx.beginPath();
    ctx.moveTo(x - 4, ty);
    ctx.lineTo(x, ty);
    ctx.stroke();
    ctx.fillText(`${db}`, x - 6, ty);
  }
  ctx.restore();
}

/** Map a frequency (Hz) to an x-position across a given width, log scale. */
export function freqToX(hz: number, width: number, minHz = 20, maxHz = 20000): number {
  const logMin = Math.log10(minHz);
  const logMax = Math.log10(maxHz);
  return ((Math.log10(hz) - logMin) / (logMax - logMin)) * width;
}

/** Map an FFT bin index to frequency (Hz). */
export function binToHz(bin: number, fftSize: number, sampleRate: number): number {
  return (bin * sampleRate) / fftSize;
}

/** Spectro colour map: NGE phosphor — void → dark green → mid green → lime → white-green.
 *  Matches the phosphor terminal aesthetic of the NGE display mode. */
export function spectroColorNge(db: number): string {
  const t = Math.max(0, Math.min(1, (db - CANVAS.dbMin) / (CANVAS.dbMax - CANVAS.dbMin)));
  if (t < 0.25) {
    const s = t / 0.25;
    return `rgb(${Math.round(3 + s * 7)},${Math.round(10 + s * 32)},${Math.round(3 + s * 7)})`;
  } else if (t < 0.5) {
    const s = (t - 0.25) / 0.25;
    return `rgb(${Math.round(10 + s * 16)},${Math.round(42 + s * 54)},${Math.round(10 + s * 6)})`;
  } else if (t < 0.75) {
    const s = (t - 0.5) / 0.25;
    return `rgb(${Math.round(26 + s * 70)},${Math.round(96 + s * 96)},${Math.round(16 + s * 16)})`;
  } else {
    const s = (t - 0.75) / 0.25;
    return `rgb(${Math.round(96 + s * 104)},${Math.round(192 + s * 48)},${Math.round(32 + s * 32)})`;
  }
}

/** Spectro colour map: NGE thermal — void → indigo → teal → amber → white-gold.
 *  Silence = deep space black. Signal = light emerging from cold to hot. */
export function spectroColor(db: number): string {
  const dbMin = CANVAS.dbMin;
  const dbMax = CANVAS.dbMax;
  const t = Math.max(0, Math.min(1, (db - dbMin) / (dbMax - dbMin)));

  if (t < 0.25) {
    // void → deep indigo
    const s = t / 0.25;
    return `rgb(${Math.round(3 + s * 10)},${Math.round(4 + s * 16)},${Math.round(8 + s * 56)})`;
  } else if (t < 0.5) {
    // deep indigo → teal
    const s = (t - 0.25) / 0.25;
    return `rgb(${Math.round(13 - s * 3)},${Math.round(20 + s * 52)},${Math.round(64 + s * 32)})`;
  } else if (t < 0.75) {
    // teal → amber
    const s = (t - 0.5) / 0.25;
    return `rgb(${Math.round(10 + s * 150)},${Math.round(72 - s * 12)},${Math.round(96 - s * 84)})`;
  } else {
    // amber → white-gold
    const s = (t - 0.75) / 0.25;
    return `rgb(${Math.round(160 + s * 72)},${Math.round(60 + s * 128)},${Math.round(12 + s * 28)})`;
  }
}
