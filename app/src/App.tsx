// ============================================================
// App root — wires layout, panels, controls, and score loader.
// ============================================================

import { useState, useEffect } from 'react';
import { ConsoleLayout } from './layout/ConsoleLayout';
import { TransportControls } from './controls/TransportControls';
import { MetadataDisplay } from './controls/MetadataDisplay';
import { SessionControls } from './controls/SessionControls';
import { DiagnosticsLog } from './controls/DiagnosticsLog';
import { WaveformOverviewPanel } from './panels/WaveformOverviewPanel';
import { OscilloscopePanel } from './panels/OscilloscopePanel';
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

  useEffect(() => {
    return audioEngine.onTransport((state) => {
      setFilename(state.filename);
    });
  }, [audioEngine]);

  // Global keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Skip if focus is in an input/textarea
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
      topLeft={{
        category: 'SUITE CONSOLE',
        title: panelTitle,
        content: (
          <div style={controlPanelStyle}>
            <MetadataDisplay filename={filename} />
            <div style={dividerStyle} />
            <TransportControls />
            <SessionControls grayscale={grayscale} onGrayscale={setGrayscale} nge={nge} onNge={setNge} />
            <DiagnosticsLog />
          </div>
        ),
      }}
      topRight={{
        category: 'LIVE DIAGNOSTIC',
        title: 'OVERVIEW / WAVEFORM / PITCH / OSC / RESPONSE',
        content: (
          <div style={splitPanelStyle}>
            <div style={overviewSlotStyle}><WaveformOverviewPanel /></div>
            <div style={waveScrollSlotStyle}><WaveformScrollPanel /></div>
            <div style={pitchSlotStyle}><PitchTrackerPanel /></div>
            <div style={diagLowerSlotStyle}>
              <div style={diagLowerStackStyle}>
                <div style={oscSlotStyle}><OscilloscopePanel /></div>
                <div style={responseSlotStyle}><FrequencyResponsePanel /></div>
              </div>
            </div>
          </div>
        ),
      }}
      bottomLeft={{
        category: 'SUPPORT INSTRUMENTATION',
        title: 'LEVELS / BANDS / PARTIALS',
        content: (
          <div style={splitPanelStyle}>
            <div style={levelsSlotStyle}><LevelsPanel /></div>
            <div style={freqSlotStyle}><FrequencyBandsPanel /></div>
            <div style={ladderSlotStyle}><HarmonicLadderPanel /></div>
          </div>
        ),
      }}
      bottomRight={{
        category: 'SPECTRAL ANATOMY',
        title: 'LOUDNESS / SPECTROGRAM',
        content: (
          <div style={splitPanelStyle}>
            <div style={loudnessSlotStyle}><LoudnessHistoryPanel /></div>
            <div style={spectroSlotStyle}><SpectrogramPanel /></div>
          </div>
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

const splitPanelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  gap: SPACING.panelGap,
};

const overviewSlotStyle: React.CSSProperties = {
  flex: '0 0 16%',
  minHeight: 0,
  overflow: 'hidden',
};

const waveScrollSlotStyle: React.CSSProperties = {
  flex: '0 0 33%',
  minHeight: 0,
  overflow: 'hidden',
};

const pitchSlotStyle: React.CSSProperties = {
  flex: '0 0 18%',
  minHeight: 0,
  overflow: 'hidden',
};

const diagLowerSlotStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: 'hidden',
};

const diagLowerStackStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  gap: SPACING.panelGap,
};

const oscSlotStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: 'hidden',
};

const responseSlotStyle: React.CSSProperties = {
  flex: 2,
  minHeight: 0,
  overflow: 'hidden',
};

const levelsSlotStyle: React.CSSProperties = {
  flex: '0 0 30%',
  minHeight: 0,
  overflow: 'hidden',
};

const freqSlotStyle: React.CSSProperties = {
  flex: '0 0 30%',
  minHeight: 0,
  overflow: 'hidden',
};

const ladderSlotStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: 'hidden',
};

const loudnessSlotStyle: React.CSSProperties = {
  flex: '0 0 18%',
  minHeight: 0,
  overflow: 'hidden',
};

const spectroSlotStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: 'hidden',
};

// NGE mode: horizontal scan lines across the entire viewport.
// Pointer-events none so no interaction is blocked.
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
