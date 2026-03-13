// ============================================================
// App root — wires layout, panels, controls, and score loader.
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
import { useAudioEngine } from './core/session';
import { COLORS, SPACING } from './theme';

const SEEK_STEP = 5; // seconds per arrow key press

export default function App(): React.ReactElement {
  const audioEngine = useAudioEngine();
  const [filename, setFilename] = useState<string | null>(null);
  const [grayscale, setGrayscale] = useState(false);
  const [nge, setNge] = useState(false);
  // Incrementing this triggers SessionControls to reset all audio/display settings.
  const [sessionResetKey, setSessionResetKey] = useState(0);

  useEffect(() => {
    return audioEngine.onTransport((state) => {
      setFilename(state.filename);
    });
  }, [audioEngine]);

  // Global keyboard shortcuts
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

  return (
    <>
      <ConsoleLayout
      grayscale={grayscale}
      nge={nge}
      onResetAll={() => {
        setGrayscale(false);
        setNge(false);
        setSessionResetKey(k => k + 1);
      }}
      topLeft={{
        category: 'SUITE CONSOLE',
        title: panelTitle,
        content: (
          <div style={controlPanelStyle}>
            <MetadataDisplay filename={filename} />
            <div style={dividerStyle} />
            <TransportControls />
            <SessionControls grayscale={grayscale} onGrayscale={setGrayscale} nge={nge} onNge={setNge} resetKey={sessionResetKey} />
            <DiagnosticsLog />
          </div>
        ),
      }}
      topRight={{
        category: 'LIVE DIAGNOSTIC',
        title: 'OVERVIEW / WAVEFORM / PITCH / OSC / RESPONSE',
        content: (
          // Six independent vertical panes — each handle moves only that boundary.
          <SplitPane
            direction="column"
            initialSizes={[10, 22, 12, 12, 12, 32]}
            minSizePx={[56, 72, 56, 56, 56, 80]}
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
        ),
      }}
      bottomLeft={{
        category: 'SUPPORT INSTRUMENTATION',
        title: 'LEVELS / BANDS / PARTIALS',
        content: (
          <SplitPane
            direction="column"
            initialSizes={[30, 30, 40]}
            minSizePx={[72, 72, 56]}
          >
            {[
              <LevelsPanel key="levels" />,
              <FrequencyBandsPanel key="bands" />,
              <HarmonicLadderPanel key="ladder" />,
            ]}
          </SplitPane>
        ),
      }}
      bottomRight={{
        category: 'SPECTRAL ANATOMY',
        title: 'LOUDNESS / SPECTROGRAM',
        content: (
          <SplitPane
            direction="column"
            initialSizes={[18, 82]}
            minSizePx={[48, 96]}
          >
            {[
              <LoudnessHistoryPanel key="loudness" />,
              <SpectrogramPanel key="spectrogram" />,
            ]}
          </SplitPane>
        ),
      }}
      />
      {nge && <div style={scanLineStyle} />}
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

// NGE mode: horizontal scan lines across the entire viewport.
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
