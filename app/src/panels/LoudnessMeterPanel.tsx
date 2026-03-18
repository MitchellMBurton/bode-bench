// ============================================================
// LoudnessMeterPanel — ITU-R BS.1770 / EBU R128 loudness.
// Scrolling momentary LUFS history (newest at right), matching
// the scroll rate of the spectrogram and RMS panels.
// Reference lines at −14/−16/−23/−24 LUFS.
// Integrated LUFS computed via two-pass EBU R128 gating.
// ============================================================

import { useEffect, useRef } from 'react';
import { useAudioEngine, useDisplayMode, useFrameBus, useScrollSpeed } from '../core/session';
import { COLORS, FONTS, SPACING, CANVAS } from '../theme';
import { shouldSkipFrame } from '../utils/rafGuard';

const PANEL_DPR_MAX = 1.25;
const HISTORY_MAX = 1200;
const BASE_PX_PER_FRAME = CANVAS.timelineScrollPx;
const MS_PER_DATA_FRAME = 1000 / 20;

// Y-axis display range — tighter than RMS panel so delivery-range content fills the strip
// RMS panel spans −54→0 dBFS (54 dB). LUFS spans −36→0 LU (36 LU), spreading
// the −14/−16/−23/−24 reference lines across most of the visible height.
const LUFS_TOP = 0;
const LUFS_BOT = -36;

// ── K-weighting biquad coefficients (ITU-R BS.1770-4 @ 48 kHz) ──────────────
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

// ── Measurement constants ─────────────────────────────────────────────────────
const LUFS_FLOOR = -60;
const MOMENTARY_FRAMES = 8;     // 400 ms at 20 fps
const SHORT_TERM_FRAMES = 60;   // 3 s at 20 fps
const TP_WARN_DB = -1.0;
const ABS_GATE_LUFS = -70;
const REL_GATE_LU = 10;
const MAX_STORED_FRAMES = 7200; // 6 min at 20 fps
const INT_RECOMPUTE_EVERY = 20; // once per second

// Reference lines: [lufs, label]
const REF_LINES: [number, string][] = [
  [-14, '-14 STREAM'],
  [-16, '-16 APPLE'],
  [-23, '-23 EBU'],
  [-24, '-24 CIN'],
];

// ── Biquad state ──────────────────────────────────────────────────────────────
interface BiquadState {
  px1: number; px2: number; py1: number; py2: number;
  rx1: number; rx2: number; ry1: number; ry2: number;
}

function makeBiquad(): BiquadState {
  return { px1: 0, px2: 0, py1: 0, py2: 0, rx1: 0, rx2: 0, ry1: 0, ry2: 0 };
}

function kWeightMs(samples: Float32Array, s: BiquadState): number {
  let sum = 0;
  let { px1, px2, py1, py2, rx1, rx2, ry1, ry2 } = s;
  for (let i = 0; i < samples.length; i++) {
    let x = samples[i];
    const y1 = PRE_B0 * x + PRE_B1 * px1 + PRE_B2 * px2 - PRE_A1 * py1 - PRE_A2 * py2;
    px2 = px1; px1 = x; py2 = py1; py1 = y1; x = y1;
    const y2 = RLB_B0 * x + RLB_B1 * rx1 + RLB_B2 * rx2 - RLB_A1 * ry1 - RLB_A2 * ry2;
    rx2 = rx1; rx1 = x; ry2 = ry1; ry1 = y2;
    sum += y2 * y2;
  }
  s.px1 = px1; s.px2 = px2; s.py1 = py1; s.py2 = py2;
  s.rx1 = rx1; s.rx2 = rx2; s.ry1 = ry1; s.ry2 = ry2;
  return samples.length > 0 ? sum / samples.length : 0;
}

function msToLufs(ms: number): number {
  return ms > 0 ? -0.691 + 10 * Math.log10(ms) : LUFS_FLOOR;
}

function lufsToY(lufs: number, H: number, padV: number): number {
  const t = (Math.max(LUFS_BOT, Math.min(LUFS_TOP, lufs)) - LUFS_TOP) / (LUFS_BOT - LUFS_TOP);
  return padV + (H - padV * 2) * t;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function LoudnessMeterPanel(): React.ReactElement {
  const frameBus = useFrameBus();
  const audioEngine = useAudioEngine();
  const displayMode = useDisplayMode();
  const scrollSpeed = useScrollSpeed();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);

  // K-weighting filter state
  const biquadL = useRef<BiquadState>(makeBiquad());
  const biquadR = useRef<BiquadState>(makeBiquad());

  // Short-term buffer for momentary/ST computation
  const kMsBuf = useRef<Float32Array>(new Float32Array(SHORT_TERM_FRAMES));
  const kMsPtr = useRef(0);
  const kMsLen = useRef(0);

  // Scrolling momentary LUFS history (circular buffer)
  const histBufRef = useRef(new Float64Array(HISTORY_MAX));
  const histPtrRef = useRef(0);
  const histLenRef = useRef(0);
  const lastDataTimeRef = useRef(0);

  // All frames for two-pass integrated gating
  const allMsRef = useRef<Float32Array>(new Float32Array(MAX_STORED_FRAMES));
  const allMsCountRef = useRef(0);
  const recomputeCounterRef = useRef(0);
  const intLufsCachedRef = useRef(LUFS_FLOOR);
  const intHasRef = useRef(false);

  // True Peak hold
  const tpHoldRef = useRef(LUFS_FLOOR);

  const lastFileIdRef = useRef(-1);

  // ── Two-pass EBU R128 integrated ─────────────────────────────────────────
  function recomputeIntegrated() {
    const ms = allMsRef.current;
    const n = allMsCountRef.current;
    if (n === 0) { intLufsCachedRef.current = LUFS_FLOOR; intHasRef.current = false; return; }
    let absSum = 0, absCnt = 0;
    for (let i = 0; i < n; i++) {
      if (msToLufs(ms[i]) > ABS_GATE_LUFS) { absSum += ms[i]; absCnt++; }
    }
    if (absCnt === 0) { intLufsCachedRef.current = LUFS_FLOOR; intHasRef.current = false; return; }
    const relThreshold = msToLufs(absSum / absCnt) - REL_GATE_LU;
    let relSum = 0, relCnt = 0;
    for (let i = 0; i < n; i++) {
      const l = msToLufs(ms[i]);
      if (l > ABS_GATE_LUFS && l > relThreshold) { relSum += ms[i]; relCnt++; }
    }
    if (relCnt === 0) { intLufsCachedRef.current = LUFS_FLOOR; intHasRef.current = false; return; }
    intLufsCachedRef.current = msToLufs(relSum / relCnt);
    intHasRef.current = true;
  }

  // ── Reset ─────────────────────────────────────────────────────────────────
  function resetState() {
    biquadL.current = makeBiquad();
    biquadR.current = makeBiquad();
    kMsBuf.current.fill(0);
    kMsPtr.current = 0;
    kMsLen.current = 0;
    histBufRef.current.fill(0);
    histPtrRef.current = 0;
    histLenRef.current = 0;
    allMsRef.current = new Float32Array(MAX_STORED_FRAMES);
    allMsCountRef.current = 0;
    recomputeCounterRef.current = 0;
    intLufsCachedRef.current = LUFS_FLOOR;
    intHasRef.current = false;
    tpHoldRef.current = LUFS_FLOOR;
    lastFileIdRef.current = -1;
    lastDataTimeRef.current = performance.now();
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

    // Momentary LUFS for scroll history
    let momMs = 0;
    const momN = Math.min(kMsLen.current, MOMENTARY_FRAMES);
    for (let i = 0; i < momN; i++) {
      momMs += kMsBuf.current[((kMsPtr.current - 1 - i) % SHORT_TERM_FRAMES + SHORT_TERM_FRAMES) % SHORT_TERM_FRAMES];
    }
    const momentaryLufs = momN > 0 ? msToLufs(momMs / momN) : LUFS_FLOOR;
    histBufRef.current[histPtrRef.current % HISTORY_MAX] = momentaryLufs;
    histPtrRef.current++;
    histLenRef.current = Math.min(histLenRef.current + 1, HISTORY_MAX);

    // Store for two-pass gating
    const idx = allMsCountRef.current;
    if (idx < MAX_STORED_FRAMES) {
      allMsRef.current[idx] = frameMs;
      allMsCountRef.current = idx + 1;
    }

    recomputeCounterRef.current++;
    if (recomputeCounterRef.current >= INT_RECOMPUTE_EVERY) {
      recomputeCounterRef.current = 0;
      recomputeIntegrated();
    }

    // True peak
    const peakLin = Math.max(frame.peakLeft, frame.peakRight);
    if (peakLin > 0) {
      const peakDb = 20 * Math.log10(peakLin);
      if (peakDb > tpHoldRef.current) tpHoldRef.current = peakDb;
    }

    lastDataTimeRef.current = performance.now();
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
      if (shouldSkipFrame(canvas)) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const W = canvas.width;
      const H = canvas.height;
      const dpr = Math.min(devicePixelRatio, PANEL_DPR_MAX);
      const nge = displayMode.nge;
      const hyper = displayMode.hyper;
      const optic = displayMode.optic;
      const eva = displayMode.eva;
      const padV = 6 * dpr;

      const traceColor = nge ? '#a0d840' : hyper ? CANVAS.hyper.trace : optic ? CANVAS.optic.trace : eva ? CANVAS.eva.trace : COLORS.waveform;
      const labelColor = nge ? 'rgba(140,210,40,0.5)' : hyper ? CANVAS.hyper.label : optic ? CANVAS.optic.label : eva ? CANVAS.eva.label : COLORS.textDim;
      const textColor = nge ? 'rgba(140,210,40,0.72)' : hyper ? CANVAS.hyper.text : optic ? CANVAS.optic.text : eva ? CANVAS.eva.text : COLORS.textSecondary;

      ctx.fillStyle = hyper ? CANVAS.hyper.bg2 : optic ? CANVAS.optic.bg2 : eva ? CANVAS.eva.bg : COLORS.bg1;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = hyper ? 'rgba(32,52,110,0.92)' : optic ? 'rgba(159,199,223,0.84)' : eva ? 'rgba(74,26,144,0.92)' : COLORS.border;
      ctx.fillRect(0, 0, W, 1);

      // ── Delivery zone bands (key visual differentiator from plain RMS) ───
      // Red band: above -14 LUFS (over all streaming targets)
      const yTop    = padV;
      const y14     = lufsToY(-14, H, padV);
      const y23     = lufsToY(-23, H, padV);
      const yBot    = H - padV;
      ctx.fillStyle = nge ? 'rgba(120,40,10,0.10)' : hyper ? 'rgba(180,40,40,0.10)' : optic ? 'rgba(228,124,103,0.12)' : eva ? 'rgba(160,20,20,0.12)' : 'rgba(100,18,18,0.14)';
      ctx.fillRect(0, yTop, W, y14 - yTop);
      // Green band: -14 to -23 LUFS (streaming–broadcast safe zone)
      ctx.fillStyle = nge ? 'rgba(40,100,10,0.10)' : hyper ? 'rgba(20,80,60,0.10)' : optic ? 'rgba(122,223,206,0.12)' : eva ? 'rgba(120,50,0,0.10)' : 'rgba(14,60,24,0.12)';
      ctx.fillRect(0, y14, W, y23 - y14);
      // Below -23: no tint (below all delivery targets, subdued)
      ctx.fillStyle = nge ? 'rgba(10,30,5,0.08)' : hyper ? 'rgba(8,12,30,0.08)' : optic ? 'rgba(214,228,237,0.38)' : eva ? 'rgba(8,4,26,0.10)' : 'rgba(8,10,16,0.10)';
      ctx.fillRect(0, y23, W, yBot - y23);

      // ── Reference lines ──────────────────────────────────────────────────
      ctx.setLineDash([3 * dpr, 4 * dpr]);
      for (const [lufs, label] of REF_LINES) {
        const y = Math.round(lufsToY(lufs, H, padV)) + 0.5;
        const isTarget = lufs === -14;
        ctx.strokeStyle = isTarget
          ? (hyper ? 'rgba(88,124,255,0.65)' : nge ? 'rgba(100,200,40,0.55)' : optic ? 'rgba(116,186,220,0.72)' : eva ? 'rgba(255,123,0,0.55)' : 'rgba(60,60,90,1)')
          : (hyper ? 'rgba(28,42,88,0.85)' : nge ? 'rgba(40,80,20,0.45)' : optic ? 'rgba(191,218,233,0.92)' : eva ? 'rgba(74,26,144,0.55)' : 'rgba(38,38,56,1)');
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        ctx.font = `${6.5 * dpr}px ${FONTS.mono}`;
        ctx.fillStyle = isTarget ? textColor : labelColor;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText(label, W - SPACING.xs * dpr, y - 1 * dpr);
      }
      ctx.setLineDash([]);

      // ── Scrolling momentary LUFS trace ───────────────────────────────────
      const pxPerFrame = BASE_PX_PER_FRAME * scrollSpeed.value * dpr;
      const elapsed = performance.now() - lastDataTimeRef.current;
      const subProg = Math.min(1, elapsed / MS_PER_DATA_FRAME);
      const subOffset = -subProg * pxPerFrame;
      const baseY = H - padV;
      const hBuf = histBufRef.current;
      const hLen = histLenRef.current;
      const hPtr = histPtrRef.current;

      if (hLen > 1) {
        const points: [number, number][] = [];
        for (let i = 0; i < hLen; i++) {
          const x = W - (hLen - 1 - i) * pxPerFrame + subOffset;
          if (x < -pxPerFrame || x > W + pxPerFrame) continue;
          const lufs = Math.max(LUFS_BOT, hBuf[(hPtr - hLen + i + HISTORY_MAX) % HISTORY_MAX]);
          points.push([Math.max(0, Math.min(W, x)), lufsToY(lufs, H, padV)]);
        }

        if (points.length > 1) {
          // Filled area — blue/indigo palette (accent family, distinct from amber RMS)
          ctx.beginPath();
          ctx.moveTo(points[0][0], baseY);
          for (const [x, y] of points) ctx.lineTo(x, y);
          ctx.lineTo(points[points.length - 1][0], baseY);
          ctx.closePath();
          const fillGrad = ctx.createLinearGradient(0, padV, 0, H);
          fillGrad.addColorStop(0, nge ? 'rgba(160,216,64,0.26)' : hyper ? 'rgba(98,232,255,0.26)' : optic ? 'rgba(21,151,212,0.16)' : eva ? 'rgba(255,123,0,0.26)' : 'rgba(100,120,210,0.28)');
          fillGrad.addColorStop(1, nge ? 'rgba(96,192,32,0.04)' : hyper ? 'rgba(255,92,188,0.06)' : optic ? 'rgba(210,173,244,0.06)' : eva ? 'rgba(170,90,255,0.06)' : 'rgba(70,90,170,0.04)');
          ctx.fillStyle = fillGrad;
          ctx.fill();

          // Trace line
          ctx.beginPath();
          ctx.moveTo(points[0][0], points[0][1]);
          for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
          ctx.strokeStyle = nge ? 'rgba(160,216,64,0.80)' : hyper ? 'rgba(98,232,255,0.86)' : optic ? 'rgba(21,151,212,0.82)' : eva ? 'rgba(255,123,0,0.86)' : 'rgba(130,152,228,0.88)';
          ctx.lineWidth = 1.5 * dpr;
          ctx.lineJoin = 'round';
          ctx.stroke();

          // Head dot
          const last = points[points.length - 1];
          ctx.beginPath();
          ctx.arc(last[0], last[1], 2.5 * dpr, 0, Math.PI * 2);
          ctx.fillStyle = nge ? traceColor : hyper ? traceColor : optic ? traceColor : 'rgba(150,170,240,1)';
          ctx.fill();
        }
      } else if (hLen === 0) {
        const y = Math.round(lufsToY(-30, H, padV)) + 0.5;
        ctx.strokeStyle = hyper ? 'rgba(24,34,70,1)' : optic ? 'rgba(202,222,234,0.92)' : eva ? 'rgba(22,12,48,1)' : COLORS.bg3;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }

      // ── Integrated LUFS hold line ────────────────────────────────────────
      const intLufs = intLufsCachedRef.current;
      const intHas = intHasRef.current;
      if (intHas && intLufs > LUFS_BOT) {
        const intY = Math.round(lufsToY(intLufs, H, padV)) + 0.5;
        const intLineColor = nge ? 'rgba(160,216,64,0.55)' : hyper ? 'rgba(98,232,255,0.55)' : optic ? 'rgba(21,151,212,0.55)' : eva ? 'rgba(255,123,0,0.55)' : 'rgba(130,152,228,0.60)';
        ctx.strokeStyle = intLineColor;
        ctx.lineWidth = 1.5 * dpr;
        ctx.setLineDash([8 * dpr, 3 * dpr]);
        ctx.beginPath(); ctx.moveTo(0, intY); ctx.lineTo(W, intY); ctx.stroke();
        ctx.setLineDash([]);
        // "INT" badge at left edge
        ctx.font = `${6 * dpr}px ${FONTS.mono}`;
        ctx.fillStyle = intLineColor;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText('INT', SPACING.xs * dpr, intY - 1 * dpr);
      }

      // ── Numeric readouts — top left ──────────────────────────────────────
      const curLufs = hLen > 0 ? hBuf[(hPtr - 1 + HISTORY_MAX) % HISTORY_MAX] : LUFS_FLOOR;
      const hasSignal = curLufs > LUFS_FLOOR + 4;

      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const textX = SPACING.sm * dpr;
      let textY = SPACING.xs * dpr;

      // Momentary value (live)
      if (hasSignal) {
        const momCol = curLufs > -6
          ? COLORS.statusErr
          : curLufs > -14
            ? (nge ? '#c0e860' : optic ? '#c99b4f' : eva ? '#ffa020' : 'rgba(220,190,60,0.95)')
            : textColor;
        ctx.font = `${10 * dpr}px ${FONTS.mono}`;
        ctx.fillStyle = momCol;
        ctx.fillText(`${curLufs.toFixed(1)} M`, textX, textY);
        textY += 13 * dpr;
      }

      // Integrated
      const intDisplayStr = !intHas
        ? '---.- INT'
        : `${intLufs < LUFS_BOT ? `<${LUFS_BOT}` : intLufs.toFixed(1)} INT`;
      ctx.font = `${8 * dpr}px ${FONTS.mono}`;
      ctx.fillStyle = intHas ? labelColor : 'rgba(80,80,80,0.4)';
      ctx.fillText(intDisplayStr, textX, textY);
      textY += 10 * dpr;

      // True Peak
      const truePeak = tpHoldRef.current;
      if (truePeak > LUFS_FLOOR + 6) {
        const tpCol = truePeak > TP_WARN_DB
          ? COLORS.statusErr
          : truePeak > -6
            ? (nge ? '#c0e860' : optic ? '#c99b4f' : eva ? '#ffa020' : 'rgba(220,190,60,0.9)')
            : labelColor;
        ctx.font = `${8 * dpr}px ${FONTS.mono}`;
        ctx.fillStyle = tpCol;
        ctx.fillText(`${truePeak.toFixed(1)} TP`, textX, textY);
      }

      // Panel label
      ctx.font = `${7 * dpr}px ${FONTS.mono}`;
      ctx.fillStyle = labelColor;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('LUFS', SPACING.sm * dpr, H - SPACING.xs * dpr);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [displayMode, scrollSpeed]);

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
