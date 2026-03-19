// ============================================================
// App root - wires layout, panels, controls, and score loader.
// ============================================================

import { useState, useEffect, useRef, useSyncExternalStore, useCallback } from 'react';
import { ConsoleLayout } from './layout/ConsoleLayout';
import { SplitPane } from './layout/SplitPane';
import { TheaterPanelShell } from './layout/TheaterPanelShell';
import { TransportControls } from './controls/TransportControls';
import { MetadataDisplay } from './controls/MetadataDisplay';
import { SessionControls } from './controls/SessionControls';
import { DiagnosticsLog, PerformanceDiagnostics } from './controls/DiagnosticsLog';
import { RuntimeMetricPill } from './controls/RuntimeMetricPill';
import { useGlobalHotkeys } from './controls/useGlobalHotkeys';
import { usePerformanceMonitoring } from './controls/usePerformanceMonitoring';
import { HotkeyOverlay } from './controls/HotkeyOverlay';
import { panelsForColumn } from './panels/registry';
import { WaveformOverviewPanel } from './panels/WaveformOverviewPanel';
import { useAudioEngine, useDisplayMode, usePerformanceDiagnosticsStore, usePerformanceProfile, useTheaterMode } from './core/session';
import type { VisualMode } from './audio/displayMode';
import type { Marker } from './types';
import type { PerformanceDiagnosticsSnapshot } from './diagnostics/logStore';
import { PRODUCT_NAME } from './constants';
import { COLORS, MODES, SPACING } from './theme';
import { formatRuntimeMs } from './utils/format';

function getRuntimeStatus(snapshot: PerformanceDiagnosticsSnapshot): string {
  if (snapshot.videoRecoveryCount > 0 || snapshot.videoStallCount > 0) return 'VIDEO PRESSURE';
  if (snapshot.uiFrameP95Ms >= 24 || snapshot.uiJankPercent >= 14 || (snapshot.lastLongTaskMs ?? 0) >= 40) return 'UI PRESSURE';
  if (snapshot.videoCatchupActive || Math.abs(snapshot.videoDriftMs) >= 80) return 'SYNC ACTIVE';
  return 'CLEAN';
}

export default function App(): React.ReactElement {
  const audioEngine = useAudioEngine();
  const displayMode = useDisplayMode();
  const performanceDiagnostics = usePerformanceDiagnosticsStore();
  const performanceProfile = usePerformanceProfile();
  const perfSnapshot = useSyncExternalStore(
    performanceDiagnostics.subscribe,
    performanceDiagnostics.getSnapshot,
    performanceDiagnostics.getSnapshot,
  );
  const theaterMode = useTheaterMode();
  const [filename, setFilename] = useState<string | null>(null);
  const [performanceLabOpen, setPerformanceLabOpen] = useState(false);
  const [grayscale, setGrayscale] = useState(false);
  const [visualMode, setVisualMode] = useState<VisualMode>('default');
  const [layoutResetToken, setLayoutResetToken] = useState(0);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const markerCountRef = useRef(0);
  const [hotkeyOverlayOpen, setHotkeyOverlayOpen] = useState(false);

  useEffect(() => {
    return audioEngine.onTransport((state) => {
      setFilename(state.filename);
      performanceDiagnostics.noteTransport(state);
    });
  }, [audioEngine, performanceDiagnostics]);

  // Clear markers when a new file is loaded
  useEffect(() => audioEngine.onReset(() => {
    setMarkers([]);
    markerCountRef.current = 0;
  }), [audioEngine]);

  const deleteMarker = useCallback((id: number) => {
    setMarkers((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const clearMarkers = useCallback(() => {
    setMarkers([]);
    markerCountRef.current = 0;
  }, []);

  useEffect(() => {
    displayMode.setMode(visualMode);
  }, [displayMode, visualMode]);

  useEffect(() => {
    document.documentElement.dataset.visualMode = visualMode;
    return () => {
      delete document.documentElement.dataset.visualMode;
    };
  }, [visualMode]);

  usePerformanceMonitoring();
  useGlobalHotkeys({
    setMarkers,
    markerCountRef,
    onShowHotkeyOverlay: () => setHotkeyOverlayOpen(true),
  });

  const fileTitle = filename ? filename.replace(/\.[^/.]+$/, '') : null;
  const panelTitle = fileTitle ?? 'NO SESSION';
  const showScanLines = visualMode === 'nge' || visualMode === 'hyper' || visualMode === 'eva';
  const showOpticBloom = visualMode === 'optic';
  const showRedLighting = visualMode === 'red';
  const runtimeStatus = getRuntimeStatus(perfSnapshot);

  useEffect(() => {
    document.title = fileTitle ? `${fileTitle} - ${PRODUCT_NAME}` : PRODUCT_NAME;
  }, [fileTitle]);

  return (
    <>
      <ConsoleLayout
        grayscale={grayscale}
        visualMode={visualMode}
        layoutResetToken={layoutResetToken}
        onResetLayout={() => setLayoutResetToken((token) => token + 1)}
        runtimeDock={{
          label: 'RUNTIME PROFILE',
          value: runtimeStatus,
          actionLabel: 'PERF LAB',
          open: performanceLabOpen,
          onToggle: () => setPerformanceLabOpen((open) => !open),
          summary: (
            <>
              <RuntimeMetricPill visualMode={visualMode}
                label="UI"
                value={`${perfSnapshot.uiFps.toFixed(0)} FPS`}
                tone={perfSnapshot.uiFrameP95Ms >= 24 || perfSnapshot.uiJankPercent >= 14 ? 'warn' : 'dim'}
              />
              <RuntimeMetricPill visualMode={visualMode}
                label="JANK"
                value={`${perfSnapshot.uiJankPercent.toFixed(0)}%`}
                tone={perfSnapshot.uiJankPercent >= 14 ? 'warn' : 'dim'}
              />
              <RuntimeMetricPill visualMode={visualMode}
                label="VIDEO"
                value={`${perfSnapshot.videoState.toUpperCase()} ${Math.round(Math.abs(perfSnapshot.videoDriftMs))} MS`}
                tone={perfSnapshot.videoState === 'waiting' || perfSnapshot.videoState === 'stalled' ? 'warn' : perfSnapshot.videoCatchupActive ? 'info' : 'dim'}
              />
              <RuntimeMetricPill visualMode={visualMode}
                label="LOAD"
                value={perfSnapshot.lastLoad ? `${perfSnapshot.lastLoad.totalMs.toFixed(0)} MS` : '--'}
                tone={perfSnapshot.lastLoad && perfSnapshot.lastLoad.totalMs >= 1200 ? 'warn' : perfSnapshot.lastLoad && perfSnapshot.lastLoad.totalMs >= 900 ? 'info' : 'dim'}
              />
              <RuntimeMetricPill visualMode={visualMode}
                label="PROFILE"
                value={performanceProfile.label}
                tone={performanceProfile.activeProfile === 'desktop-high' ? 'info' : 'dim'}
              />
              <RuntimeMetricPill visualMode={visualMode}
                label="LONG"
                value={formatRuntimeMs(perfSnapshot.lastLongTaskMs, 0)}
                tone={(perfSnapshot.lastLongTaskMs ?? 0) >= 40 ? 'warn' : 'dim'}
              />
            </>
          ),
          content: <PerformanceDiagnostics visualMode={visualMode} />,
        }}
        topLeft={{
          category: 'SESSION CONSOLE',
          title: panelTitle,
          help: 'SESSION CONTROLS\n\nLoad a file via drag-drop or the file button. All analysis runs locally — no network required.\n\nVOL: output volume. RATE: playback speed (preserves pitch when pitch mode is on). PITCH: enable real-time pitch shifting on decoded files (< 384 MB).\n\nGREYSCALE: monochrome overlay. OPTIC: white-light dispersion palette. RED: darkroom red-light palette. NGE: phosphor-green palette. HYPER: cyan/indigo palette. EVA: alarm-state violet/orange palette.\n\nKEYBOARD SHORTCUTS: Space play/pause, ← → seek 5 s (Shift: 15 s), S stop, L loop file, M mark, Esc clear loop, ? show all shortcuts.\n\nDiagnostics log captures every transport event and file analysis result.',
          content: (
            <div style={controlPanelStyle}>
              <MetadataDisplay filename={filename} metadata={null} visualMode={visualMode} />
              <div
                style={{
                  ...dividerStyle,
                  background: MODES[visualMode].chromeBorder,
                }}
              />
              <TransportControls />
              <SessionControls
                grayscale={grayscale}
                onGrayscale={setGrayscale}
                visualMode={visualMode}
                onVisualMode={setVisualMode}
              />
              <DiagnosticsLog />
            </div>
          ),
        }}
        topRight={{
          category: 'LIVE DIAGNOSTIC',
          title: 'OVERVIEW / WAVEFORM / PITCH / OSC / RESPONSE',
          help: 'LIVE DIAGNOSTIC SURFACES\n\nOVERVIEW — Full-file waveform envelope. Drag the view window to zoom; drag loop handles to set loop region. Session map fills in progressively for large files.\n\nWAVEFORM — Scrolling amplitude tape. Hover to read ±amplitude and dBFS at any height.\n\nF0 TRACK — Pitch history (60–900 Hz, log scale). Newest data scrolls from right. Hover to read note name and cents deviation.\n\nOSCILLOSCOPE — Triggered waveform cycle. Shows signal morphology at playback rate.\n\nFREQ RESPONSE — Smoothed L/R frequency curves (20 Hz–20 kHz). Hover for exact Hz + dB. Dim labels above show band boundaries.',
          content: (
            <TheaterPanelShell
              active={theaterMode}
              title="VIDEO PRIORITY"
              detail="Live diagnostic surfaces are paused in place while theater mode is active."
              visualMode={visualMode}
            >
              <SplitPane
                direction="column"
                initialSizes={[24, 18, 9, 9, 10, 30]}
                minSizePx={[96, 72, 56, 56, 56, 80]}
                resetToken={layoutResetToken}
                persistKey="console:top-right-stack"
              >
                {panelsForColumn('top-right').map(({ id, component: Panel }) =>
                  id === 'overview'
                    ? <WaveformOverviewPanel key={id} markers={markers} onDeleteMarker={deleteMarker} onClearMarkers={clearMarkers} />
                    : <Panel key={id} />
                )}
              </SplitPane>
            </TheaterPanelShell>
          ),
        }}
        bottomLeft={{
          category: 'SUPPORT INSTRUMENTATION',
          title: 'LEVELS / GONIOMETER / BANDS / PARTIALS',
          help: 'SUPPORT INSTRUMENTATION\n\nLEVELS — Stereo peak (bright) and RMS (dim) bars in dBFS. Peak hold decays slowly. Colour zones: green (< −12 dB), yellow (−12 to −3 dB), red (> −3 dB).\n\nGONIOMETER — Stereo phase display (M/S Lissajous).\n  Vertical axis = Mid (L+R): strong signal = tall shape\n  Horizontal axis = Side (L−R): wide shape = wide stereo\n  Mono: collapses to vertical line. Out-of-phase: horizontal line.\n  Phase correlation bar: +1 = identical (mono), 0 = uncorrelated, −1 = cancelling.\n  Green (> +0.5) is safe for mono. Red (< 0) will cancel in mono.\n\nFREQ BANDS — Six-band energy display.\n  Sub: 20–80 Hz (subwoofer weight)\n  Lo-Mid: 80–240 Hz (warmth, mud)\n  Mid: 240–900 Hz (body, presence)\n  Hi-Mid: 900–2800 Hz (articulation, harshness)\n  Presence: 2800–8000 Hz (clarity, sibilance)\n  Air: 8–20 kHz (sheen, breath)\n\nHARMONICS — First 10 partials of detected fundamental. Normalised relative to strongest partial (40 dB dynamic window). Fundamental at left; overtones descend in brightness.',
          content: (
            <TheaterPanelShell
              active={theaterMode}
              title="SURFACES IDLED"
              detail="Instrumentation is held in place during video priority mode, then resumes instantly."
              visualMode={visualMode}
            >
              <SplitPane
                direction="column"
                initialSizes={[14, 38, 24, 24]}
                minSizePx={[48, 80, 56, 56]}
                resetToken={layoutResetToken}
                persistKey="console:bottom-left-stack"
              >
                {panelsForColumn('bottom-left').map(({ id, component: Panel }) => (
                  <Panel key={id} />
                ))}
              </SplitPane>
            </TheaterPanelShell>
          ),
        }}
        bottomRight={{
          category: 'SPECTRAL ANATOMY',
          title: 'LOUDNESS / LUFS / SPECTROGRAM',
          help: 'SPECTRAL ANATOMY\n\nRMS LEVEL — Short-term loudness history. Scrolls in sync with the spectrogram. Reference lines at −6, −18, −36 dBFS. Hover to read level at any point in history.\n\nLUFS — EBU R128 / ITU-R BS.1770 loudness meter.\n  M (momentary): 400 ms K-weighted average — most responsive\n  ST (short-term): 3 s average — best for mixing decisions\n  INT (integrated): from start of playback, gated — delivery spec\n  TP (true peak): peak hold since load — streaming limit is −1 dBTP\n  Reference lines: −14 LUFS (streaming), −16 (Apple), −23 EBU R128, −24 cinema\n\nSPECTROGRAM — Time–frequency representation.\n  Horizontal: time flows left → right (newest at right edge)\n  Vertical: frequency 20 Hz (bottom) → 20 kHz (top), log scale\n  Brightness: amplitude (dark = quiet, bright = loud), range −96 to 0 dBFS\n\nWhat to look for:\n  Horizontal lines → sustained tones or resonances\n  Vertical streaks → transients and attacks\n  Evenly-spaced horizontal lines → harmonic series\n  Diffuse colour field → broadband noise\n\nHover to read exact frequency and level at the cursor.',
          content: (
            <TheaterPanelShell
              active={theaterMode}
              title="SPECTRAL PAUSE"
              detail="Loudness and spectrum views are held in place during theater mode, then resume from the same session."
              visualMode={visualMode}
            >
              <SplitPane
                direction="column"
                initialSizes={[11, 20, 69]}
                minSizePx={[44, 60, 96]}
                resetToken={layoutResetToken}
                persistKey="console:bottom-right-stack"
              >
                {panelsForColumn('bottom-right').map(({ id, component: Panel }) => (
                  <Panel key={id} />
                ))}
              </SplitPane>
            </TheaterPanelShell>
          ),
        }}
      />
      {showOpticBloom && <div style={opticBloomStyle} />}
      {showRedLighting && <div style={redLightingStyle} />}
      {showScanLines && <div style={scanLineStyle} />}
      <HotkeyOverlay
        open={hotkeyOverlayOpen}
        onClose={() => setHotkeyOverlayOpen(false)}
        visualMode={visualMode}
      />
    </>
  );
}

const controlPanelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  overflow: 'hidden',
};

const dividerStyle: React.CSSProperties = {
  height: 1,
  background: COLORS.border,
  margin: `0 ${SPACING.md}px`,
  flexShrink: 0,
};

const scanLineStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  pointerEvents: 'none',
  zIndex: 9999,
  backgroundImage:
    'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.10) 2px, rgba(0,0,0,0.10) 3px)',
  animation: 'nge-scanlines 80ms linear infinite',
  mixBlendMode: 'overlay',
  willChange: 'background-position',
};

const opticBloomStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  pointerEvents: 'none',
  zIndex: 9998,
  opacity: 0.12,
  backgroundImage: [
    'radial-gradient(circle at 18% 14%, rgba(255,255,255,0.22), transparent 24%)',
    'radial-gradient(circle at 82% 12%, rgba(70,160,205,0.08), transparent 18%)',
    'linear-gradient(138deg, rgba(255,255,255,0.02) 0%, rgba(93,167,203,0.04) 30%, transparent 48%, rgba(198,160,96,0.05) 68%, rgba(255,255,255,0.02) 100%)',
  ].join(','),
  animation: 'optics-glide 18s linear infinite',
  willChange: 'background-position',
};

const redLightingStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  pointerEvents: 'none',
  zIndex: 9998,
  opacity: 0.18,
  backgroundImage: [
    'radial-gradient(circle at 16% 18%, rgba(255,78,64,0.18), transparent 22%)',
    'radial-gradient(circle at 84% 14%, rgba(160,28,24,0.26), transparent 20%)',
    'radial-gradient(circle at 50% 84%, rgba(255,120,94,0.10), transparent 26%)',
    'linear-gradient(180deg, rgba(64,0,0,0.18) 0%, rgba(32,0,0,0.05) 28%, transparent 46%, rgba(74,0,0,0.08) 100%)',
  ].join(','),
  animation: 'red-drift 22s linear infinite',
  willChange: 'background-position',
};
