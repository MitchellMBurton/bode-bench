// ============================================================
// App root — wires layout, panels, controls, and score loader.
// ============================================================

import { useState, useEffect } from 'react';
import { ConsoleLayout } from './layout/ConsoleLayout';
import { TransportControls } from './controls/TransportControls';
import { MetadataDisplay } from './controls/MetadataDisplay';
import { OscilloscopePanel } from './panels/OscilloscopePanel';
import { WaveformScrollPanel } from './panels/WaveformScrollPanel';
import { SpectrogramPanel } from './panels/SpectrogramPanel';
import { LevelsPanel } from './panels/LevelsPanel';
import { FrequencyBandsPanel } from './panels/FrequencyBandsPanel';
import { audioEngine } from './audio/engine';
import { COLORS, SPACING } from './theme';

export default function App(): React.ReactElement {
  const [filename, setFilename] = useState<string | null>(null);

  useEffect(() => {
    return audioEngine.onTransport((state) => {
      setFilename(state.filename);
    });
  }, []);

  // Derive a display title from the filename (extension stripped)
  const fileTitle = filename ? filename.replace(/\.[^/.]+$/, '') : null;
  const panelTitle = fileTitle ?? 'NO SESSION';

  return (
    <ConsoleLayout
      topLeft={{
        category: 'SUITE CONSOLE',
        title: panelTitle,
        content: (
          <div style={controlPanelStyle}>
            <MetadataDisplay filename={filename} />
            <div style={dividerStyle} />
            <TransportControls />
          </div>
        ),
      }}
      topRight={{
        category: 'LIVE DIAGNOSTIC',
        title: 'OSCILLOSCOPE / WAVEFORM',
        content: (
          <div style={splitPanelStyle}>
            <div style={oscSlotStyle}><OscilloscopePanel /></div>
            <div style={waveScrollSlotStyle}><WaveformScrollPanel /></div>
          </div>
        ),
      }}
      bottomLeft={{
        category: 'SUPPORT INSTRUMENTATION',
        title: 'LEVELS / FREQUENCY BANDS',
        content: (
          <div style={splitPanelStyle}>
            <div style={levelsSlotStyle}><LevelsPanel /></div>
            <div style={freqSlotStyle}><FrequencyBandsPanel /></div>
          </div>
        ),
      }}
      bottomRight={{
        category: 'SPECTRAL ANATOMY',
        title: 'SPECTROGRAM',
        content: <SpectrogramPanel />,
      }}
    />
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

const oscSlotStyle: React.CSSProperties = {
  flex: '0 0 55%',
  minHeight: 0,
  overflow: 'hidden',
};

const waveScrollSlotStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: 'hidden',
};

const levelsSlotStyle: React.CSSProperties = {
  flex: '0 0 40%',
  minHeight: 0,
  overflow: 'hidden',
};

const freqSlotStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: 'hidden',
};
