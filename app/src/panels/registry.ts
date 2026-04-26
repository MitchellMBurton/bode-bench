// ============================================================
// Panel registry — addressable descriptors for all rendered panels.
// Replaces the hardcoded JSX arrays in App.tsx and enables
// future layout features (fullscreen, presets, reorder, DnD).
// ============================================================

import type React from 'react';
import type { Marker } from '../types';

/** Which quadrant column a panel belongs to by default. */
export type PanelColumn = 'top-right' | 'bottom-left' | 'bottom-right';

/** Minimal prop surface shared by all panels. */
export interface PanelProps {
  markers?: readonly Marker[];
}

/** Addressable descriptor for a single analysis panel. */
export interface PanelDescriptor {
  /** Stable identifier — used as React key and for fullscreen/preset lookup. */
  readonly id: string;
  /** Human-readable label for chrome headers and overlays. */
  readonly label: string;
  /** Default quadrant column this panel renders in. */
  readonly defaultColumn: PanelColumn;
  /** The panel component. Panels can ignore the shared overview prop surface if unused. */
  readonly component: React.ComponentType<PanelProps>;
}

// Lazy imports — panel modules are only loaded when the registry is consumed.
import { WaveformOverviewPanel } from './WaveformOverviewPanel';
import { WaveformScrollPanel } from './WaveformScrollPanel';
import { PitchTrackerPanel } from './PitchTrackerPanel';
import { OscilloscopePanel } from './OscilloscopePanel';
import { OscilloscopeScrollPanel } from './OscilloscopeScrollPanel';
import { FrequencyResponsePanel } from './FrequencyResponsePanel';
import { LevelsPanel } from './LevelsPanel';
import { GoniometerPanel } from './GoniometerPanel';
import { FrequencyBandsPanel } from './FrequencyBandsPanel';
import { HarmonicLadderPanel } from './HarmonicLadderPanel';
import { LoudnessHistoryPanel } from './LoudnessHistoryPanel';
import { LoudnessMeterPanel } from './LoudnessMeterPanel';
import { SpectrogramPanel } from './SpectrogramPanel';

export const PANEL_REGISTRY: readonly PanelDescriptor[] = [
  // ── Top-right: Live Diagnostic ──────────────────────────────
  { id: 'overview',    label: 'OVERVIEW',        defaultColumn: 'top-right',    component: WaveformOverviewPanel },
  { id: 'wave-scroll', label: 'WAVEFORM',         defaultColumn: 'top-right',    component: WaveformScrollPanel },
  { id: 'pitch',       label: 'F0 TRACK',         defaultColumn: 'top-right',    component: PitchTrackerPanel },
  { id: 'osc',         label: 'OSCILLOSCOPE',     defaultColumn: 'top-right',    component: OscilloscopePanel },
  { id: 'osc-scroll',  label: 'OSC SCROLL',       defaultColumn: 'top-right',    component: OscilloscopeScrollPanel },
  { id: 'response',    label: 'FREQ RESPONSE',    defaultColumn: 'top-right',    component: FrequencyResponsePanel },
  // ── Bottom-left: Support Instrumentation ────────────────────
  { id: 'levels',      label: 'LEVELS',           defaultColumn: 'bottom-left',  component: LevelsPanel },
  { id: 'gonio',       label: 'GONIOMETER',       defaultColumn: 'bottom-left',  component: GoniometerPanel },
  { id: 'bands',       label: 'FREQ BANDS',       defaultColumn: 'bottom-left',  component: FrequencyBandsPanel },
  { id: 'ladder',      label: 'HARMONICS',        defaultColumn: 'bottom-left',  component: HarmonicLadderPanel },
  // ── Bottom-right: Spectral Anatomy ──────────────────────────
  { id: 'loudness',    label: 'RMS LEVEL',        defaultColumn: 'bottom-right', component: LoudnessHistoryPanel },
  { id: 'lufs',        label: 'LUFS',             defaultColumn: 'bottom-right', component: LoudnessMeterPanel },
  { id: 'spectrogram', label: 'SPECTROGRAM',      defaultColumn: 'bottom-right', component: SpectrogramPanel },
] as const;

// Pre-computed per-column slices — avoids a filter() pass on every render.
const PANELS_BY_COLUMN: Readonly<Record<PanelColumn, readonly PanelDescriptor[]>> = {
  'top-right':    PANEL_REGISTRY.filter((p) => p.defaultColumn === 'top-right'),
  'bottom-left':  PANEL_REGISTRY.filter((p) => p.defaultColumn === 'bottom-left'),
  'bottom-right': PANEL_REGISTRY.filter((p) => p.defaultColumn === 'bottom-right'),
};

/** Return all panels assigned to the given column, in their default order. */
export function panelsForColumn(col: PanelColumn): readonly PanelDescriptor[] {
  return PANELS_BY_COLUMN[col];
}
