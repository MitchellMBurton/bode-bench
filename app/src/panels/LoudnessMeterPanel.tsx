// ============================================================
// LoudnessMeterPanel — ITU-R BS.1770 / EBU R128 loudness.
// Momentary (400ms), Short-term (3s), Integrated LUFS, True Peak.
// K-weighting two-stage biquad filter; coefficients for 48 kHz
// (error < 0.2 dB at 44.1 kHz — acceptable for an analysis tool).
// ============================================================

import { useEffect, useRef } from 'react';
import { useAudioEngine, useDisplayMode, useFrameBus } from '../core/session';
import { COLORS, FONTS, SPACING, CANVAS } from '../theme';
import { shouldSkipFrame } from '../utils/rafGuard';
import type { AudioFrame } from '../types';

const PANEL_DPR_MAX = 1.5;

// ── K-weighting biquad coefficients (ITU-R BS.1770-4 @ 48 kHz) ──────────────
// Stage 1: high-shelf pre-filter (~1682 Hz, +4 dB)
const PRE_B0 = 1.53512485958697;
const PRE_B1 = -2.69169618940638;
const PRE_B2 = 1.19839281085285;
const PRE_A1 = -1.69065929318241;
const PRE_A2 = 0.73248077421585;
// Stage 2: RLB high-pass (~38 Hz)
const RLB_B0 = 1.0;
const RLB_B1 = -2.0;
const RLB_B2 = 1.0;
const RLB_A1 = -1.99004745483398;
const RLB_A2 = 0.99007225036603;

// ── Measurement constants ─────────────────────────────────────────────────────
const LUFS_FLOOR = -60;
const MOMENTARY_FRAMES = 8;     // 400 ms at 20 fps
const SHORT_TERM_FRAMES = 60;   // 3 s at 20 fps
const TP_WARN_DB = -1.0;        // True-Peak warning threshold (dBTP)
const ABS_GATE_LUFS = -70;      // EBU R128 absolute gate
const REL_GATE_LU = 10;         // EBU R128 relative gate offset (LU below preliminary)
const MAX_STORED_FRAMES = 7200; // 6 min at 20 fps — for two-pass integrated gating
const INT_RECOMPUTE_EVERY = 20; // recompute gated integrated once per second

// Streaming delivery reference lines: [lufs, short label, long label]
const REF_LINES: [number, string, string][] = [
  [-14, '-14', 'STREAM'],
  [-16, '-16', 'APPLE'],
  [-23, '-23', 'EBU R128'],
  [-24, '-24', 'CINEMA'],
];

// ── Biquad state ──────────────────────────────────────────────────────────────
interface BiquadState {
  px1: number; px2: number; py1: number; py2: number; // pre-filter
  rx1: number; rx2: number; ry1: number; ry2: number; // RLB
}

function makeBiquad(): BiquadState {
  return { px1: 0, px2: 0, py1: 0, py2: 0, rx1: 0, rx2: 0, ry1: 0, ry2: 0 };
}

/** Apply K-weighting to samples, return mean square. Mutates state. */
function kWeightMs(samples: Float32Array, s: BiquadState): number {
  let sum = 0;
  let { px1, px2, py1, py2, rx1, rx2, ry1, ry2 } = s;
  for (let i = 0; i < samples.length; i++) {
    let x = samples[i];
    // Stage 1
    const y1 = PRE_B0 * x + PRE_B1 * px1 + PRE_B2 * px2 - PRE_A1 * py1 - PRE_A2 * py2;
    px2 = px1; px1 = x; py2 = py1; py1 = y1; x = y1;
    // Stage 2
    const y2 = RLB_B0 * x + RLB_B1 * rx1 + RLB_B2 * rx2 - RLB_A1 * ry1 - RLB_A2 * ry2;
    rx2 = rx1; rx1 = x; ry2 = ry1; ry1 = y2;
    sum += y2 * y2;
  }
  s.px1 = px1; s.px2 = px2; s.py1 = py1; s.py2 = py2;
  s.rx1 = rx1; s.rx2 = rx2; s.ry1 = ry1; s.ry2 = ry2;
  return samples.length > 0 ? sum / samples.length : 0;
}

/** Mean square → LUFS (BS.1770 formula: −0.691 + 10·log10(ms)) */
function msToLufs(ms: number): number {
  return ms > 0 ? -0.691 + 10 * Math.log10(ms) : LUFS_FLOOR;
}

/** LUFS value → Y pixel inside bar (0 = top/loudest, barH = floor/silent) */
function lufsToY(lufs: number, barH: number): number {
  const t = Math.max(0, Math.min(1, (lufs - 0) / (LUFS_FLOOR - 0)));
  return t * barH;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function LoudnessMeterPanel(): React.ReactElement {
  const frameBus = useFrameBus();
  const audioEngine = useAudioEngine();
  const displayMode = useDisplayMode();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);

  // K-weighting filter state (persists between frames for IIR continuity)
  const biquadL = useRef<BiquadState>(makeBiquad());
  const biquadR = useRef<BiquadState>(makeBiquad());

  // Circular buffer of K-weighted mean-square per analysis frame
  const kMsBuf = useRef<Float32Array>(new Float32Array(SHORT_TERM_FRAMES));
  const kMsPtr = useRef(0);  // next write position
  const kMsLen = useRef(0);  // valid entries (0–SHORT_TERM_FRAMES)

  // All K-weighted mean-squares — stored for two-pass EBU R128 gating
  const allMsRef = useRef<Float32Array>(new Float32Array(MAX_STORED_FRAMES));
  const allMsCountRef = useRef(0);
  const recomputeCounterRef = useRef(0);

  // Cached gated integrated LUFS (updated once per second via two-pass gate)
  const intLufsCachedRef = useRef(LUFS_FLOOR);
  const intHasRef = useRef(false); // true once we have ≥ 1s of above-gate material

  // True Peak hold
  const tpHoldRef = useRef(LUFS_FLOOR);

  const lastFileIdRef = useRef(-1);
  const currentRef = useRef<AudioFrame | null>(null);

  // ── Two-pass EBU R128 integrated loudness ─────────────────────────────────
  function recomputeIntegrated() {
    const ms = allMsRef.current;
    const n = allMsCountRef.current;
    if (n === 0) { intLufsCachedRef.current = LUFS_FLOOR; intHasRef.current = false; return; }

    // Pass 1: absolute gate − sum frames > −70 LUFS
    let absSum = 0, absCnt = 0;
    for (let i = 0; i < n; i++) {
      if (msToLufs(ms[i]) > ABS_GATE_LUFS) { absSum += ms[i]; absCnt++; }
    }
    if (absCnt === 0) { intLufsCachedRef.current = LUFS_FLOOR; intHasRef.current = false; return; }

    // Preliminary integrated LUFS from absolute-gated frames
    const prelimLufs = msToLufs(absSum / absCnt);
    const relThreshold = prelimLufs - REL_GATE_LU;

    // Pass 2: relative gate − frames also > (preliminary − 10 LU)
    let relSum = 0, relCnt = 0;
    for (let i = 0; i < n; i++) {
      const l = msToLufs(ms[i]);
      if (l > ABS_GATE_LUFS && l > relThreshold) { relSum += ms[i]; relCnt++; }
    }
    if (relCnt === 0) { intLufsCachedRef.current = LUFS_FLOOR; intHasRef.current = false; return; }

    intLufsCachedRef.current = msToLufs(relSum / relCnt);
    intHasRef.current = true;
  }

  // ── Reset helper ─────────────────────────────────────────────────────────
  function resetState() {
    biquadL.current = makeBiquad();
    biquadR.current = makeBiquad();
    kMsBuf.current.fill(0);
    kMsPtr.current = 0;
    kMsLen.current = 0;
    allMsRef.current = new Float32Array(MAX_STORED_FRAMES);
    allMsCountRef.current = 0;
    recomputeCounterRef.current = 0;
    intLufsCachedRef.current = LUFS_FLOOR;
    intHasRef.current = false;
    tpHoldRef.current = LUFS_FLOOR;
    currentRef.current = null;
    lastFileIdRef.current = -1;
  }

  // ── Frame subscription ────────────────────────────────────────────────────
  useEffect(() => frameBus.subscribe((frame) => {
    if (frame.fileId !== lastFileIdRef.current) {
      lastFileIdRef.current = frame.fileId;
      resetState();
      lastFileIdRef.current = frame.fileId;
    }

    const msL = kWeightMs(frame.timeDomain, biquadL.current);
    const msR = kWeightMs(frame.timeDomainRight, biquadR.current);
    const frameMs = (msL + msR) * 0.5;

    // Short-term circular buffer
    const ptr = kMsPtr.current % SHORT_TERM_FRAMES;
    kMsBuf.current[ptr] = frameMs;
    kMsPtr.current++;
    kMsLen.current = Math.min(kMsLen.current + 1, SHORT_TERM_FRAMES);

    // Store for two-pass integrated gating (cap at MAX_STORED_FRAMES)
    const idx = allMsCountRef.current;
    if (idx < MAX_STORED_FRAMES) {
      allMsRef.current[idx] = frameMs;
      allMsCountRef.current = idx + 1;
    }

    // Recompute integrated loudness once per second
    recomputeCounterRef.current++;
    if (recomputeCounterRef.current >= INT_RECOMPUTE_EVERY) {
      recomputeCounterRef.current = 0;
      recomputeIntegrated();
    }

    // True peak from per-frame peak amplitude
    const peakLin = Math.max(frame.peakLeft, frame.peakRight);
    if (peakLin > 0) {
      const peakDb = 20 * Math.log10(peakLin);
      if (peakDb > tpHoldRef.current) tpHoldRef.current = peakDb;
    }

    currentRef.current = frame;
  }), [frameBus]);

  useEffect(() => audioEngine.onReset(resetState), [audioEngine]);

  // ── Resize observer ───────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const dpr = Math.min(devicePixelRatio, PANEL_DPR_MAX);
        canvas.width = Math.round(e.contentRect.width * dpr);
        canvas.height = Math.round(e.contentRect.height * dpr);
      }
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  // ── RAF draw loop ─────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      if (shouldSkipFrame()) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const W = canvas.width;
      const H = canvas.height;
      const dpr = Math.min(devicePixelRatio, PANEL_DPR_MAX);
      const nge = displayMode.nge;
      const hyper = displayMode.hyper;

      const traceColor = nge ? '#a0d840' : hyper ? CANVAS.hyper.trace : COLORS.waveform;
      const labelColor = nge ? 'rgba(140,210,40,0.5)' : hyper ? CANVAS.hyper.label : COLORS.textDim;
      const textColor = nge ? 'rgba(140,210,40,0.72)' : hyper ? CANVAS.hyper.text : COLORS.textSecondary;

      ctx.fillStyle = hyper ? CANVAS.hyper.bg2 : COLORS.bg1;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = hyper ? 'rgba(32,52,110,0.92)' : COLORS.border;
      ctx.fillRect(0, 0, W, 1);

      // ── Compute current LUFS ────────────────────────────────────────────
      const buf = kMsBuf.current;
      const ptr = kMsPtr.current;
      const len = kMsLen.current;

      let momMs = 0;
      const momN = Math.min(len, MOMENTARY_FRAMES);
      for (let i = 0; i < momN; i++) {
        momMs += buf[((ptr - 1 - i) % SHORT_TERM_FRAMES + SHORT_TERM_FRAMES) % SHORT_TERM_FRAMES];
      }
      const momentaryLufs = momN > 0 ? msToLufs(momMs / momN) : LUFS_FLOOR;

      let stMs = 0;
      const stN = Math.min(len, SHORT_TERM_FRAMES);
      for (let i = 0; i < stN; i++) {
        stMs += buf[((ptr - 1 - i) % SHORT_TERM_FRAMES + SHORT_TERM_FRAMES) % SHORT_TERM_FRAMES];
      }
      const shortTermLufs = stN > 0 ? msToLufs(stMs / stN) : LUFS_FLOOR;
      const intLufs = intLufsCachedRef.current;
      const intHas = intHasRef.current;
      const truePeak = tpHoldRef.current;
      const hasSignal = len > 0 && momentaryLufs > LUFS_FLOOR + 6;

      // ── Layout ──────────────────────────────────────────────────────────
      // Left column: big readout numbers
      // Right section: vertical scale bar with reference lines
      const readoutW = 52 * dpr;
      const padT = 6 * dpr;
      const padB = 14 * dpr;
      const padR = 4 * dpr;
      const barX = readoutW;
      const barW = W - barX - padR;
      const barH = H - padT - padB;

      if (barW <= 4 || barH <= 4) return;

      // ── Reference lines ─────────────────────────────────────────────────
      // Only draw long labels when the bar is wide enough to fit them legibly
      const showLongLabels = barW > 120 * dpr;
      ctx.setLineDash([3 * dpr, 4 * dpr]);
      for (const [lufs, shortLabel, longLabel] of REF_LINES) {
        const y = Math.round(padT + lufsToY(lufs, barH)) + 0.5;
        const isMain = lufs === -14;
        ctx.strokeStyle = isMain
          ? (hyper ? 'rgba(88,124,255,0.72)' : nge ? 'rgba(100,200,40,0.6)' : 'rgba(50,50,72,1)')
          : (hyper ? 'rgba(28,42,88,0.92)' : nge ? 'rgba(40,80,20,0.5)' : 'rgba(32,32,48,1)');
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(barX, y); ctx.lineTo(W - padR, y); ctx.stroke();

        ctx.font = `${6 * dpr}px ${FONTS.mono}`;
        ctx.fillStyle = isMain ? textColor : labelColor;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(shortLabel, barX + 2 * dpr, y - 1 * dpr);
        if (showLongLabels) {
          ctx.textAlign = 'right';
          ctx.fillText(longLabel, W - padR, y - 1 * dpr);
        }
      }
      ctx.setLineDash([]);

      // ── Momentary bar fill ───────────────────────────────────────────────
      if (hasSignal && momentaryLufs > LUFS_FLOOR) {
        const momY = padT + lufsToY(momentaryLufs, barH);
        const fillH = padT + barH - momY;
        if (fillH > 0) {
          const fillGrad = ctx.createLinearGradient(0, padT, 0, padT + barH);
          fillGrad.addColorStop(0, nge ? 'rgba(160,216,64,0.06)' : hyper ? 'rgba(98,232,255,0.06)' : 'rgba(200,146,42,0.06)');
          fillGrad.addColorStop(1, nge ? 'rgba(96,192,32,0.20)' : hyper ? 'rgba(98,232,255,0.20)' : 'rgba(200,146,42,0.20)');
          ctx.fillStyle = fillGrad;
          ctx.fillRect(barX, momY, barW, fillH);
        }

        // Momentary level line
        const momLineColor = momentaryLufs > -6
          ? COLORS.statusErr
          : momentaryLufs > -14
            ? (nge ? '#c0e860' : hyper ? 'rgba(255,220,80,0.9)' : 'rgba(220,190,60,0.9)')
            : traceColor;
        ctx.strokeStyle = momLineColor;
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath();
        ctx.moveTo(barX, Math.round(momY) + 0.5);
        ctx.lineTo(W - padR, Math.round(momY) + 0.5);
        ctx.stroke();

        // Short-term marker: small tick on right edge
        if (stN >= MOMENTARY_FRAMES) {
          const stY = Math.round(padT + lufsToY(shortTermLufs, barH)) + 0.5;
          ctx.strokeStyle = nge ? 'rgba(160,216,64,0.45)' : hyper ? 'rgba(98,232,255,0.45)' : 'rgba(200,175,100,0.45)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(W - padR - 7 * dpr, stY);
          ctx.lineTo(W - padR, stY);
          ctx.stroke();
        }
      }

      // ── True Peak pip (right edge) ───────────────────────────────────────
      if (truePeak > LUFS_FLOOR + 6) {
        const tpClamp = Math.max(LUFS_FLOOR, Math.min(0, truePeak));
        const tpY = padT + lufsToY(tpClamp, barH);
        const tpColor = truePeak > TP_WARN_DB
          ? COLORS.statusErr
          : truePeak > -6
            ? (nge ? '#c0e860' : 'rgba(220,190,60,0.9)')
            : traceColor;
        ctx.fillStyle = tpColor;
        ctx.fillRect(W - padR, tpY - 2 * dpr, 3 * dpr, 4 * dpr);
      }

      // ── Left-column numeric readouts ─────────────────────────────────────
      const rx = readoutW - 4 * dpr;
      ctx.textAlign = 'right';

      // Momentary value — floats to match bar position
      if (hasSignal) {
        const momNumY = padT + lufsToY(momentaryLufs, barH);
        const clampedNumY = Math.max(padT + 6 * dpr, Math.min(padT + barH - 6 * dpr, momNumY));
        const momCol = momentaryLufs > -6
          ? COLORS.statusErr
          : momentaryLufs > -14
            ? (nge ? '#c0e860' : 'rgba(220,190,60,0.9)')
            : textColor;
        ctx.font = `${10 * dpr}px ${FONTS.mono}`;
        ctx.fillStyle = momCol;
        ctx.textBaseline = 'middle';
        ctx.fillText(`${momentaryLufs.toFixed(1)}`, rx, clampedNumY);
      }

      // Integrated + Short-term + TP labels — stacked at top-left
      const topLx = SPACING.xs * dpr;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      let topY = padT;

      ctx.font = `${7.5 * dpr}px ${FONTS.mono}`;

      // INT — clamp display to LUFS_FLOOR, show '< −60' for values that would go below
      const intDisplayStr = !intHas
        ? '---.-'
        : intLufs < LUFS_FLOOR
          ? `<${LUFS_FLOOR}`
          : intLufs.toFixed(1);
      ctx.fillStyle = intHas ? textColor : labelColor;
      ctx.fillText(`INT ${intDisplayStr}`, topLx, topY);
      topY += 11 * dpr;

      // ST
      const stHas = stN >= MOMENTARY_FRAMES;
      ctx.fillStyle = stHas ? labelColor : 'rgba(80,80,80,0.4)';
      ctx.fillText(`ST  ${stHas ? shortTermLufs.toFixed(1) : '---.-'}`, topLx, topY);
      topY += 10 * dpr;

      // TP
      if (truePeak > LUFS_FLOOR + 6) {
        const tpCol = truePeak > TP_WARN_DB
          ? COLORS.statusErr
          : truePeak > -6
            ? (nge ? '#c0e860' : 'rgba(220,190,60,0.9)')
            : labelColor;
        ctx.fillStyle = tpCol;
        ctx.fillText(`TP  ${truePeak.toFixed(1)}`, topLx, topY);
      }

      // Panel label
      ctx.font = `${7 * dpr}px ${FONTS.mono}`;
      ctx.fillStyle = labelColor;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('LUFS  EBU R128', SPACING.sm * dpr, H - SPACING.xs * dpr);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [displayMode]);

  return (
    <div style={panelStyle}>
      <canvas ref={canvasRef} style={canvasStyle} />
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  height: '100%',
  background: COLORS.bg1,
  overflow: 'hidden',
};

const canvasStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  height: '100%',
};
