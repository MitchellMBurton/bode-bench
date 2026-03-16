// ============================================================
// App root - wires layout, panels, controls, and score loader.
// ============================================================

import { useState, useEffect, useSyncExternalStore } from 'react';
import { ConsoleLayout } from './layout/ConsoleLayout';
import { SplitPane } from './layout/SplitPane';
import { TransportControls } from './controls/TransportControls';
import { MetadataDisplay } from './controls/MetadataDisplay';
import { SessionControls } from './controls/SessionControls';
import { DiagnosticsLog, PerformanceDiagnostics } from './controls/DiagnosticsLog';
import { WaveformOverviewPanel } from './panels/WaveformOverviewPanel';
import { OscilloscopePanel } from './panels/OscilloscopePanel';
import { OscilloscopeScrollPanel } from './panels/OscilloscopeScrollPanel';
import { FrequencyResponsePanel } from './panels/FrequencyResponsePanel';
import { WaveformScrollPanel } from './panels/WaveformScrollPanel';
import { SpectrogramPanel } from './panels/SpectrogramPanel';
import { LevelsPanel } from './panels/LevelsPanel';
import { FrequencyBandsPanel } from './panels/FrequencyBandsPanel';
import { PitchTrackerPanel } from './panels/PitchTrackerPanel';
import { HarmonicLadderPanel } from './panels/HarmonicLadderPanel';
import { LoudnessHistoryPanel } from './panels/LoudnessHistoryPanel';
import { useAudioEngine, useDiagnosticsLog, useDisplayMode, usePerformanceDiagnosticsStore, usePerformanceProfile, useTheaterMode } from './core/session';
import type { VisualMode } from './audio/displayMode';
import type { PerformanceDiagnosticsSnapshot } from './diagnostics/logStore';
import { CANVAS, COLORS, FONTS, SPACING } from './theme';

const SEEK_STEP = 5;
const SEEK_STEP_LARGE = 15;
const GLOBAL_HOTKEY_BLOCK_SELECTOR = [
  'input',
  'textarea',
  'select',
  'button',
  'summary',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[role="textbox"]',
  '[role="button"]',
  '[role="dialog"]',
  '[aria-modal="true"]',
  '[data-shell-interactive="true"]',
  '[data-shell-overlay="true"]',
].join(', ');

function formatTransportTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const tenths = Math.floor((seconds % 1) * 10);
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
}

function formatRuntimeMs(value: number | null, digits = 0): string {
  if (value === null || !Number.isFinite(value)) return '--';
  return `${value.toFixed(digits)} ms`;
}

function getRuntimeStatus(snapshot: PerformanceDiagnosticsSnapshot): string {
  if (snapshot.videoRecoveryCount > 0 || snapshot.videoStallCount > 0) return 'VIDEO PRESSURE';
  if (snapshot.uiFrameP95Ms >= 24 || snapshot.uiJankPercent >= 14 || (snapshot.lastLongTaskMs ?? 0) >= 40) return 'UI PRESSURE';
  if (snapshot.videoCatchupActive || Math.abs(snapshot.videoDriftMs) >= 80) return 'SYNC ACTIVE';
  return 'CLEAN';
}

function shouldIgnoreGlobalTransportHotkeys(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if ((target as HTMLElement).isContentEditable) return true;
  return target.closest(GLOBAL_HOTKEY_BLOCK_SELECTOR) !== null;
}

export default function App(): React.ReactElement {
  const audioEngine = useAudioEngine();
  const diagnosticsLog = useDiagnosticsLog();
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

  useEffect(() => {
    return audioEngine.onTransport((state) => {
      setFilename(state.filename);
      performanceDiagnostics.noteTransport(state);
    });
  }, [audioEngine, performanceDiagnostics]);

  useEffect(() => {
    let rafId = 0;
    let lastAt = 0;
    const tick = (now: number) => {
      if (lastAt !== 0) {
        performanceDiagnostics.noteUiFrame(now - lastAt);
      }
      lastAt = now;
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [performanceDiagnostics]);

  useEffect(() => {
    if (typeof PerformanceObserver === 'undefined') return;
    if (!PerformanceObserver.supportedEntryTypes?.includes('longtask')) return;

    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        performanceDiagnostics.noteLongTask(entry.duration);
      }
    });

    observer.observe({ entryTypes: ['longtask'] });
    return () => observer.disconnect();
  }, [performanceDiagnostics]);

  useEffect(() => {
    displayMode.setMode(visualMode);
  }, [displayMode, visualMode]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || shouldIgnoreGlobalTransportHotkeys(e.target)) return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          if (audioEngine.duration > 0) {
            if (audioEngine.isPlaying) { audioEngine.pause(); } else { audioEngine.play(); }
          }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          audioEngine.seek(Math.max(0, audioEngine.currentTime - (e.shiftKey ? SEEK_STEP_LARGE : SEEK_STEP)));
          break;
        case 'ArrowRight':
          e.preventDefault();
          audioEngine.seek(Math.min(audioEngine.duration, audioEngine.currentTime + (e.shiftKey ? SEEK_STEP_LARGE : SEEK_STEP)));
          break;
        case 'KeyS':
          e.preventDefault();
          audioEngine.stop();
          break;
        case 'KeyL':
          e.preventDefault();
          if (audioEngine.duration <= 0) break;
          if (audioEngine.loopStart !== null && audioEngine.loopEnd !== null) {
            audioEngine.clearLoop();
            diagnosticsLog.push('loop cleared', 'info', 'transport');
          } else {
            audioEngine.setLoop(0, audioEngine.duration);
            diagnosticsLog.push(`loop file 00:00.0 -> ${formatTransportTime(audioEngine.duration)}`, 'info', 'transport');
          }
          break;
        case 'Escape':
          e.preventDefault();
          audioEngine.clearLoop();
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [audioEngine, diagnosticsLog]);

  const fileTitle = filename ? filename.replace(/\.[^/.]+$/, '') : null;
  const panelTitle = fileTitle ?? 'NO SESSION';
  const showScanLines = visualMode === 'nge' || visualMode === 'hyper';
  const runtimeStatus = getRuntimeStatus(perfSnapshot);

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
                value={formatRuntimeMs(perfSnapshot.lastLongTaskMs)}
                tone={(perfSnapshot.lastLongTaskMs ?? 0) >= 40 ? 'warn' : 'dim'}
              />
            </>
          ),
          content: <PerformanceDiagnostics visualMode={visualMode} />,
        }}
        topLeft={{
          category: 'SUITE CONSOLE',
          title: panelTitle,
          help: 'SESSION CONTROLS\n\nLoad a file via drag-drop or the file button. All analysis runs locally — no network required.\n\nVOL: output volume. RATE: playback speed (preserves pitch when pitch mode is on). PITCH: enable real-time pitch shifting on decoded files (< 384 MB).\n\nGREYSCALE: monochrome overlay. NGE: phosphor-green palette. HYPER: cyan/indigo palette.\n\nDiagnostics log captures every transport event and file analysis result.',
          content: (
            <div style={controlPanelStyle}>
              <MetadataDisplay filename={filename} />
              <div style={dividerStyle} />
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
            >
              <SplitPane
                direction="column"
                initialSizes={[24, 18, 9, 9, 10, 30]}
                minSizePx={[96, 72, 56, 56, 56, 80]}
                resetToken={layoutResetToken}
                persistKey="console:top-right-stack"
              >
                {[
                  <WaveformOverviewPanel key="overview" />,
                  <WaveformScrollPanel key="wave-scroll" />,
                  <PitchTrackerPanel key="pitch" />,
                  <OscilloscopePanel key="osc" />,
                  <OscilloscopeScrollPanel key="osc-scroll" />,
                  <FrequencyResponsePanel key="response" />,
                ]}
              </SplitPane>
            </TheaterPanelShell>
          ),
        }}
        bottomLeft={{
          category: 'SUPPORT INSTRUMENTATION',
          title: 'LEVELS / BANDS / PARTIALS',
          help: 'SUPPORT INSTRUMENTATION\n\nLEVELS — Stereo peak (bright) and RMS (dim) bars in dBFS. Peak hold decays slowly. Colour zones: green (< −12 dB), yellow (−12 to −3 dB), red (> −3 dB).\n\nFREQ BANDS — Six-band energy display.\n  Sub: 20–80 Hz (subwoofer weight)\n  Lo-Mid: 80–240 Hz (warmth, mud)\n  Mid: 240–900 Hz (body, presence)\n  Hi-Mid: 900–2800 Hz (articulation, harshness)\n  Presence: 2800–8000 Hz (clarity, sibilance)\n  Air: 8–20 kHz (sheen, breath)\n\nHARMONICS — First 10 partials of detected fundamental. Normalised relative to strongest partial (40 dB dynamic window). Fundamental at left; overtones descend in brightness.',
          content: (
            <TheaterPanelShell
              active={theaterMode}
              title="SURFACES IDLED"
              detail="Instrumentation is held in place during video priority mode, then resumes instantly."
            >
              <SplitPane
                direction="column"
                initialSizes={[30, 30, 40]}
                minSizePx={[72, 72, 56]}
                resetToken={layoutResetToken}
                persistKey="console:bottom-left-stack"
              >
                {[
                  <LevelsPanel key="levels" />,
                  <FrequencyBandsPanel key="bands" />,
                  <HarmonicLadderPanel key="ladder" />,
                ]}
              </SplitPane>
            </TheaterPanelShell>
          ),
        }}
        bottomRight={{
          category: 'SPECTRAL ANATOMY',
          title: 'LOUDNESS / SPECTROGRAM',
          help: 'SPECTRAL ANATOMY\n\nRMS LEVEL — Short-term loudness history. Scrolls in sync with the spectrogram. Reference lines at −6, −18, −36 dBFS. Hover to read level at any point in history.\n\nSPECTROGRAM — Time–frequency representation.\n  Horizontal: time flows left → right (newest at right edge)\n  Vertical: frequency 20 Hz (bottom) → 20 kHz (top), log scale\n  Brightness: amplitude (dark = quiet, bright = loud), range −96 to 0 dBFS\n\nWhat to look for:\n  Horizontal lines → sustained tones or resonances\n  Vertical streaks → transients and attacks\n  Evenly-spaced horizontal lines → harmonic series\n  Diffuse colour field → broadband noise\n\nHover to read exact frequency and level at the cursor.',
          content: (
            <TheaterPanelShell
              active={theaterMode}
              title="SPECTRAL PAUSE"
              detail="Loudness and spectrum views are held in place during theater mode, then resume from the same session."
            >
              <SplitPane
                direction="column"
                initialSizes={[18, 82]}
                minSizePx={[48, 96]}
                resetToken={layoutResetToken}
                persistKey="console:bottom-right-stack"
              >
                {[
                  <LoudnessHistoryPanel key="loudness" />,
                  <SpectrogramPanel key="spectrogram" />,
                ]}
              </SplitPane>
            </TheaterPanelShell>
          ),
        }}
      />
      {showScanLines && <div style={scanLineStyle} />}
    </>
  );
}


function RuntimeMetricPill({
  label,
  value,
  tone,
  visualMode = 'default',
}: {
  label: string;
  value: string;
  tone: 'dim' | 'info' | 'warn';
  visualMode?: VisualMode;
}): React.ReactElement {
  const nge = visualMode === 'nge';
  const hyper = visualMode === 'hyper';

  const pillBg = nge ? 'rgba(4,10,4,0.85)' : hyper ? 'rgba(2,5,18,0.85)' : COLORS.bg1;
  const labelColor = nge ? 'rgba(80,160,50,0.55)' : hyper ? CANVAS.hyper.category : COLORS.textCategory;

  const borderColor =
    tone === 'warn'
      ? COLORS.statusWarn
      : tone === 'info'
        ? nge ? CANVAS.nge.chromeBorder : hyper ? CANVAS.hyper.chromeBorder : COLORS.borderHighlight
        : nge ? 'rgba(60,130,30,0.38)' : hyper ? 'rgba(40,70,180,0.38)' : COLORS.border;
  const textColor =
    tone === 'warn'
      ? COLORS.textPrimary
      : tone === 'info'
        ? nge ? CANVAS.nge.trace : hyper ? CANVAS.hyper.trace : COLORS.textPrimary
        : nge ? 'rgba(120,200,60,0.75)' : hyper ? 'rgba(112,180,255,0.65)' : COLORS.textSecondary;

  return (
    <span style={{ ...runtimeMetricPillStyle, borderColor, background: pillBg }}>
      <span style={{ ...runtimeMetricLabelStyle, color: labelColor }}>{label}</span>
      <span style={{ ...runtimeMetricValueStyle, color: textColor }}>{value}</span>
    </span>
  );
}

function TheaterPanelShell({
  active,
  title,
  detail,
  children,
}: {
  active: boolean;
  title: string;
  detail: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div style={theaterShellStyle}>
      <div style={theaterShellContentStyle}>{children}</div>
      {active ? (
        <div style={theaterStandbyOverlayStyle}>
          <div style={theaterStandbyTitleStyle}>{title}</div>
          <div style={theaterStandbyDetailStyle}>{detail}</div>
        </div>
      ) : null}
    </div>
  );
}


const runtimeMetricPillStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: SPACING.xs,
  padding: `2px ${SPACING.sm}px`,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: COLORS.border,
  borderRadius: 2,
  background: COLORS.bg1,
  minWidth: 0,
};

const runtimeMetricLabelStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  color: COLORS.textCategory,
  letterSpacing: '0.12em',
};

const runtimeMetricValueStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeXs,
  letterSpacing: '0.06em',
  color: COLORS.textSecondary,
};

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

const theaterShellStyle: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  height: '100%',
  overflow: 'hidden',
};

const theaterShellContentStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
};

const theaterStandbyOverlayStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'center',
  gap: SPACING.sm,
  padding: SPACING.lg,
  background: 'linear-gradient(180deg, rgba(10,12,18,0.88), rgba(14,16,22,0.94))',
  textAlign: 'center',
  pointerEvents: 'auto',
};

const theaterStandbyTitleStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeMd,
  color: COLORS.textPrimary,
  letterSpacing: '0.14em',
};

const theaterStandbyDetailStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: FONTS.sizeSm,
  color: COLORS.textSecondary,
  letterSpacing: '0.04em',
  maxWidth: 440,
  lineHeight: 1.6,
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

