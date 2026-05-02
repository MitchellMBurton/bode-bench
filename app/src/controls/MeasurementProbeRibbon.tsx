import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  useAudioEngine,
  useFrameBus,
  useSpectralAnatomyStore,
  useVisualMode,
} from '../core/session';
import { buildLiveMeasurementProbe, type MeasurementProbeSnapshot } from '../runtime/measurementProbe';
import { COLORS, FONTS, MODES } from '../theme';
import type { AudioFrame } from '../types';

interface MeasurementProbeRibbonProps {
  readonly transportTimeS: number | null;
}

const PROBE_UPDATE_INTERVAL_MS = 100;
type ProbeDensity = 'full' | 'compact' | 'tiny';

const FIELD_TIERS: ReadonlyArray<{
  readonly minWidth: number;
  readonly density: ProbeDensity;
  readonly fields: readonly string[];
}> = [
  { minWidth: 650, density: 'full', fields: ['time', 'levels', 'lufs', 'f0', 'centroid', 'band', 'correlation'] },
  { minWidth: 540, density: 'compact', fields: ['time', 'levels', 'lufs', 'f0', 'centroid', 'correlation'] },
  { minWidth: 430, density: 'compact', fields: ['time', 'levels', 'f0', 'centroid', 'correlation'] },
  { minWidth: 330, density: 'compact', fields: ['time', 'levels', 'f0', 'correlation'] },
  { minWidth: 250, density: 'tiny', fields: ['time', 'levels', 'correlation'] },
  { minWidth: 0, density: 'tiny', fields: ['time', 'levels'] },
];

export function MeasurementProbeRibbon({
  transportTimeS,
}: MeasurementProbeRibbonProps): React.ReactElement {
  const audioEngine = useAudioEngine();
  const frameBus = useFrameBus();
  const spectralAnatomy = useSpectralAnatomyStore();
  const visualMode = useVisualMode();
  const mode = MODES[visualMode];
  const wrapRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<AudioFrame | null>(null);
  const transportTimeRef = useRef<number | null>(transportTimeS);
  const lastPublishedAtRef = useRef(0);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [width, setWidth] = useState(520);
  const [snapshot, setSnapshot] = useState<MeasurementProbeSnapshot>(() => (
    buildLiveMeasurementProbe(null, null, transportTimeS)
  ));

  const publishSnapshot = useCallback((): void => {
    lastPublishedAtRef.current = performance.now();
    setSnapshot(buildLiveMeasurementProbe(
      frameRef.current,
      spectralAnatomy.getLatestMomentaryLufs(),
      transportTimeRef.current,
    ));
  }, [spectralAnatomy]);

  const scheduleSnapshot = useCallback((): void => {
    const elapsed = performance.now() - lastPublishedAtRef.current;
    if (elapsed >= PROBE_UPDATE_INTERVAL_MS) {
      if (pendingTimerRef.current !== null) {
        clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
      }
      publishSnapshot();
      return;
    }
    if (pendingTimerRef.current !== null) return;
    pendingTimerRef.current = setTimeout(() => {
      pendingTimerRef.current = null;
      publishSnapshot();
    }, PROBE_UPDATE_INTERVAL_MS - elapsed);
  }, [publishSnapshot]);

  useEffect(() => {
    transportTimeRef.current = transportTimeS;
    scheduleSnapshot();
  }, [scheduleSnapshot, transportTimeS]);

  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const syncWidth = (): void => {
      setWidth(node.getBoundingClientRect().width);
    };
    syncWidth();
    const resizeObserver = new ResizeObserver(syncWidth);
    resizeObserver.observe(node);
    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    const unsubscribeFrame = frameBus.subscribe((frame) => {
      frameRef.current = frame;
      scheduleSnapshot();
    });
    const unsubscribeLoudness = spectralAnatomy.subscribe(scheduleSnapshot);
    const unsubscribeReset = audioEngine.onReset(() => {
      frameRef.current = null;
      scheduleSnapshot();
    });
    return () => {
      unsubscribeFrame();
      unsubscribeLoudness();
      unsubscribeReset();
      if (pendingTimerRef.current !== null) {
        clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
      }
    };
  }, [audioEngine, frameBus, scheduleSnapshot, spectralAnatomy]);

  const visibleFields = useMemo(() => {
    const tier = FIELD_TIERS.find((entry) => width >= entry.minWidth) ?? FIELD_TIERS[FIELD_TIERS.length - 1];
    const allowed = new Set(tier.fields);
    return snapshot.fields
      .filter((field) => allowed.has(field.id))
      .map((field) => ({
        id: field.id,
        text: tier.density === 'full'
          ? field.text
          : tier.density === 'compact'
            ? field.compactText
            : field.tinyText,
        stale: field.text.includes('--'),
      }));
  }, [snapshot.fields, width]);

  return (
    <div
      ref={wrapRef}
      style={probeWrapStyle}
      aria-label={`Measurement probe ${snapshot.fields.map((field) => field.text).join(' | ')}`}
      title={snapshot.fields.map((field) => field.text).join(' | ')}
    >
      <span style={{ ...probeLabelStyle, color: mode.category }}>PROBE</span>
      <div style={probeFieldRailStyle}>
        {visibleFields.map((field, index) => (
          <span key={field.id} style={probeFieldClusterStyle}>
            {index > 0 ? <span style={{ ...probeDividerStyle, color: mode.chromeBorder }}>|</span> : null}
            <span
              style={{
                ...probeFieldStyle,
                color: field.stale ? COLORS.textDim : mode.text,
              }}
            >
              {field.text}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

const probeWrapStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  minWidth: 0,
  height: 24,
  padding: '0 4px',
  boxSizing: 'border-box',
  flex: '1 1 520px',
  overflow: 'hidden',
};

const probeLabelStyle: CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 9,
  letterSpacing: '0.12em',
  flexShrink: 0,
};

const probeFieldRailStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  minWidth: 0,
  overflow: 'visible',
};

const probeFieldClusterStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  minWidth: 0,
  flexShrink: 0,
};

const probeDividerStyle: CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 9,
  opacity: 0.62,
};

const probeFieldStyle: CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 10,
  letterSpacing: '0.04em',
  whiteSpace: 'nowrap',
};
