// ============================================================
// App root - wires layout, panels, controls, and score loader.
// ============================================================

import { useState, useEffect, useRef, useSyncExternalStore } from 'react';
import { ConsoleLayout } from './layout/ConsoleLayout';
import { SplitPane } from './layout/SplitPane';
import { TheaterPanelShell } from './layout/TheaterPanelShell';
import { TransportControls } from './controls/TransportControls';
import { MetadataDisplay } from './controls/MetadataDisplay';
import { PerformanceDiagnostics } from './controls/DiagnosticsLog';
import { DisplayOptionsBar } from './controls/DisplayOptionsBar';
import { OverviewTransportStrip } from './controls/OverviewTransportStrip';
import { RuntimeMetricPill } from './controls/RuntimeMetricPill';
import { useGlobalHotkeys } from './controls/useGlobalHotkeys';
import { usePerformanceMonitoring } from './controls/usePerformanceMonitoring';
import { HotkeyOverlay } from './controls/HotkeyOverlay';
import { panelsForColumn } from './panels/registry';
import { WaveformOverviewPanel } from './panels/WaveformOverviewPanel';
import { useAudioEngine, useDerivedMediaSnapshot, useDerivedMediaStore, useMarkers, usePendingRangeStart, usePerformanceDiagnosticsStore, usePerformanceProfile, useRangeMarks, useTheaterMode, useVisualMode } from './core/session';
import { VISUAL_DECORATIONS } from './audio/displayMode';
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

function buildTransportMediaKey(filename: string | null, duration: number): string | null {
  if (!filename) return null;
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  return `${filename}:${safeDuration.toFixed(3)}`;
}

export default function App(): React.ReactElement {
  const audioEngine = useAudioEngine();
  const derivedMedia = useDerivedMediaStore();
  const performanceDiagnostics = usePerformanceDiagnosticsStore();
  const performanceProfile = usePerformanceProfile();
  const visualMode = useVisualMode();
  const markers = useMarkers();
  const pendingRangeStartS = usePendingRangeStart();
  const rangeMarks = useRangeMarks();
  const derivedMediaSnapshot = useDerivedMediaSnapshot();
  const selectedRangeId = derivedMediaSnapshot.selectedRangeId;
  const perfSnapshot = useSyncExternalStore(
    performanceDiagnostics.subscribe,
    performanceDiagnostics.getSnapshot,
    performanceDiagnostics.getSnapshot,
  );
  const theaterMode = useTheaterMode();
  const [transportFilename, setTransportFilename] = useState<string | null>(null);
  const [sessionMedia, setSessionMedia] = useState<{ filename: string | null; mediaKey: string | null; kind: 'audio' | 'video' | null }>({
    filename: null,
    mediaKey: null,
    kind: null,
  });
  const [performanceLabOpen, setPerformanceLabOpen] = useState(false);
  const [grayscale, setGrayscale] = useState(false);
  const [layoutResetToken, setLayoutResetToken] = useState(0);
  const [hotkeyOverlayOpen, setHotkeyOverlayOpen] = useState(false);
  const activeMediaKeyRef = useRef<string | null>(null);

  useEffect(() => {
    return audioEngine.onTransport((state) => {
      const nextMediaKey = sessionMedia.mediaKey ?? buildTransportMediaKey(state.filename, state.duration);
      if (nextMediaKey !== activeMediaKeyRef.current) {
        activeMediaKeyRef.current = nextMediaKey;
        derivedMedia.reset();
      }
      setTransportFilename(state.filename);
      performanceDiagnostics.noteTransport(state);
    });
  }, [audioEngine, derivedMedia, performanceDiagnostics, sessionMedia.mediaKey]);

  useEffect(() => audioEngine.onReset(() => {
    setSessionMedia({ filename: null, mediaKey: null, kind: null });
    derivedMedia.reset();
  }), [audioEngine, derivedMedia]);

  useEffect(() => {
    document.documentElement.dataset.visualMode = visualMode;
    return () => {
      delete document.documentElement.dataset.visualMode;
    };
  }, [visualMode]);

  usePerformanceMonitoring();
  useGlobalHotkeys({
    onShowHotkeyOverlay: () => setHotkeyOverlayOpen(true),
  });

  const displayFilename = sessionMedia.filename ?? transportFilename;
  const fileTitle = displayFilename ? displayFilename.replace(/\.[^/.]+$/, '') : null;
  const panelTitle = fileTitle ?? 'NO SESSION';
  const visualDecoration = VISUAL_DECORATIONS[visualMode];
  const runtimeStatus = getRuntimeStatus(perfSnapshot);

  useEffect(() => {
    document.title = fileTitle ? `${fileTitle} - ${PRODUCT_NAME}` : PRODUCT_NAME;
  }, [fileTitle]);

  return (
    <>
      <ConsoleLayout
        grayscale={grayscale}
        visualMode={visualMode}
        optionRow={<DisplayOptionsBar grayscale={grayscale} onGrayscale={setGrayscale} />}
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
          help: 'SESSION CONTROLS\n\nLoad a file via drag-drop or the file button. All analysis runs locally — no network required.\n\nTOP CONTROL DECK: open the main media file, attach alternate audio, attach subtitles, manage the video window, and use the local transport deck.\n\nPLAYBACK HOME: use the control strip above OVERVIEW for stop, play/pause, loop, seek, and the main time readout.\n\nPLAYBACK TUNING: VOL, RATE, PITCH, and SCRL now sit directly under that overview transport strip.\n\nGREYSCALE: monochrome overlay. OPTIC: white-light dispersion palette. RED: darkroom red-light palette. NGE: phosphor-green palette. HYPER: cyan/indigo palette. EVA: alarm-state violet/orange palette.\n\nKEYBOARD SHORTCUTS: Space play/pause, ← → seek 5 s (Shift: 15 s), S stop, L loop file, M mark, I set review in, O commit review out, Esc clear loop, ? show all shortcuts.\n\nTRACE / DIAGNOSTICS: lives below clip export as a dropdown log so preview space stays prioritized.',
          content: (
            <div style={controlPanelStyle}>
              <MetadataDisplay filename={displayFilename} metadata={null} visualMode={visualMode} />
              <div
                style={{
                  ...dividerStyle,
                  background: MODES[visualMode].chromeBorder,
                }}
              />
              <TransportControls
                onSessionMediaChange={setSessionMedia}
              />
            </div>
          ),
        }}
        topRight={{
          category: 'LIVE DIAGNOSTIC',
          title: 'REVIEW / OVERVIEW / WAVEFORM / PITCH / OSC / RESPONSE',
          headerAccessoryPlacement: 'stacked',
          headerAccessory: <OverviewTransportStrip />,
          help: 'LIVE DIAGNOSTIC SURFACES\n\nREVIEW — Editorial range staging. SET IN captures a persistent in-point, SET OUT commits a range, and FROM LOOP promotes the audible loop to a persistent review range. Loop remains audible context; ranges stay available for clip, compare, and repair work.\n\nOVERVIEW — Full-file waveform envelope. Drag the view window to zoom; drag loop handles to set loop region. Session map fills in progressively for large files. Range overlays remain visible on the session map and detail waveform.\n\nWAVEFORM — Scrolling amplitude tape. Hover to read ±amplitude and dBFS at any height.\n\nF0 TRACK — Pitch history (60–900 Hz, log scale). Newest data scrolls from right. Hover to read note name and cents deviation.\n\nOSCILLOSCOPE — Triggered waveform cycle. Shows signal morphology at playback rate.\n\nFREQ RESPONSE — Smoothed L/R frequency curves (20 Hz–20 kHz). Hover for exact Hz + dB. Dim labels above show band boundaries.',
          content: (
            <TheaterPanelShell
              active={theaterMode}
              title="VIDEO PRIORITY"
              detail="Live diagnostic surfaces are paused in place while theater mode is active."
              visualMode={visualMode}
            >
              <SplitPane
                direction="column"
                initialSizes={[2, 35, 20, 7, 7, 7, 22]}
                minSizePx={[36, 104, 72, 52, 52, 52, 64]}
                resetToken={layoutResetToken}
                persistKey="console:top-right-stack"
              >
                {panelsForColumn('top-right').map(({ id, component: Panel }) =>
                  id === 'overview'
                    ? <WaveformOverviewPanel key={id} markers={markers} rangeMarks={rangeMarks} pendingRangeStartS={pendingRangeStartS} selectedRangeId={selectedRangeId} onDeleteMarker={(id) => derivedMedia.deleteMarker(id)} onClearMarkers={() => derivedMedia.clearMarkers()} onClearRanges={() => derivedMedia.clearRanges()} onSelectRange={(id) => derivedMedia.selectRange(id)} />
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
                initialSizes={[10, 18, 72]}
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
      {visualDecoration === 'optic-bloom' ? <div style={opticBloomStyle} /> : null}
      {visualDecoration === 'red-lighting' ? <div style={redLightingStyle} /> : null}
      {visualDecoration === 'scan-lines' ? <div style={scanLineStyle} /> : null}
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
  minHeight: 0,
  overflowY: 'auto',
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
