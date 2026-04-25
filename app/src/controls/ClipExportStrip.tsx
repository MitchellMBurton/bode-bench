import { useCallback, useEffect, useRef, useState } from 'react';
import type { VisualMode } from '../audio/displayMode';
import {
  useAudioEngine,
  useDerivedMediaSnapshot,
  useDerivedMediaStore,
  useDiagnosticsLog,
} from '../core/session';
import {
  cancelClipExport,
  getClipExportStatus,
  isDesktopRuntime,
  pickClipExportDestination,
  pickSourceMediaFile,
  probeExportTools,
  revealInFolder,
  resolveClipExportOutputPath,
  sourceMediaPathExists,
  startClipExport,
  type ExportToolStatus,
} from '../runtime/desktopExport';
import {
  buildSuggestedClipExportFilename,
  createClipExportJobSpec,
  getQuickClipExportModeDescriptor,
  type SourceKind,
} from '../runtime/exportPresets';
import {
  getRememberedExportFolder,
  getRememberedSourcePath,
  rememberExportFolder,
  rememberSourcePath,
} from '../runtime/exportStorage';
import { CANVAS, COLORS, FONTS, SPACING } from '../theme';
import type { ClipExportTuning, MediaQualityMode, RangeMark } from '../types';
import { formatTransportTime } from '../utils/format';

interface Props {
  sessionFilename: string;
  sessionDurationS: number;
  sourceKind: SourceKind;
  sourcePath: string | null;
  visualMode: VisualMode;
}

interface DockTheme {
  readonly panelBg: string;
  readonly buttonBg: string;
  readonly buttonActiveBg: string;
  readonly border: string;
  readonly accentBorder: string;
  readonly text: string;
  readonly label: string;
  readonly dim: string;
  readonly accent: string;
  readonly ok: string;
}

type ToolState =
  | { kind: 'probing' }
  | ExportToolStatus;

type ExportPhase =
  | { kind: 'idle' }
  | { kind: 'linking-source' }
  | { kind: 'choosing-destination'; qualityMode: MediaQualityMode }
  | {
      kind: 'running';
      recordId: string;
      desktopJobId: string;
      range: RangeMark;
      qualityMode: MediaQualityMode;
      destinationPath: string;
    }
  | { kind: 'failed'; message: string }
  | { kind: 'done'; outputPath: string; qualityMode: MediaQualityMode };

type SaveDirectory = {
  kind: 'remembered' | 'source';
  path: string;
};

type LinkedSource =
  | { kind: 'none' }
  | { kind: 'linked'; path: string }
  | { kind: 'remembered'; path: string }
  | { kind: 'missing'; rememberedPath: string };

type TuningPreference =
  | { kind: 'disabled' }
  | { kind: 'enabled'; sourceSessionKey: string };

type SourceResolution =
  | { kind: 'none' }
  | { kind: 'missing'; rememberedPath: string }
  | {
      kind: 'resolved';
      path: string;
      label: string;
      detail: string;
    };

type Gate =
  | { kind: 'needs-range' }
  | { kind: 'desktop-only' }
  | { kind: 'probing' }
  | { kind: 'missing-tools'; message: string }
  | { kind: 'needs-source' }
  | { kind: 'ready'; saveDirectory: SaveDirectory };

const DOCK_THEMES: Record<VisualMode, DockTheme> = {
  default: {
    panelBg: COLORS.bg1,
    buttonBg: COLORS.bg3,
    buttonActiveBg: COLORS.bg2,
    border: COLORS.border,
    accentBorder: COLORS.borderActive,
    text: COLORS.textPrimary,
    label: COLORS.textCategory,
    dim: COLORS.textDim,
    accent: COLORS.accent,
    ok: COLORS.statusOk,
  },
  amber: {
    panelBg: 'linear-gradient(180deg, rgba(12,8,3,0.99), rgba(20,13,4,0.99))',
    buttonBg: 'rgba(18,12,4,0.94)',
    buttonActiveBg: 'linear-gradient(135deg, rgba(42,24,6,0.98), rgba(68,36,8,0.96))',
    border: 'rgba(102,70,20,0.76)',
    accentBorder: CANVAS.amber.chromeBorderActive,
    text: CANVAS.amber.text,
    label: CANVAS.amber.category,
    dim: 'rgba(212,170,86,0.64)',
    accent: 'rgba(255,176,48,0.96)',
    ok: 'rgba(194,242,154,0.94)',
  },
  optic: {
    panelBg: 'linear-gradient(180deg, rgba(248,251,253,0.99), rgba(238,245,249,0.99))',
    buttonBg: 'rgba(247,250,252,0.96)',
    buttonActiveBg: 'linear-gradient(135deg, rgba(252,254,255,0.99), rgba(231,239,245,0.99))',
    border: 'rgba(109,146,165,0.72)',
    accentBorder: CANVAS.optic.chromeBorderActive,
    text: CANVAS.optic.text,
    label: CANVAS.optic.category,
    dim: 'rgba(63,95,114,0.72)',
    accent: '#117aa5',
    ok: '#1c8f66',
  },
  red: {
    panelBg: 'linear-gradient(180deg, rgba(18,6,7,0.99), rgba(28,9,10,0.99))',
    buttonBg: 'rgba(18,6,7,0.94)',
    buttonActiveBg: 'linear-gradient(135deg, rgba(36,10,11,0.99), rgba(52,14,16,0.99))',
    border: 'rgba(124,40,39,0.72)',
    accentBorder: CANVAS.red.chromeBorderActive,
    text: CANVAS.red.text,
    label: CANVAS.red.category,
    dim: 'rgba(255,186,172,0.72)',
    accent: 'rgba(255,132,116,0.96)',
    ok: 'rgba(124,232,182,0.96)',
  },
  nge: {
    panelBg: COLORS.bg1,
    buttonBg: 'rgba(4,10,4,0.9)',
    buttonActiveBg: 'rgba(20,50,8,0.95)',
    border: 'rgba(60,130,30,0.4)',
    accentBorder: 'rgba(120,200,60,0.72)',
    text: 'rgba(160,230,60,0.9)',
    label: 'rgba(100,180,50,0.7)',
    dim: 'rgba(120,200,60,0.54)',
    accent: 'rgba(160,230,60,0.92)',
    ok: 'rgba(182,244,122,0.96)',
  },
  hyper: {
    panelBg: COLORS.bg1,
    buttonBg: 'rgba(2,5,18,0.9)',
    buttonActiveBg: 'rgba(8,18,52,0.95)',
    border: 'rgba(40,70,180,0.42)',
    accentBorder: 'rgba(98,200,255,0.75)',
    text: 'rgba(210,236,255,0.9)',
    label: 'rgba(112,180,255,0.72)',
    dim: 'rgba(112,180,255,0.54)',
    accent: 'rgba(98,200,255,0.94)',
    ok: 'rgba(138,242,208,0.96)',
  },
  eva: {
    panelBg: COLORS.bg1,
    buttonBg: 'rgba(10,4,20,0.92)',
    buttonActiveBg: 'rgba(28,10,54,0.96)',
    border: 'rgba(120,50,200,0.42)',
    accentBorder: 'rgba(255,123,0,0.76)',
    text: 'rgba(255,210,140,0.92)',
    label: 'rgba(170,90,255,0.7)',
    dim: 'rgba(170,90,255,0.56)',
    accent: 'rgba(255,123,0,0.96)',
    ok: 'rgba(164,242,176,0.96)',
  },
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function readError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  assert(typeof error === 'object' && error !== null, 'desktop command error must be object');
  const { message } = error as { message: unknown };
  assert(typeof message === 'string', 'desktop command error object must include message');
  return message;
}

function getSelectedRange(rangeMarks: readonly RangeMark[], selectedRangeId: number | null): RangeMark | null {
  if (selectedRangeId === null) {
    return null;
  }
  const selectedRange = rangeMarks.find((rangeMark) => rangeMark.id === selectedRangeId);
  assert(selectedRange, 'selected range is missing');
  return selectedRange;
}

function getParentFolder(path: string): string {
  const slashIndex = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  assert(slashIndex > 0, 'path must include a parent folder');
  return path.slice(0, slashIndex);
}

function getPreferredSaveDirectory(sourcePath: string): SaveDirectory {
  const remembered = getRememberedExportFolder();
  if (remembered) {
    return { path: remembered, kind: 'remembered' };
  }
  return { path: getParentFolder(sourcePath), kind: 'source' };
}

function getSourceResolution(sourcePath: string | null, linkedSource: LinkedSource): SourceResolution {
  if (sourcePath) {
    return {
      kind: 'resolved',
      path: sourcePath,
      label: 'OPENED FILE',
      detail: 'Export will use the file you opened.',
    };
  }

  switch (linkedSource.kind) {
    case 'none':
      return linkedSource;
    case 'missing':
      return linkedSource;
    case 'linked':
      return {
        kind: 'resolved',
        path: linkedSource.path,
        label: 'LINKED THIS SESSION',
        detail: 'Export will use the original file you linked for this session.',
      };
    case 'remembered':
      return {
        kind: 'resolved',
        path: linkedSource.path,
        label: 'AUTO-RELINKED',
        detail: 'Export recovered the last original file you linked for this clip.',
      };
    default: {
      const _exhaustive: never = linkedSource;
      return _exhaustive;
    }
  }
}

function getRangeDuration(range: RangeMark | null): string {
  return range ? formatTransportTime(range.endS - range.startS) : '--:--.-';
}

function getStartFailureMessage(message: string): string {
  if (message === 'Only one clip export can run at a time in this simplified workflow.') {
    return 'Another export is still in progress. Wait for it to finish or cancel it before starting a new one.';
  }
  return message;
}

function formatTuningRate(value: number): string {
  return `${value.toFixed(2)}x`;
}

function formatTuningPitch(value: number): string {
  const rounded = Math.round(value);
  const prefix = rounded > 0 ? '+' : '';
  return `${prefix}${rounded} st`;
}

function buildTuningSummary(tuning: ClipExportTuning): string {
  return `VOL ${Math.round(tuning.volume * 100)} / RATE ${formatTuningRate(tuning.playbackRate)} / PITCH ${formatTuningPitch(tuning.pitchSemitones)}`;
}

function getTuningSnapshot(options: {
  enabled: boolean;
  volume: number;
  playbackRate: number;
  pitchSemitones: number;
  pitchAvailable: boolean;
}): ClipExportTuning | null {
  if (!options.enabled) {
    return null;
  }

  return {
    volume: options.volume,
    playbackRate: options.playbackRate,
    pitchSemitones: options.pitchAvailable ? options.pitchSemitones : 0,
  };
}

function isTuningEnabled(preference: TuningPreference, sourceSessionKey: string): boolean {
  return preference.kind === 'enabled' && preference.sourceSessionKey === sourceSessionKey;
}

function formatElapsedCompact(ms: number): string {
  const totalS = Math.floor(ms / 1000);
  const m = Math.floor(totalS / 60);
  const s = totalS % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getPathLeaf(path: string): string {
  const slashIndex = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return slashIndex >= 0 ? path.slice(slashIndex + 1) : path;
}

function getPathParent(path: string): string | null {
  const slashIndex = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  if (slashIndex <= 0) {
    return null;
  }
  return path.slice(0, slashIndex);
}

export function ClipExportStrip({
  sessionFilename,
  sessionDurationS,
  sourceKind,
  sourcePath,
  visualMode,
}: Props): React.ReactElement {
  const desktopRuntime = isDesktopRuntime();
  const audioEngine = useAudioEngine();
  const derivedMedia = useDerivedMediaStore();
  const snapshot = useDerivedMediaSnapshot();
  const diagnosticsLog = useDiagnosticsLog();
  const theme = DOCK_THEMES[visualMode];
  const selectedRange = getSelectedRange(snapshot.rangeMarks, snapshot.selectedRangeId);
  const sourceSessionKey = `${sourceKind}:${sessionFilename}:${sessionDurationS.toFixed(3)}`;
  const [tools, setTools] = useState<ToolState>({ kind: 'probing' });
  const [phase, setPhase] = useState<ExportPhase>({ kind: 'idle' });
  const [linkedSource, setLinkedSource] = useState<LinkedSource>({ kind: 'none' });
  const [tuningPreference, setTuningPreference] = useState<TuningPreference>({ kind: 'disabled' });
  const [runningProgress, setRunningProgress] = useState<{ percent: number; message: string; elapsedMs: number } | null>(null);
  const exportStartedAtRef = useRef(0);
  const [transportTuning, setTransportTuning] = useState(() => ({
    volume: audioEngine.volume,
    playbackRate: audioEngine.playbackRate,
    pitchSemitones: audioEngine.pitchSemitones,
    pitchAvailable: true,
  }));
  const sourceResolution = getSourceResolution(sourcePath, linkedSource);
  const effectiveSourcePath = sourceResolution.kind === 'resolved' ? sourceResolution.path : null;
  const includeCurrentTuning = isTuningEnabled(tuningPreference, sourceSessionKey);

  useEffect(() => {
    if (!desktopRuntime) {
      return;
    }

    let cancelled = false;
    void probeExportTools().then((nextTools) => {
      if (!cancelled) {
        setTools(nextTools);
      }
    }).catch((error: unknown) => {
      if (!cancelled) {
        setTools({
          kind: 'missing',
          reason: readError(error),
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [desktopRuntime]);

  useEffect(() => {
    return audioEngine.onTransport((state) => {
      setTransportTuning((previous) => {
        if (
          Math.abs(previous.volume - state.volume) < 0.0001 &&
          Math.abs(previous.playbackRate - state.playbackRate) < 0.0001 &&
          Math.abs(previous.pitchSemitones - state.pitchSemitones) < 0.0001 &&
          previous.pitchAvailable === state.pitchShiftAvailable
        ) {
          return previous;
        }

        return {
          volume: state.volume,
          playbackRate: state.playbackRate,
          pitchSemitones: state.pitchSemitones,
          pitchAvailable: state.pitchShiftAvailable,
        };
      });
    });
  }, [audioEngine]);

  useEffect(() => {
    return audioEngine.onReset(() => {
      setTuningPreference({ kind: 'disabled' });
    });
  }, [audioEngine]);

  useEffect(() => {
    if (!sourcePath || sessionDurationS <= 0) {
      return;
    }
    rememberSourcePath(sessionFilename, sessionDurationS, sourcePath);
  }, [sessionDurationS, sessionFilename, sourcePath]);

  useEffect(() => {
    if (!desktopRuntime || sessionDurationS <= 0 || sourcePath) {
      return;
    }

    const rememberedPath = getRememberedSourcePath(sessionFilename, sessionDurationS);
    if (!rememberedPath) {
      return;
    }

    let cancelled = false;
    void sourceMediaPathExists(rememberedPath).then((exists) => {
      if (cancelled) {
        return;
      }
      if (exists) {
        setLinkedSource({ kind: 'remembered', path: rememberedPath });
        diagnosticsLog.push(`export source recovered ${rememberedPath}`, 'dim', 'transport');
        return;
      }
      setLinkedSource({ kind: 'missing', rememberedPath });
      diagnosticsLog.push(`export source missing ${rememberedPath}`, 'warn', 'transport');
    }).catch((error: unknown) => {
      if (cancelled) {
        return;
      }
      const message = readError(error);
      diagnosticsLog.push(`export source lookup failed ${message}`, 'warn', 'transport');
      setLinkedSource({ kind: 'missing', rememberedPath });
    });

    return () => {
      cancelled = true;
    };
  }, [desktopRuntime, diagnosticsLog, sessionDurationS, sessionFilename, sourcePath]);

  useEffect(() => {
    if (phase.kind !== 'running') {
      exportStartedAtRef.current = 0;
      return;
    }

    exportStartedAtRef.current = Date.now();
    let cancelled = false;
    let timer = 0;

    const poll = async (): Promise<void> => {
      try {
        const status = await getClipExportStatus(phase.desktopJobId);
        if (cancelled) {
          return;
        }

        switch (status.status) {
          case 'queued':
          case 'running':
            derivedMedia.markJobRunning(phase.recordId, status.progressPercent, status.message);
            setRunningProgress({ percent: status.progressPercent, message: status.message, elapsedMs: Date.now() - exportStartedAtRef.current });
            timer = window.setTimeout(() => {
              void poll();
            }, 350);
            return;
          case 'completed':
            setRunningProgress(null);
            rememberExportFolder(resolveClipExportOutputPath(status.outputPath, phase.destinationPath));
            derivedMedia.completeJob(phase.recordId, {
              artifacts: [
                {
                  id: `${phase.recordId}-media`,
                  role: 'media',
                  path: resolveClipExportOutputPath(status.outputPath, phase.destinationPath),
                  sha256: null,
                  createdAtMs: Date.now(),
                },
              ],
              metrics: {
                durationS: phase.range.endS - phase.range.startS,
              },
            });
            diagnosticsLog.push(
              `export complete ${resolveClipExportOutputPath(status.outputPath, phase.destinationPath)}`,
              'info',
              'transport',
            );
            setPhase({
              kind: 'done',
              outputPath: resolveClipExportOutputPath(status.outputPath, phase.destinationPath),
              qualityMode: phase.qualityMode,
            });
            return;
          case 'failed': {
            setRunningProgress(null);
            const message = phase.qualityMode === 'copy-fast' && sourceKind === 'audio'
              ? `${status.errorText} Retry with Export Master if source-copy compatibility is a problem.`
              : status.errorText;
            derivedMedia.failJob(phase.recordId, message);
            diagnosticsLog.push(`export failed ${status.errorText}`, 'warn', 'transport');
            setPhase({ kind: 'failed', message });
            return;
          }
          case 'canceled':
            setRunningProgress(null);
            derivedMedia.cancelJob(phase.recordId);
            diagnosticsLog.push('export canceled', 'dim', 'transport');
            setPhase({ kind: 'idle' });
            return;
          default: {
            const _exhaustive: never = status;
            return _exhaustive;
          }
        }
      } catch (error) {
        setRunningProgress(null);
        const message = readError(error);
        derivedMedia.failJob(phase.recordId, message);
        diagnosticsLog.push(`export poll failed ${message}`, 'warn', 'transport');
        setPhase({ kind: 'failed', message });
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, [derivedMedia, diagnosticsLog, phase, sourceKind]);

  const onAuditionRange = useCallback(() => {
    if (!selectedRange) {
      return;
    }
    audioEngine.setLoop(selectedRange.startS, selectedRange.endS);
    audioEngine.seek(selectedRange.startS);
    diagnosticsLog.push(
      `loop audition ${selectedRange.label} ${formatTransportTime(selectedRange.startS)} -> ${formatTransportTime(selectedRange.endS)}`,
      'info',
      'transport',
    );
  }, [audioEngine, diagnosticsLog, selectedRange]);

  const onResolveSource = useCallback(async () => {
    if (!desktopRuntime) {
      setPhase({ kind: 'failed', message: 'Source relinking is available in the desktop runtime.' });
      return;
    }
    try {
      setPhase({ kind: 'linking-source' });
      const sourceFile = await pickSourceMediaFile({
        filename: sessionFilename,
        sourceKind,
      });
      if (sourceFile.kind === 'canceled') {
        setPhase({ kind: 'idle' });
        return;
      }
      assert(sessionDurationS > 0, 'session duration must be positive');
      rememberSourcePath(sessionFilename, sessionDurationS, sourceFile.path);
      setLinkedSource({ kind: 'linked', path: sourceFile.path });
      diagnosticsLog.push(`export source linked ${sourceFile.path}`, 'info', 'transport');
      setPhase({ kind: 'idle' });
    } catch (error) {
      const message = readError(error);
      diagnosticsLog.push(`export source link failed ${message}`, 'warn', 'transport');
      setPhase({ kind: 'failed', message });
    }
  }, [desktopRuntime, diagnosticsLog, sessionDurationS, sessionFilename, sourceKind]);

  const onStartExport = async (qualityMode: MediaQualityMode): Promise<void> => {
    if (phase.kind === 'linking-source' || phase.kind === 'choosing-destination' || phase.kind === 'running') {
      return;
    }
    if (!selectedRange) {
      setPhase({ kind: 'failed', message: 'Set a review range in REVIEW or with I / O' });
      return;
    }
    if (!desktopRuntime) {
      setPhase({ kind: 'failed', message: 'Clip export is available in the desktop runtime.' });
      return;
    }
    switch (tools.kind) {
      case 'probing':
        setPhase({ kind: 'failed', message: 'Checking ffmpeg...' });
        return;
      case 'missing':
        setPhase({ kind: 'failed', message: tools.reason });
        return;
      case 'ready':
        break;
      default: {
        const _exhaustive: never = tools;
        return _exhaustive;
      }
    }

    assert(sessionDurationS > 0, 'session duration must be positive');
    if (!effectiveSourcePath) {
      setPhase({ kind: 'failed', message: 'Locate the original source file to unlock export.' });
      return;
    }
    if (includeCurrentTuning && sourceKind === 'audio' && qualityMode === 'copy-fast') {
      setPhase({ kind: 'failed', message: 'FAST COPY is unavailable when Include current tuning is enabled. Use EXACT MASTER for tuned audio exports.' });
      return;
    }

    let recordId: string | null = null;

    try {
      setPhase({ kind: 'choosing-destination', qualityMode });
      const destination = await pickClipExportDestination({
        defaultDirectory: getPreferredSaveDirectory(effectiveSourcePath).path,
        defaultFileName: buildSuggestedClipExportFilename({
          filename: sessionFilename,
          range: selectedRange,
          sourceKind,
          qualityMode,
          tuned: includeCurrentTuning,
        }),
        sourceKind,
        qualityMode,
      });
      if (destination.kind === 'canceled') {
        setPhase({ kind: 'idle' });
        return;
      }

      const tuningSnapshot = getTuningSnapshot({
        enabled: includeCurrentTuning,
        volume: audioEngine.volume,
        playbackRate: audioEngine.playbackRate,
        pitchSemitones: audioEngine.pitchSemitones,
        pitchAvailable: transportTuning.pitchAvailable,
      });

      const job = derivedMedia.enqueueJob(createClipExportJobSpec({
        filename: sessionFilename,
        durationS: sessionDurationS,
        range: selectedRange,
        sourceKind,
        qualityMode,
        tuning: tuningSnapshot,
      }));
      recordId = job.id;

      const { jobId } = await startClipExport({
        sourcePath: effectiveSourcePath,
        sourceKind,
        startS: selectedRange.startS,
        endS: selectedRange.endS,
        qualityMode,
        destinationPath: destination.path,
        tuning: tuningSnapshot,
      });

      derivedMedia.markJobRunning(job.id, 0, `Exporting ${selectedRange.label}...`);
      const mode = getQuickClipExportModeDescriptor(sourceKind, qualityMode);
      diagnosticsLog.push(
        `export start ${selectedRange.label} ${mode.statusToken.toLowerCase()}${tuningSnapshot ? ` tuned ${buildTuningSummary(tuningSnapshot)}` : ''} -> ${destination.path}`,
        'info',
        'transport',
      );
      setPhase({
        kind: 'running',
        recordId: job.id,
        desktopJobId: jobId,
        range: selectedRange,
        qualityMode,
        destinationPath: destination.path,
      });
    } catch (error) {
      const message = getStartFailureMessage(readError(error));
      if (recordId) {
        derivedMedia.failJob(recordId, message);
      }
      diagnosticsLog.push(`export start failed ${message}`, 'warn', 'transport');
      setPhase({ kind: 'failed', message });
    }
  };

  const onCancelExport = useCallback(async () => {
    if (phase.kind !== 'running') {
      return;
    }
    try {
      await cancelClipExport(phase.desktopJobId);
    } catch (error) {
      const message = readError(error);
      diagnosticsLog.push(`export cancel failed ${message}`, 'warn', 'transport');
      setPhase({ kind: 'failed', message });
    }
  }, [diagnosticsLog, phase]);

  const onRevealOutput = useCallback(() => {
    if (phase.kind !== 'done') {
      return;
    }
    void revealInFolder(phase.outputPath).catch((error: unknown) => {
      const message = readError(error);
      diagnosticsLog.push(`export reveal failed ${message}`, 'warn', 'transport');
      setPhase({ kind: 'failed', message });
    });
  }, [diagnosticsLog, phase]);

  let gate: Gate;
  if (!selectedRange) {
    gate = { kind: 'needs-range' };
  } else if (!desktopRuntime) {
    gate = { kind: 'desktop-only' };
  } else {
    switch (tools.kind) {
      case 'probing':
        gate = { kind: 'probing' };
        break;
      case 'missing':
        gate = { kind: 'missing-tools', message: tools.reason };
        break;
      case 'ready':
        gate = effectiveSourcePath
          ? { kind: 'ready', saveDirectory: getPreferredSaveDirectory(effectiveSourcePath) }
          : { kind: 'needs-source' };
        break;
      default: {
        const _exhaustive: never = tools;
        gate = _exhaustive;
      }
    }
  }

  const exportBusy =
    phase.kind === 'linking-source' ||
    phase.kind === 'choosing-destination' ||
    phase.kind === 'running';
  const exportDisabled = gate.kind !== 'ready' || exportBusy;
  const tuningDisabled = exportBusy || gate.kind !== 'ready';
  const tunedAudioFastDisabled = includeCurrentTuning && sourceKind === 'audio';
  const tuningSnapshotPreview = getTuningSnapshot({
    enabled: includeCurrentTuning,
    volume: transportTuning.volume,
    playbackRate: transportTuning.playbackRate,
    pitchSemitones: transportTuning.pitchSemitones,
    pitchAvailable: transportTuning.pitchAvailable,
  });
  const activeQualityMode =
    phase.kind === 'choosing-destination' || phase.kind === 'running' || phase.kind === 'done'
      ? phase.qualityMode
      : null;

  let readinessLabel = 'READY';
  switch (phase.kind) {
    case 'idle':
      switch (gate.kind) {
        case 'needs-range':
          readinessLabel = 'RANGE NEEDED';
          break;
        case 'desktop-only':
          readinessLabel = 'DESKTOP ONLY';
          break;
        case 'probing':
          readinessLabel = 'CHECKING TOOLS';
          break;
        case 'missing-tools':
          readinessLabel = 'UNAVAILABLE';
          break;
        case 'needs-source':
          readinessLabel = sourceResolution.kind === 'missing' ? 'SOURCE MOVED' : 'LINK SOURCE';
          break;
        case 'ready':
          readinessLabel = 'READY';
          break;
        default: {
          const _exhaustive: never = gate;
          readinessLabel = _exhaustive;
        }
      }
      break;
    case 'linking-source':
      readinessLabel = 'LINKING';
      break;
    case 'choosing-destination':
      readinessLabel = 'SAVE AS';
      break;
    case 'running': {
      const modeToken = getQuickClipExportModeDescriptor(sourceKind, activeQualityMode ?? 'exact-master').statusToken;
      readinessLabel = runningProgress && runningProgress.percent > 0
        ? `EXPORTING ${modeToken} ${runningProgress.percent.toFixed(0)}%`
        : `EXPORTING ${modeToken}`;
      break;
    }
    case 'done':
      readinessLabel = 'EXPORTED';
      break;
    case 'failed':
      readinessLabel = 'EXPORT ERROR';
      break;
    default: {
      const _exhaustive: never = phase;
      readinessLabel = _exhaustive;
    }
  }

  let progressTimeLabel: string | null = null;
  if (runningProgress) {
    const elapsed = formatElapsedCompact(runningProgress.elapsedMs);
    if (runningProgress.percent > 1) {
      const totalEstMs = (runningProgress.elapsedMs / runningProgress.percent) * 100;
      const remainMs = Math.max(0, totalEstMs - runningProgress.elapsedMs);
      progressTimeLabel = `${elapsed} ELAPSED / ~${formatElapsedCompact(remainMs)} LEFT`;
    } else {
      progressTimeLabel = `${elapsed} ELAPSED`;
    }
  }

  const readySaveDirectory = gate.kind === 'ready' ? gate.saveDirectory : null;
  const sourceActionLabel = readySaveDirectory ? 'CHANGE SOURCE' : 'LINK ORIGINAL FILE';
  const showStatusPanel = phase.kind !== 'idle';
  const resolvedSource = readySaveDirectory && sourceResolution.kind === 'resolved' ? sourceResolution : null;
  const quietNeedsRange = phase.kind === 'idle' && gate.kind === 'needs-range';
  const qualityModes =
    sourceKind === 'video'
      ? (['exact-master', 'copy-fast'] as const)
      : tunedAudioFastDisabled
        ? (['exact-master', 'copy-fast'] as const)
        : (['copy-fast', 'exact-master'] as const);

  let guidance: {
    title: string;
    detail: string;
    tone: string;
    actionLabel: string | null;
    path: string | null;
  } | null = null;
  switch (gate.kind) {
    case 'needs-range':
      guidance = {
        title: 'SELECT A SAVED RANGE',
        detail: 'Commit a range in REVIEW, then export it here.',
        tone: theme.dim,
        actionLabel: null,
        path: null,
      };
      break;
    case 'desktop-only':
      guidance = {
        title: 'DESKTOP EXPORT ONLY',
        detail: 'Use the installed desktop app to export clips.',
        tone: theme.dim,
        actionLabel: null,
        path: null,
      };
      break;
    case 'probing':
      guidance = {
        title: 'CHECKING EXPORT TOOLS',
        detail: 'Looking for ffmpeg and ffprobe...',
        tone: theme.accent,
        actionLabel: null,
        path: null,
      };
      break;
    case 'missing-tools':
      guidance = {
        title: 'EXPORT TOOLS UNAVAILABLE',
        detail: gate.message,
        tone: COLORS.statusErr,
        actionLabel: null,
        path: null,
      };
      break;
    case 'needs-source':
      assert(sourceResolution.kind === 'none' || sourceResolution.kind === 'missing', 'source must be unresolved');
      if (sourceResolution.kind === 'missing') {
        guidance = {
          title: 'LAST SOURCE PATH IS GONE',
          detail: 'We looked in the last known original location and did not find the file there. Link it again to continue.',
          tone: COLORS.statusWarn,
          actionLabel: sourceActionLabel,
          path: sourceResolution.rememberedPath,
        };
        break;
      }
      guidance = {
        title: 'LINK ORIGINAL FILE ONCE',
        detail: 'This load did not include a usable disk path. Link the original file once and this clip will reopen export-ready next time.',
        tone: theme.accent,
        actionLabel: sourceActionLabel,
        path: null,
      };
      break;
    case 'ready':
      guidance = null;
      break;
    default: {
      const _exhaustive: never = gate;
      guidance = _exhaustive;
    }
  }

  let status: { tone: string; text: string; path: string | null };
  switch (phase.kind) {
    case 'idle':
      status = { tone: theme.dim, text: '', path: null };
      break;
    case 'linking-source':
      status = {
        tone: theme.accent,
        text: 'Locate the original media file once. The app will remember it for this clip and go straight to Save As after that.',
        path: null,
      };
      break;
    case 'choosing-destination':
      {
        const mode = getQuickClipExportModeDescriptor(sourceKind, phase.qualityMode);
        status = {
          tone: theme.accent,
          text: `Save As is open for ${mode.title}. Choose the folder and file name to continue.`,
          path: null,
        };
      }
      break;
    case 'running':
      {
        const mode = getQuickClipExportModeDescriptor(sourceKind, phase.qualityMode);
        status = {
          tone: theme.accent,
          text: runningProgress?.message ?? `Exporting ${mode.title}...`,
          path: phase.destinationPath,
        };
      }
      break;
    case 'failed':
      status = { tone: COLORS.statusErr, text: phase.message, path: null };
      break;
    case 'done':
      {
        const mode = getQuickClipExportModeDescriptor(sourceKind, phase.qualityMode);
        status = {
          tone: theme.ok,
          text: `${mode.title} complete.`,
          path: phase.outputPath,
        };
      }
      break;
    default: {
      const _exhaustive: never = phase;
      status = _exhaustive;
    }
  }

  return (
    <div style={{ ...wrapStyle, background: theme.panelBg, borderColor: theme.border }}>
      <div style={headerRowStyle}>
        <div style={titleClusterStyle}>
          <div style={{ ...eyebrowStyle, color: theme.label }}>CLIP EXPORT</div>
          <div style={summaryClusterStyle}>
            <div style={{ ...metricBlockStyle, minWidth: 78 }}>
              <span style={{ ...metricLabelStyle, color: theme.label }}>CLIP</span>
              <span style={{ ...metricValueStyle, color: selectedRange ? theme.text : theme.dim }}>
                {selectedRange ? selectedRange.label : 'NO RANGE'}
              </span>
            </div>
            <div style={metricBlockStyle}>
              <span style={{ ...metricLabelStyle, color: theme.label }}>START</span>
              <span style={{ ...metricValueStyle, color: selectedRange ? theme.text : theme.dim }}>
                {selectedRange ? formatTransportTime(selectedRange.startS) : '--:--.-'}
              </span>
            </div>
            <div style={metricBlockStyle}>
              <span style={{ ...metricLabelStyle, color: theme.label }}>END</span>
              <span style={{ ...metricValueStyle, color: selectedRange ? theme.text : theme.dim }}>
                {selectedRange ? formatTransportTime(selectedRange.endS) : '--:--.-'}
              </span>
            </div>
            <div style={metricBlockStyle}>
              <span style={{ ...metricLabelStyle, color: theme.label }}>LEN</span>
              <span style={{ ...metricValueStyle, color: selectedRange ? theme.accent : theme.dim }}>
                {getRangeDuration(selectedRange)}
              </span>
            </div>
          </div>
        </div>
        <div style={badgeRowStyle}>
          <span style={{ ...badgeStyle, borderColor: theme.border, color: theme.text }}>{sourceKind.toUpperCase()}</span>
          <span style={{ ...badgeStyle, borderColor: theme.accentBorder, color: theme.accent }}>
            {readinessLabel}
          </span>
        </div>
      </div>

      {quietNeedsRange ? (
        <div style={{ ...quietEmptyStateStyle, borderColor: theme.border, color: theme.dim }}>
          Commit a range in REVIEW, then export it here.
        </div>
      ) : null}

      {guidance && !quietNeedsRange ? (
        <div style={{ ...guidancePanelStyle, borderColor: guidance.tone === COLORS.statusErr ? COLORS.statusErr : theme.border }}>
          <div style={{ ...metricLabelStyle, color: theme.label }}>NEXT STEP</div>
          <div style={{ ...statusValueStyle, color: guidance.tone }}>{guidance.title}</div>
          <div style={{ ...detailTextStyle, color: theme.dim }}>{guidance.detail}</div>
          {guidance.path ? (
            <div style={{ ...pathTextStyle, color: guidance.tone }}>{guidance.path}</div>
          ) : null}
          {guidance.actionLabel ? (
            <div style={actionRowStyle}>
              <button
                type="button"
                style={{
                  ...actionButtonStyle,
                  color: exportBusy ? theme.dim : theme.text,
                  borderColor: exportBusy ? theme.border : theme.accentBorder,
                  background: exportBusy ? theme.buttonBg : theme.buttonActiveBg,
                }}
                disabled={exportBusy}
                onClick={() => void onResolveSource()}
                title="Locate or relink the original source file used for export"
                data-shell-interactive="true"
              >
                {guidance.actionLabel}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {readySaveDirectory && resolvedSource ? (
        <>
          <div style={{ ...sourceBarStyle, borderColor: theme.border }} title={effectiveSourcePath ?? undefined}>
            <div style={sourceMetaGridStyle}>
              <div style={sourceMetaStyle}>
                <span style={{ ...metricLabelStyle, color: theme.label }}>SOURCE</span>
                <span style={{ ...metricValueStyle, color: theme.accent }}>{resolvedSource.label}</span>
                <div style={{ ...detailTextStyle, color: theme.dim }}>{resolvedSource.detail}</div>
                <div style={{ ...pathTextStyle, color: theme.dim }}>{resolvedSource.path}</div>
              </div>

              <div style={sourceMetaStyle}>
                <span style={{ ...metricLabelStyle, color: theme.label }}>SAVE AS</span>
                <span style={{ ...metricValueStyle, color: theme.ok }}>
                  {readySaveDirectory.kind === 'remembered' ? 'LAST EXPORT FOLDER' : 'SOURCE FOLDER'}
                </span>
                <div style={{ ...detailTextStyle, color: theme.dim }}>
                  {readySaveDirectory.kind === 'remembered'
                    ? 'New exports start in the folder you used last.'
                    : 'New exports start beside the original media file.'}
                </div>
                <div style={{ ...pathTextStyle, color: theme.dim }}>{readySaveDirectory.path}</div>
              </div>
            </div>
            <button
              type="button"
              style={{ ...actionButtonStyle, color: exportBusy ? theme.dim : theme.text, borderColor: theme.border, background: theme.buttonBg }}
              disabled={exportBusy}
              onClick={() => void onResolveSource()}
              title="Choose a different original source file"
              data-shell-interactive="true"
            >
              {sourceActionLabel}
            </button>
          </div>

          <div style={modeGridStyle}>
            {qualityModes.map((qualityMode) => {
                const mode = getQuickClipExportModeDescriptor(sourceKind, qualityMode);
                const active = activeQualityMode === qualityMode;
                const modeDisabled = exportDisabled || (qualityMode === 'copy-fast' && tunedAudioFastDisabled);
                const buttonLabel = exportBusy && active
                  ? phase.kind === 'choosing-destination'
                    ? 'SAVE AS...'
                    : runningProgress && runningProgress.percent > 0
                      ? `EXPORT ${runningProgress.percent.toFixed(0)}%`
                      : `EXPORTING ${mode.statusToken}`
                  : mode.buttonLabel;

              return (
                <div
                  key={qualityMode}
                  style={{
                    ...modeCardStyle,
                    borderColor: active ? theme.accentBorder : theme.border,
                    background: active ? theme.buttonActiveBg : theme.buttonBg,
                  }}
                >
                  <div style={modeHeaderStyle}>
                    <span style={{ ...modeTitleStyle, color: theme.text }}>{mode.title}</span>
                  </div>
                  <div style={{ ...modeSummaryStyle, color: theme.text }}>{mode.summary}</div>
                  <div style={{ ...modeDetailStyle, color: qualityMode === 'copy-fast' && tunedAudioFastDisabled ? COLORS.statusWarn : theme.dim }}>
                    {qualityMode === 'copy-fast' && tunedAudioFastDisabled
                      ? 'Unavailable while Include current tuning is enabled for audio. Use EXACT MASTER.'
                      : includeCurrentTuning
                        ? `${mode.detail} Applies current VOL / RATE / PITCH during export.`
                        : mode.detail}
                  </div>
                  <button
                    type="button"
                    style={{
                      ...actionButtonStyle,
                      color: modeDisabled ? theme.dim : theme.text,
                      borderColor: modeDisabled ? theme.border : active ? theme.accentBorder : theme.border,
                      background: modeDisabled ? theme.buttonBg : theme.buttonActiveBg,
                    }}
                    disabled={modeDisabled}
                    onClick={() => void onStartExport(qualityMode)}
                    title={qualityMode === 'copy-fast'
                      ? sourceKind === 'video'
                        ? includeCurrentTuning
                          ? 'Quick accurate MP4 export with current tuning applied'
                          : 'Quick accurate MP4 export for review and sharing'
                        : includeCurrentTuning
                          ? 'FAST COPY is unavailable when Include current tuning is enabled'
                          : 'Quick stream-copy export when possible'
                      : 'Highest-quality accurate export'}
                    data-shell-interactive="true"
                  >
                    {buttonLabel}
                  </button>
                </div>
              );
            })}
          </div>

          <div style={{ ...tuningPanelStyle, borderColor: theme.border, background: theme.buttonBg }}>
            <div style={tuningHeaderStyle}>
              <span style={{ ...metricLabelStyle, color: theme.label }}>EXPORT OPTIONS</span>
              <button
                type="button"
                style={{
                  ...toggleButtonStyle,
                  color: tuningDisabled ? theme.dim : theme.text,
                  borderColor: includeCurrentTuning ? theme.accentBorder : theme.border,
                  background: includeCurrentTuning ? theme.buttonActiveBg : theme.buttonBg,
                  opacity: tuningDisabled ? 0.7 : 1,
                }}
                disabled={tuningDisabled}
                onClick={() => {
                  setTuningPreference((previous) =>
                    isTuningEnabled(previous, sourceSessionKey)
                      ? { kind: 'disabled' }
                      : { kind: 'enabled', sourceSessionKey },
                  );
                  setPhase((prevPhase) => (prevPhase.kind === 'failed' ? { kind: 'idle' } : prevPhase));
                }}
                title="Bake the current VOL, RATE, and PITCH settings into the export"
                data-shell-interactive="true"
              >
                {includeCurrentTuning ? 'ON' : 'OFF'}  INCLUDE CURRENT TUNING
              </button>
            </div>
            <div style={{ ...detailTextStyle, color: includeCurrentTuning ? theme.text : theme.dim }}>
              {tuningSnapshotPreview
                ? `${buildTuningSummary(tuningSnapshotPreview)}${transportTuning.pitchAvailable ? '' : ' / PITCH LOCKED TO 0 ST IN THIS RUNTIME'}`
                : 'Exports use the original saved range audio unless you opt in to bake the current VOL / RATE / PITCH settings.'}
            </div>
            {tunedAudioFastDisabled ? (
              <div style={{ ...detailTextStyle, color: COLORS.statusWarn }}>
                Tuned audio export requires EXACT MASTER because FAST COPY cannot apply processing.
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      <div style={actionRowStyle}>
        <button
          type="button"
          style={{ ...actionButtonStyle, color: selectedRange ? theme.text : theme.dim, borderColor: theme.border, background: theme.buttonBg }}
          disabled={!selectedRange}
          onClick={onAuditionRange}
          title="Audition the selected clip by looping it"
          data-shell-interactive="true"
        >
          PREVIEW CLIP
        </button>
        {phase.kind === 'running' ? (
          <button
            type="button"
            style={{ ...actionButtonStyle, color: theme.text, borderColor: theme.border, background: theme.buttonBg }}
            onClick={() => void onCancelExport()}
            title="Cancel the current export"
            data-shell-interactive="true"
          >
            CANCEL
          </button>
        ) : null}
        {phase.kind === 'done' ? (
          <button
            type="button"
            style={{ ...actionButtonStyle, color: theme.text, borderColor: theme.border, background: theme.buttonBg }}
            onClick={onRevealOutput}
            title="Reveal the last exported clip in its folder"
            data-shell-interactive="true"
          >
            REVEAL IN FOLDER
          </button>
        ) : null}
      </div>

      {showStatusPanel ? (
        <div style={{ ...statusPanelStyle, borderColor: phase.kind === 'failed' ? COLORS.statusErr : theme.border }}>
          <div style={statusHeaderStyle}>
            <span style={{ ...metricLabelStyle, color: theme.label }}>STATUS</span>
            <span style={{ ...metricLabelStyle, color: theme.dim }}>
              {exportBusy ? 'WORKING' : phase.kind === 'done' ? 'COMPLETE' : phase.kind === 'failed' ? 'EXPORT ERROR' : 'CHECK STATUS'}
            </span>
          </div>
          {phase.kind === 'running' && runningProgress !== null ? (
            <div style={progressContainerStyle}>
              <div style={{ ...progressTrackStyle, background: theme.border }}>
                <div style={{
                  height: '100%',
                  width: `${runningProgress.percent}%`,
                  background: theme.accent,
                  transition: 'width 0.3s linear',
                }} />
              </div>
              <div style={progressMetricsStyle}>
                <span style={{ ...progressMetricStyle, color: theme.accent }}>
                  {runningProgress.percent.toFixed(1)}%
                </span>
                <span style={{ ...progressMetricStyle, color: theme.dim }}>
                  {progressTimeLabel}
                </span>
              </div>
            </div>
          ) : null}
          <div style={{ ...statusValueStyle, color: status.tone }}>{status.text}</div>
          {status.path ? (
            <div style={statusPathBlockStyle}>
              <div style={{ ...pathLeafStyle, color: phase.kind === 'done' ? theme.ok : theme.text }} title={status.path}>
                {getPathLeaf(status.path)}
              </div>
              {getPathParent(status.path) ? (
                <div style={{ ...pathTextStyle, color: theme.dim }} title={status.path}>
                  {getPathParent(status.path)}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const wrapStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: SPACING.sm,
  padding: `${SPACING.xs}px ${SPACING.sm}px`,
  borderWidth: 1,
  borderStyle: 'solid',
  borderRadius: 2,
  boxSizing: 'border-box',
};

const headerRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: SPACING.sm,
};

const titleClusterStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  minWidth: 0,
  flex: 1,
};

const eyebrowStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 9,
  letterSpacing: '0.14em',
};

const summaryClusterStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: `${SPACING.xs}px ${SPACING.sm}px`,
  minWidth: 0,
};

const metricBlockStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  minWidth: 70,
};

const metricLabelStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 9,
  letterSpacing: '0.12em',
};

const metricValueStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 11,
  letterSpacing: '0.05em',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const badgeRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  justifyContent: 'flex-end',
};

const badgeStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 9,
  letterSpacing: '0.1em',
  padding: '3px 6px',
  borderWidth: 1,
  borderStyle: 'solid',
  whiteSpace: 'nowrap',
};

const modeGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(156px, 1fr))',
  gap: 8,
};

const tuningPanelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  borderWidth: 1,
  borderStyle: 'solid',
  padding: 8,
  minWidth: 0,
  boxSizing: 'border-box',
};

const tuningHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  flexWrap: 'wrap',
};

const toggleButtonStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 9,
  letterSpacing: '0.08em',
  borderWidth: 1,
  borderStyle: 'solid',
  padding: '4px 8px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const guidancePanelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  borderWidth: 1,
  borderStyle: 'solid',
  padding: 8,
  minWidth: 0,
  boxSizing: 'border-box',
};

const quietEmptyStateStyle: React.CSSProperties = {
  borderWidth: 1,
  borderStyle: 'solid',
  borderRadius: 2,
  padding: '6px 8px',
  fontFamily: FONTS.mono,
  fontSize: 9,
  letterSpacing: '0.04em',
  lineHeight: 1.4,
};

const sourceBarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 8,
  borderWidth: 1,
  borderStyle: 'solid',
  padding: 8,
  minWidth: 0,
  boxSizing: 'border-box',
};

const sourceMetaGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 8,
  minWidth: 0,
  flex: 1,
};

const sourceMetaStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  minWidth: 0,
  flex: 1,
};

const modeCardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  borderWidth: 1,
  borderStyle: 'solid',
  padding: 8,
  minWidth: 0,
  boxSizing: 'border-box',
};

const modeHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 6,
};

const modeTitleStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 10,
  letterSpacing: '0.08em',
};

const modeSummaryStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 10,
  letterSpacing: '0.03em',
  lineHeight: 1.45,
};

const modeDetailStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 9,
  letterSpacing: '0.04em',
  lineHeight: 1.45,
};

const actionRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
};

const actionButtonStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 9,
  letterSpacing: '0.08em',
  borderWidth: 1,
  borderStyle: 'solid',
  padding: '4px 8px',
  cursor: 'pointer',
};

const statusPanelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  borderWidth: 1,
  borderStyle: 'solid',
  padding: 8,
  minWidth: 0,
  boxSizing: 'border-box',
};

const statusHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
};

const progressContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 3,
};

const progressTrackStyle: React.CSSProperties = {
  width: '100%',
  height: 3,
  overflow: 'hidden',
};

const progressMetricsStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 8,
};

const progressMetricStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 9,
  letterSpacing: '0.06em',
};

const statusValueStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 10,
  letterSpacing: '0.04em',
  lineHeight: 1.5,
  minWidth: 0,
  overflowWrap: 'anywhere',
};

const statusPathBlockStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  minWidth: 0,
};

const pathLeafStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 10,
  letterSpacing: '0.03em',
  lineHeight: 1.4,
  minWidth: 0,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const detailTextStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 9,
  letterSpacing: '0.04em',
  lineHeight: 1.5,
  minWidth: 0,
  overflowWrap: 'anywhere',
};

const pathTextStyle: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: 9,
  letterSpacing: '0.03em',
  lineHeight: 1.45,
  minWidth: 0,
  overflowWrap: 'anywhere',
};
