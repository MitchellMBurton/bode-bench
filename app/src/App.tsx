// ============================================================
// App root - wires layout, panels, controls, and score loader.
// ============================================================

import { useState, useEffect } from 'react';
import { ConsoleLayout } from './layout/ConsoleLayout';
import { SplitPane } from './layout/SplitPane';
import { TransportControls } from './controls/TransportControls';
import { MetadataDisplay } from './controls/MetadataDisplay';
import { SessionControls } from './controls/SessionControls';
import { DiagnosticsLog } from './controls/DiagnosticsLog';
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
import { useAudioEngine, useDisplayMode, useTheaterMode } from './core/session';
import type { VisualMode } from './audio/displayMode';
import { COLORS, FONTS, SPACING } from './theme';

const SEEK_STEP = 5;

export default function App(): React.ReactElement {
  const audioEngine = useAudioEngine();
  const displayMode = useDisplayMode();
  const theaterMode = useTheaterMode();
  const [filename, setFilename] = useState<string | null>(null);
  const [grayscale, setGrayscale] = useState(false);
  const [visualMode, setVisualMode] = useState<VisualMode>('default');
  const [layoutResetToken, setLayoutResetToken] = useState(0);

  useEffect(() => {
    return audioEngine.onTransport((state) => {
      setFilename(state.filename);
    });
  }, [audioEngine]);

  useEffect(() => {
    displayMode.setMode(visualMode);
  }, [displayMode, visualMode]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          if (audioEngine.duration > 0) {
            if (audioEngine.isPlaying) { audioEngine.pause(); } else { audioEngine.play(); }
          }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          audioEngine.seek(Math.max(0, audioEngine.currentTime - SEEK_STEP));
          break;
        case 'ArrowRight':
          e.preventDefault();
          audioEngine.seek(Math.min(audioEngine.duration, audioEngine.currentTime + SEEK_STEP));
          break;
        case 'Escape':
          e.preventDefault();
          audioEngine.clearLoop();
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [audioEngine]);

  const fileTitle = filename ? filename.replace(/\.[^/.]+$/, '') : null;
  const panelTitle = fileTitle ?? 'NO SESSION';
  const showScanLines = visualMode === 'nge' || visualMode === 'hyper';

  return (
    <>
      <ConsoleLayout
        grayscale={grayscale}
        visualMode={visualMode}
        layoutResetToken={layoutResetToken}
        onResetLayout={() => setLayoutResetToken((token) => token + 1)}
        topLeft={{
          category: 'SUITE CONSOLE',
          title: panelTitle,
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
          content: (
            <TheaterPanelShell
              active={theaterMode}
              title="SURFACES IDLED"
              detail="Instrumentation remains mounted so state is preserved when theater mode closes."
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

