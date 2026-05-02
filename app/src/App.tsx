// ============================================================
// App root - wires layout, panels, controls, and score loader.
// ============================================================

import { useState, useEffect, useRef, useCallback, useSyncExternalStore } from 'react';
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
import { captureQuadrant, downloadPng } from './panels/panelSnapshot';
import { SupportInstrumentationRack } from './panels/SupportInstrumentationRack';
import { WaveformOverviewPanel } from './panels/WaveformOverviewPanel';
import { useAnalysisConfigStore, useAudioEngine, useDerivedMediaSnapshot, useDerivedMediaStore, useDisplayMode, useMarkers, usePendingRangeStart, usePerformanceDiagnosticsStore, usePerformanceProfile, useRangeMarks, useTheaterMode, useVisualMode } from './core/session';
import { VISUAL_DECORATIONS } from './audio/displayMode';
import { restoreConsoleLayoutWorkspaceSnapshot } from './layout/consoleLayoutWorkspace';
import type { PerformanceDiagnosticsSnapshot } from './diagnostics/logStore';
import { PRODUCT_NAME } from './constants';
import { COLORS, FONTS, MODES, SPACING } from './theme';
import { formatRuntimeMs } from './utils/format';
import { SessionDeck, type SessionStatus } from './controls/SessionDeck';
import { matchReviewSessionSource, type ReviewSessionV1 } from './runtime/reviewSession';

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
  const [pendingSession, setPendingSession] = useState<ReviewSessionV1 | null>(null);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>({ text: '', tone: 'dim' });
  const activeMediaKeyRef = useRef<string | null>(null);
  const displayMode = useDisplayMode();
  const analysisConfigStore = useAnalysisConfigStore();

  const restoreReviewSession = useCallback((session: ReviewSessionV1): void => {
    derivedMedia.restore(session.review);
    displayMode.setMode(session.workspace.visualMode);
    analysisConfigStore.restore(session.workspace.analysisConfig);
    restoreConsoleLayoutWorkspaceSnapshot({
      layout: session.workspace.layout,
      runtimeTrayHeight: session.workspace.runtimeTrayHeight,
    });
    setGrayscale(session.workspace.grayscale);
    setLayoutResetToken((token) => token + 1);
  }, [analysisConfigStore, derivedMedia, displayMode]);

  useEffect(() => {
    return audioEngine.onTransport((state) => {
      const nextMediaKey = sessionMedia.mediaKey ?? buildTransportMediaKey(state.filename, state.duration);
      if (nextMediaKey !== activeMediaKeyRef.current) {
        activeMediaKeyRef.current = nextMediaKey;
        derivedMedia.reset();
      }
      setTransportFilename(state.filename);
      performanceDiagnostics.noteTransport(state);

      if (pendingSession === null) return;
      const currentIdentity = {
        filename: sessionMedia.filename ?? state.filename,
        kind: sessionMedia.kind,
        durationS: state.duration > 0 ? state.duration : null,
        mediaKey: nextMediaKey,
      };
      const match = matchReviewSessionSource(pendingSession.source, currentIdentity);
      if (match.kind !== 'match') return;
      restoreReviewSession(pendingSession);
      setPendingSession(null);
      setSessionStatus({ text: 'Session restored.', tone: 'ok' });
    });
  }, [audioEngine, derivedMedia, pendingSession, performanceDiagnostics, restoreReviewSession, sessionMedia.filename, sessionMedia.kind, sessionMedia.mediaKey]);

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

  const handleSnapshot = useCallback((panelLabel: string) => (container: HTMLDivElement | null) => {
    if (!container) return;
    const dataUrl = captureQuadrant(container, {
      panelLabel,
      filename: sessionMedia.filename ?? transportFilename,
      currentTime: audioEngine.currentTime,
      duration: audioEngine.duration,
      visualMode,
    }, visualMode as import('./audio/displayMode').VisualMode);
    if (!dataUrl) return;
    const stem = (sessionMedia.filename ?? transportFilename ?? 'snapshot').replace(/\.[^/.]+$/, '');
    const ts = Date.now();
    downloadPng(dataUrl, `${stem}_${panelLabel.toLowerCase().replace(/\s+/g, '-')}_${ts}`);
  }, [audioEngine, sessionMedia.filename, transportFilename, visualMode]);

  const displayFilename = sessionMedia.filename ?? transportFilename;
  const fileTitle = displayFilename ? displayFilename.replace(/\.[^/.]+$/, '') : null;
  const panelTitle = fileTitle ?? 'NO SESSION';
  const visualDecoration = VISUAL_DECORATIONS[visualMode];
  const runtimeStatus = getRuntimeStatus(perfSnapshot);
  const topRightPanels = panelsForColumn('top-right').filter(({ id }) => id !== 'wave-scroll');

  useEffect(() => {
    document.title = fileTitle ? `${fileTitle} - ${PRODUCT_NAME}` : PRODUCT_NAME;
  }, [fileTitle]);

  const sessionDeckNode = (
    <SessionDeck
      visualMode={visualMode}
      source={{
        filename: sessionMedia.filename ?? transportFilename,
        kind: sessionMedia.kind,
        durationS: audioEngine.duration > 0 ? audioEngine.duration : null,
        mediaKey: sessionMedia.mediaKey,
      }}
      currentTimeS={audioEngine.currentTime}
      grayscale={grayscale}
      pendingSession={pendingSession}
      onPendingSessionChange={setPendingSession}
      onSessionRestore={restoreReviewSession}
      onStatusChange={setSessionStatus}
    />
  );

  const sessionStatusNode = sessionStatus.text ? (
    <div
      style={{
        ...sessionStatusStyle,
        color:
          sessionStatus.tone === 'warn'
            ? MODES[visualMode].trace
            : sessionStatus.tone === 'ok' || sessionStatus.tone === 'info'
              ? MODES[visualMode].text
              : MODES[visualMode].category,
      }}
    >
      {sessionStatus.text}
    </div>
  ) : null;

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
          help: 'SESSION CONTROLS\n\nLoad a file via drag-drop or the file button. All analysis runs locally — no network required.\n\nTOP CONTROL DECK: open the main media file, attach alternate audio, attach subtitles, manage the video window, and use the local transport deck.\n\nPLAYBACK HOME: use the control strip above OVERVIEW for stop, play/pause, loop, seek, and the main time readout.\n\nPLAYBACK TUNING: VOL and RATE stay inline under the transport rail. Use the PLAYBACK TUNING chevron to open the full tuning overlay with VOL, RATE, PITCH, SCRL, and RESET.\n\nGREYSCALE: monochrome overlay. OPTIC: white-light dispersion palette. RED: darkroom red-light palette. NGE: phosphor-green palette. HYPER: cyan/indigo palette. EVA: alarm-state violet/orange palette.\n\nKEYBOARD SHORTCUTS: Space play/pause, ← → seek 5 s (Shift: 15 s), S stop, L loop file, M mark, I set review in, O commit review out, Esc clear loop, ? show all shortcuts.\n\nTRACE / DIAGNOSTICS: lives below clip export as a dropdown log so preview space stays prioritized.',
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
                sessionDeckSlot={sessionDeckNode}
                sessionStatusSlot={sessionStatusNode}
              />
            </div>
          ),
        }}
        topRight={{
          category: 'LIVE DIAGNOSTIC',
          title: 'REVIEW / OVERVIEW / PITCH / OSC / RESPONSE',
          onSnapshot: handleSnapshot('LIVE DIAGNOSTIC'),
          headerAccessoryPlacement: 'stacked',
          headerAccessory: <OverviewTransportStrip />,
          help: 'LIVE DIAGNOSTIC SURFACES\n\nREVIEW — Editorial range staging now lives in the chrome shelf above OVERVIEW. SET IN captures a persistent in-point and now shows its pending timestamp inline, SET OUT commits a range, FROM LOOP promotes the audible loop to a persistent review range, and saved ranges stay visible inline for clip, compare, and repair work. VOL and RATE stay inline beneath the transport rail, while the PLAYBACK TUNING chevron opens the full tuning overlay with VOL, RATE, PITCH, SCRL, and RESET.\n\nOVERVIEW — Full-file waveform envelope plus detail waveform view. Drag the view window to zoom; drag loop handles to set loop region. Session map fills in progressively for large files. Range overlays remain visible on the session map and detail waveform.\n\nF0 TRACK — Pitch history (60–900 Hz, log scale). Hover to read note name and cents deviation.\n\nOSCILLOSCOPE — Triggered waveform cycle. Shows signal morphology at playback rate.\n\nOSC SCROLL — Scrolling oscilloscope history for time-domain motion and density.\n\nFREQ RESPONSE — Smoothed L/R frequency curves (20 Hz–20 kHz). Hover for exact Hz + dB. Dim labels above show band boundaries.',
          content: (
            <TheaterPanelShell
              active={theaterMode}
              title="VIDEO PRIORITY"
              detail="Live diagnostic surfaces are paused in place while theater mode is active."
              visualMode={visualMode}
            >
              <SplitPane
                direction="column"
                initialSizes={[54, 8, 8, 8, 22]}
                minSizePx={[180, 52, 52, 52, 64]}
                resetToken={layoutResetToken}
                persistKey="console:top-right-stack"
              >
                {topRightPanels.map(({ id, component: Panel }) =>
                  id === 'overview'
                    ? <WaveformOverviewPanel key={id} markers={markers} rangeMarks={rangeMarks} pendingRangeStartS={pendingRangeStartS} selectedRangeId={selectedRangeId} onDeleteMarker={(id) => derivedMedia.deleteMarker(id)} onClearMarkers={() => derivedMedia.clearMarkers()} onClearRanges={() => derivedMedia.clearRanges()} onSelectRange={(id) => derivedMedia.selectRange(id)} onUpdateRange={(id, startS, endS) => derivedMedia.updateRange(id, startS, endS)} />
                    : <Panel key={id} />
                )}
              </SplitPane>
            </TheaterPanelShell>
          ),
        }}
        bottomLeft={{
          category: 'SUPPORT INSTRUMENTATION',
          title: 'LEVELS / GONIOMETER / BANDS / PARTIALS',
          onSnapshot: handleSnapshot('SUPPORT INSTRUMENTATION'),
          help: 'SUPPORT INSTRUMENTATION\n\nLEVELS — Stereo peak (bright) and RMS (dim) bars in dBFS. Peak hold decays slowly. Colour zones: green (< −12 dB), yellow (−12 to −3 dB), red (> −3 dB).\n\nGONIOMETER — Stereo phase display (M/S Lissajous).\n  Vertical axis = Mid (L+R): strong signal = tall shape\n  Horizontal axis = Side (L−R): wide shape = wide stereo\n  Mono: collapses to vertical line. Out-of-phase: horizontal line.\n  Phase correlation bar: +1 = identical (mono), 0 = uncorrelated, −1 = cancelling.\n  Green (> +0.5) is safe for mono. Red (< 0) will cancel in mono.\n\nFREQ BANDS — Six-band energy display.\n  Sub: 20–80 Hz (subwoofer weight)\n  Lo-Mid: 80–240 Hz (warmth, mud)\n  Mid: 240–900 Hz (body, presence)\n  Hi-Mid: 900–2800 Hz (articulation, harshness)\n  Presence: 2800–8000 Hz (clarity, sibilance)\n  Air: 8–20 kHz (sheen, breath)\n\nHARMONICS — First 10 partials of detected fundamental. Normalised relative to strongest partial (40 dB dynamic window). Fundamental at left; overtones descend in brightness.',
          content: (
            <TheaterPanelShell
              active={theaterMode}
              title="SURFACES IDLED"
              detail="Instrumentation is held in place during video priority mode, then resumes instantly."
              visualMode={visualMode}
            >
              <SupportInstrumentationRack />
            </TheaterPanelShell>
          ),
        }}
        bottomRight={{
          category: 'SPECTRAL ANATOMY',
          title: 'LOUDNESS / LUFS / SPECTROGRAM',
          onSnapshot: handleSnapshot('SPECTRAL ANATOMY'),
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

const sessionStatusStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 9,
  letterSpacing: '0.06em',
  paddingTop: 2,
  whiteSpace: 'normal',
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
