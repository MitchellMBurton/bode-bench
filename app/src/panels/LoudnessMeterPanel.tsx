// ============================================================
// LoudnessMeterPanel - shared LUFS / integrated / true peak
// history. Uses the session-scoped Spectral Anatomy store so
// fullscreen and normal panels stay aligned.
// ============================================================

import { useCallback, useEffect, useRef } from 'react';
import { useAnalysisConfig, useDisplayMode, useSpectralAnatomyStore, useTheaterMode } from '../core/session';
import { COLORS, FONTS, SPACING, CANVAS } from '../theme';
import { shouldSkipFrame } from '../utils/rafGuard';
import { useMeasurementCursor, type CursorMapFn } from './useMeasurementCursor';
import type { LoudnessTargetPreset } from '../types';

const PANEL_DPR_MAX = 1.25;
const BASE_PX_PER_FRAME = CANVAS.timelineScrollPx;
const MS_PER_DATA_FRAME = 1000 / 20;
const LUFS_TOP = 0;
const LUFS_BOT = -36;
const LUFS_FLOOR = -60;
const TP_WARN_DB = -1.0;

const REF_LINES: [number, string][] = [
  [-14, '-14 STREAM'],
  [-16, '-16 APPLE'],
  [-23, '-23 EBU'],
  [-24, '-24 CIN'],
];
const TARGET_LINE_BY_PRESET: Record<LoudnessTargetPreset, readonly [number, string]> = {
  stream: REF_LINES[0],
  apple: REF_LINES[1],
  ebu: REF_LINES[2],
  cinema: REF_LINES[3],
};

function lufsToY(lufs: number, H: number, padV: number): number {
  const t = (Math.max(LUFS_BOT, Math.min(LUFS_TOP, lufs)) - LUFS_TOP) / (LUFS_BOT - LUFS_TOP);
  return padV + (H - padV * 2) * t;
}

export function LoudnessMeterPanel(): React.ReactElement {
  const analysisConfig = useAnalysisConfig();
  const displayMode = useDisplayMode();
  const spectralAnatomy = useSpectralAnatomyStore();
  const theaterMode = useTheaterMode();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const hoverReadoutRef = useRef<HTMLDivElement>(null);
  const drawDimRef = useRef({ H: 0, padV: 0 });

  const mapToValues: CursorMapFn = useCallback((devX: number, devY: number) => {
    const { H, padV } = drawDimRef.current;
    if (H === 0) return null;
    if (devY < padV || devY > H - padV) return null;
    const t = (devY - padV) / (H - padV * 2);
    const lufs = LUFS_TOP + t * (LUFS_BOT - LUFS_TOP);
    return {
      devX,
      devY,
      primary: lufs,
      primaryLabel: `${lufs.toFixed(1)} LUFS`,
      secondary: 0,
      secondaryLabel: '',
    };
  }, []);

  const { overlayRef, handleMouseMove, handleMouseLeave, handleClick } = useMeasurementCursor({
    canvasRef,
    readoutRef: hoverReadoutRef,
    mapToValues,
    visualMode: displayMode.mode,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const dpr = Math.min(devicePixelRatio, PANEL_DPR_MAX);
        canvas.width = Math.round(entry.contentRect.width * dpr);
        canvas.height = Math.round(entry.contentRect.height * dpr);
      }
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || theaterMode) return;

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      if (shouldSkipFrame(canvas)) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const W = canvas.width;
      const H = canvas.height;
      const dpr = Math.min(devicePixelRatio, PANEL_DPR_MAX);
      const nge = displayMode.mode === 'nge';
      const amber = displayMode.mode === 'amber';
      const hyper = displayMode.mode === 'hyper';
      const optic = displayMode.mode === 'optic';
      const red = displayMode.mode === 'red';
      const eva = displayMode.mode === 'eva';
      const padV = 6 * dpr;
      drawDimRef.current = { H, padV };

      const traceColor = nge ? '#a0d840' : amber ? CANVAS.amber.trace : hyper ? CANVAS.hyper.trace : optic ? CANVAS.optic.trace : red ? CANVAS.red.trace : eva ? CANVAS.eva.trace : COLORS.waveform;
      const labelColor = nge ? 'rgba(140,210,40,0.5)' : amber ? CANVAS.amber.label : hyper ? CANVAS.hyper.label : optic ? CANVAS.optic.label : red ? CANVAS.red.label : eva ? CANVAS.eva.label : COLORS.textDim;
      const textColor = nge ? 'rgba(140,210,40,0.72)' : amber ? CANVAS.amber.text : hyper ? CANVAS.hyper.text : optic ? CANVAS.optic.text : red ? CANVAS.red.text : eva ? CANVAS.eva.text : COLORS.textSecondary;
      const targetLine = TARGET_LINE_BY_PRESET[analysisConfig.loudness.targetPreset];
      const referenceLines = analysisConfig.loudness.referenceMode === 'target-only' ? [targetLine] : REF_LINES;

      ctx.fillStyle = amber ? CANVAS.amber.bg2 : hyper ? CANVAS.hyper.bg2 : optic ? CANVAS.optic.bg2 : red ? CANVAS.red.bg2 : eva ? CANVAS.eva.bg : COLORS.bg1;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = amber ? 'rgba(160,112,26,0.84)' : hyper ? 'rgba(32,52,110,0.92)' : optic ? 'rgba(159,199,223,0.84)' : red ? 'rgba(124,40,39,0.84)' : eva ? 'rgba(74,26,144,0.92)' : COLORS.border;
      ctx.fillRect(0, 0, W, 1);

      const yTop = padV;
      const y14 = lufsToY(-14, H, padV);
      const y23 = lufsToY(-23, H, padV);
      const yBot = H - padV;
      ctx.fillStyle = nge ? 'rgba(120,40,10,0.10)' : hyper ? 'rgba(180,40,40,0.10)' : optic ? 'rgba(228,124,103,0.12)' : red ? 'rgba(140,18,18,0.16)' : eva ? 'rgba(160,20,20,0.12)' : 'rgba(100,18,18,0.14)';
      ctx.fillRect(0, yTop, W, y14 - yTop);
      ctx.fillStyle = nge ? 'rgba(40,100,10,0.10)' : hyper ? 'rgba(20,80,60,0.10)' : optic ? 'rgba(122,223,206,0.12)' : red ? 'rgba(112,40,16,0.12)' : eva ? 'rgba(120,50,0,0.10)' : 'rgba(14,60,24,0.12)';
      ctx.fillRect(0, y14, W, y23 - y14);
      ctx.fillStyle = nge ? 'rgba(10,30,5,0.08)' : hyper ? 'rgba(8,12,30,0.08)' : optic ? 'rgba(214,228,237,0.38)' : red ? 'rgba(20,4,4,0.12)' : eva ? 'rgba(8,4,26,0.10)' : 'rgba(8,10,16,0.10)';
      ctx.fillRect(0, y23, W, yBot - y23);

      ctx.setLineDash([3 * dpr, 4 * dpr]);
      for (const [lufs, label] of referenceLines) {
        const y = Math.round(lufsToY(lufs, H, padV)) + 0.5;
        const isTarget = lufs === targetLine[0];
        ctx.strokeStyle = isTarget
          ? (hyper ? 'rgba(88,124,255,0.65)' : nge ? 'rgba(100,200,40,0.55)' : optic ? 'rgba(116,186,220,0.72)' : red ? 'rgba(255,132,116,0.64)' : eva ? 'rgba(255,123,0,0.55)' : 'rgba(60,60,90,1)')
          : (hyper ? 'rgba(28,42,88,0.85)' : nge ? 'rgba(40,80,20,0.45)' : optic ? 'rgba(191,218,233,0.92)' : red ? 'rgba(64,16,18,0.85)' : eva ? 'rgba(74,26,144,0.55)' : 'rgba(38,38,56,1)');
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
        ctx.font = `${6.5 * dpr}px ${FONTS.mono}`;
        ctx.fillStyle = isTarget ? textColor : labelColor;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText(label, W - SPACING.xs * dpr, y - 1 * dpr);
      }
      ctx.setLineDash([]);

      const latestAdvanceDev = Math.max(1, Math.max(BASE_PX_PER_FRAME, spectralAnatomy.latestAdvanceCssPx) * dpr);
      const elapsed = performance.now() - spectralAnatomy.latestFrameAtMs;
      const subProg = Math.min(1, elapsed / MS_PER_DATA_FRAME);
      const subOffset = -subProg * latestAdvanceDev;
      const baseY = H - padV;

      const lufsHistory = spectralAnatomy.loudnessHistory;
      const advanceHistory = spectralAnatomy.advanceHistory;
      const historyLen = spectralAnatomy.len;
      const historyPtr = spectralAnatomy.ptr;
      const capacity = lufsHistory.length;

      if (historyLen > 1) {
        const reversedPoints: [number, number][] = [];
        let offsetDev = 0;

        for (let step = 0; step < historyLen; step++) {
          const index = (historyPtr - 1 - step + capacity) % capacity;
          const x = W - offsetDev + subOffset;
          if (x < -latestAdvanceDev) break;
          const lufs = Math.max(LUFS_BOT, lufsHistory[index]);
          reversedPoints.push([Math.max(0, Math.min(W, x)), lufsToY(lufs, H, padV)]);
          offsetDev += Math.max(0, advanceHistory[index]) * dpr;
        }

        const points = reversedPoints.reverse();
        if (points.length > 1) {
          ctx.beginPath();
          ctx.moveTo(points[0][0], baseY);
          for (const [x, y] of points) ctx.lineTo(x, y);
          ctx.lineTo(points[points.length - 1][0], baseY);
          ctx.closePath();
          const fillGrad = ctx.createLinearGradient(0, padV, 0, H);
          fillGrad.addColorStop(0, nge ? 'rgba(160,216,64,0.26)' : hyper ? 'rgba(98,232,255,0.26)' : optic ? 'rgba(21,151,212,0.16)' : red ? 'rgba(255,90,74,0.20)' : eva ? 'rgba(255,123,0,0.26)' : 'rgba(100,120,210,0.28)');
          fillGrad.addColorStop(1, nge ? 'rgba(96,192,32,0.04)' : hyper ? 'rgba(255,92,188,0.06)' : optic ? 'rgba(210,173,244,0.06)' : red ? 'rgba(140,42,38,0.06)' : eva ? 'rgba(170,90,255,0.06)' : 'rgba(70,90,170,0.04)');
          ctx.fillStyle = fillGrad;
          ctx.fill();

          ctx.beginPath();
          ctx.moveTo(points[0][0], points[0][1]);
          for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
          ctx.strokeStyle = nge ? 'rgba(160,216,64,0.80)' : hyper ? 'rgba(98,232,255,0.86)' : optic ? 'rgba(21,151,212,0.82)' : red ? 'rgba(255,110,92,0.86)' : eva ? 'rgba(255,123,0,0.86)' : 'rgba(130,152,228,0.88)';
          ctx.lineWidth = 1.5 * dpr;
          ctx.lineJoin = 'round';
          ctx.stroke();

          const last = points[points.length - 1];
          ctx.beginPath();
          ctx.arc(last[0], last[1], 2.5 * dpr, 0, Math.PI * 2);
          ctx.fillStyle = nge ? traceColor : hyper ? traceColor : optic ? traceColor : red ? traceColor : 'rgba(150,170,240,1)';
          ctx.fill();
        }
      } else if (historyLen === 0) {
        const y = Math.round(lufsToY(-30, H, padV)) + 0.5;
        ctx.strokeStyle = hyper ? 'rgba(24,34,70,1)' : optic ? 'rgba(202,222,234,0.92)' : red ? 'rgba(34,10,11,0.92)' : eva ? 'rgba(22,12,48,1)' : COLORS.bg3;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }

      const currentLufs = historyLen > 0 ? lufsHistory[(historyPtr - 1 + capacity) % capacity] : LUFS_FLOOR;
      const hasSignal = currentLufs > LUFS_FLOOR + 4;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const textX = SPACING.sm * dpr;
      let textY = SPACING.xs * dpr;

      if (hasSignal) {
        const momentaryColor = currentLufs > -6
          ? COLORS.statusErr
          : currentLufs > -14
            ? (nge ? '#c0e860' : optic ? '#c99b4f' : red ? '#ffb067' : eva ? '#ffa020' : 'rgba(220,190,60,0.95)')
            : textColor;
        ctx.font = `${10 * dpr}px ${FONTS.mono}`;
        ctx.fillStyle = momentaryColor;
        ctx.fillText(`${currentLufs.toFixed(1)} M`, textX, textY);
        textY += 13 * dpr;
      }

      const integratedLufs = spectralAnatomy.integratedValueLufs;
      const hasIntegrated = spectralAnatomy.hasIntegratedValue;
      const integratedDisplay = !hasIntegrated
        ? '---.- INT'
        : `${integratedLufs < LUFS_BOT ? `<${LUFS_BOT}` : integratedLufs.toFixed(1)} INT`;
      ctx.font = `${8 * dpr}px ${FONTS.mono}`;
      ctx.fillStyle = hasIntegrated ? labelColor : 'rgba(80,80,80,0.4)';
      ctx.fillText(integratedDisplay, textX, textY);
      textY += 10 * dpr;

      const truePeak = spectralAnatomy.truePeakHoldDb;
      if (truePeak > LUFS_FLOOR + 6) {
        const truePeakColor = truePeak > TP_WARN_DB
          ? COLORS.statusErr
          : truePeak > -6
            ? (nge ? '#c0e860' : optic ? '#c99b4f' : red ? '#ffb067' : eva ? '#ffa020' : 'rgba(220,190,60,0.9)')
            : labelColor;
        ctx.font = `${8 * dpr}px ${FONTS.mono}`;
        ctx.fillStyle = truePeakColor;
        ctx.fillText(`${truePeak.toFixed(1)} TP`, textX, textY);
      }

      if (hasIntegrated && integratedLufs > LUFS_BOT) {
        const integratedY = Math.round(lufsToY(integratedLufs, H, padV)) + 0.5;
        const integratedLineColor = nge ? 'rgba(160,216,64,0.55)' : hyper ? 'rgba(98,232,255,0.55)' : optic ? 'rgba(21,151,212,0.55)' : red ? 'rgba(255,110,92,0.58)' : eva ? 'rgba(255,123,0,0.55)' : 'rgba(130,152,228,0.60)';
        ctx.strokeStyle = integratedLineColor;
        ctx.lineWidth = 1.5 * dpr;
        ctx.setLineDash([8 * dpr, 3 * dpr]);
        ctx.beginPath();
        ctx.moveTo(0, integratedY);
        ctx.lineTo(W, integratedY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = `${6 * dpr}px ${FONTS.mono}`;
        ctx.fillStyle = integratedLineColor;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText('INT', SPACING.xs * dpr, integratedY - 1 * dpr);
      }

      ctx.font = `${7 * dpr}px ${FONTS.mono}`;
      ctx.fillStyle = labelColor;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('LUFS', SPACING.sm * dpr, H - SPACING.xs * dpr);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [
    analysisConfig.loudness.referenceMode,
    analysisConfig.loudness.targetPreset,
    displayMode,
    spectralAnatomy,
    theaterMode,
  ]);

  return (
    <div style={panelStyle}>
      <canvas
        ref={canvasRef}
        style={canvasStyle}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      />
      <canvas ref={overlayRef} className="panel-cursor-overlay" style={overlayStyle} />
      <div ref={hoverReadoutRef} className="panel-hover-readout" />
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

const overlayStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  pointerEvents: 'none',
};
