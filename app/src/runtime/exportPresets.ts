import type {
  ClipExportManifestSeed,
  ClipExportTuning,
  ExportPreset,
  MediaJobSpec,
  MediaQualityMode,
  RangeMark,
} from '../types';

export type SourceKind = 'audio' | 'video';
export type ExportStatusToken = 'FAST' | 'REVIEW' | 'MASTER';

export interface QuickClipExportModeDescriptor {
  readonly title: string;
  readonly statusToken: ExportStatusToken;
  readonly summary: string;
  readonly buttonLabel: string;
  readonly detail: string;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const QUICK_AUDIO_EXPORT_PRESETS: Readonly<Record<MediaQualityMode, ExportPreset>> = {
  'copy-fast': {
    id: 'audio-copy-fast',
    label: 'FAST COPY',
    container: 'source',
    audioCodec: 'copy',
    videoCodec: null,
    qualityMode: 'copy-fast',
  },
  'exact-master': {
    id: 'audio-exact-master',
    label: 'PCM 24 MASTER',
    container: 'wav',
    audioCodec: 'pcm_s24le',
    videoCodec: null,
    qualityMode: 'exact-master',
  },
};

const QUICK_VIDEO_EXPORT_PRESETS: Readonly<Record<MediaQualityMode, ExportPreset>> = {
  'copy-fast': {
    id: 'video-copy-fast',
    label: 'FAST REVIEW',
    container: 'mp4',
    audioCodec: 'aac',
    videoCodec: 'libx264',
    qualityMode: 'copy-fast',
  },
  'exact-master': {
    id: 'video-exact-master',
    label: 'H264 MASTER',
    container: 'mp4',
    audioCodec: 'aac',
    videoCodec: 'libx264',
    qualityMode: 'exact-master',
  },
};

const QUICK_EXPORT_MODE_COPY: Readonly<Record<SourceKind, {
  readonly title: string;
  readonly statusToken: ExportStatusToken;
  readonly summary: string;
  readonly buttonLabel: string;
}>> = {
  audio: {
    title: 'FAST COPY',
    statusToken: 'FAST',
    summary: 'Best for the quickest review clip.',
    buttonLabel: 'EXPORT FAST',
  },
  video: {
    title: 'FAST REVIEW',
    statusToken: 'REVIEW',
    summary: 'Quick accurate MP4 for review and sharing.',
    buttonLabel: 'EXPORT REVIEW',
  },
};

const QUICK_EXPORT_MODE_MASTER: Readonly<Record<SourceKind, {
  readonly title: string;
  readonly summary: string;
}>> = {
  audio: {
    title: 'EXACT MASTER',
    summary: 'Best for a dependable final audio clip.',
  },
  video: {
    title: 'EXACT MASTER',
    summary: 'Best for the highest-quality final video clip.',
  },
};

function sanitizeAssetToken(value: string): string {
  const token = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  assert(token, 'source asset filename is empty');
  return token;
}

export function buildSourceAssetId(filename: string, durationS: number): string {
  assert(Number.isFinite(durationS) && durationS > 0, 'source duration must be positive');
  return `${sanitizeAssetToken(filename)}:${durationS.toFixed(3)}`;
}

export function getQuickClipExportPreset(
  sourceKind: SourceKind,
  qualityMode: MediaQualityMode,
): ExportPreset {
  return sourceKind === 'video'
    ? QUICK_VIDEO_EXPORT_PRESETS[qualityMode]
    : QUICK_AUDIO_EXPORT_PRESETS[qualityMode];
}

export function describeExportMode(sourceKind: SourceKind, qualityMode: MediaQualityMode): string {
  return getQuickClipExportModeDescriptor(sourceKind, qualityMode).title;
}

export function describeExportPreset(preset: ExportPreset): string {
  if (preset.container === 'source' && preset.audioCodec === 'copy' && (preset.videoCodec === null || preset.videoCodec === 'copy')) {
    return 'source container / no re-encode';
  }

  const codecParts = [preset.videoCodec, preset.audioCodec]
    .filter((part): part is string => part !== null)
    .map((part) => part.toUpperCase());

  return `${preset.container.toUpperCase()} / ${codecParts.join(' + ')}`;
}

export function getQuickClipExportModeDescriptor(
  sourceKind: SourceKind,
  qualityMode: MediaQualityMode,
): QuickClipExportModeDescriptor {
  const preset = getQuickClipExportPreset(sourceKind, qualityMode);

  if (qualityMode === 'copy-fast') {
    const mode = QUICK_EXPORT_MODE_COPY[sourceKind];
    return {
      ...mode,
      detail: `Output: ${describeExportPreset(preset)}.`,
    };
  }

  return {
    ...QUICK_EXPORT_MODE_MASTER[sourceKind],
    statusToken: 'MASTER',
    buttonLabel: 'EXPORT MASTER',
    detail: `Output: ${describeExportPreset(preset)}.`,
  };
}

function sanitizeFilenameToken(value: string): string {
  const withoutControlChars = Array.from(value)
    .filter((character) => character >= ' ')
    .join('');

  const token = withoutControlChars
    .trim()
    .replace(/\.[^/.]+$/, '')
    .replace(/[<>:"/\\|?*]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  assert(token, 'export filename is empty');
  return token;
}

function formatExportTimeUnit(value: number): string {
  return String(Math.max(0, value)).padStart(2, '0');
}

export function formatExportTimeToken(seconds: number): string {
  assert(Number.isFinite(seconds) && seconds >= 0, 'export time must be non-negative');
  const minutes = Math.floor(seconds / 60);
  const wholeSeconds = Math.floor(seconds % 60);
  const tenths = Math.floor((seconds - Math.floor(seconds)) * 10 + 1e-6);
  return `${formatExportTimeUnit(minutes)}-${formatExportTimeUnit(wholeSeconds)}-${tenths}`;
}

export function getSuggestedExportExtension(
  sourceKind: SourceKind,
  qualityMode: MediaQualityMode,
  sourceFilename: string,
): string {
  const preset = getQuickClipExportPreset(sourceKind, qualityMode);
  if (preset.container !== 'source') {
    return preset.container;
  }

  const match = sourceFilename.match(/\.([a-z0-9]+)$/i);
  assert(match?.[1], 'source filename is missing an extension');
  return match[1].toLowerCase();
}

export function buildSuggestedClipExportFilename(options: {
  filename: string;
  range: RangeMark;
  sourceKind: SourceKind;
  qualityMode: MediaQualityMode;
  tuned?: boolean;
}): string {
  const stem = sanitizeFilenameToken(options.filename);
  const label = sanitizeFilenameToken(options.range.label);
  const startToken = formatExportTimeToken(options.range.startS);
  const endToken = formatExportTimeToken(options.range.endS);
  const tunedToken = options.tuned ? '__tuned' : '';
  const modeToken = options.qualityMode === 'copy-fast' ? 'fast' : 'master';
  const extension = getSuggestedExportExtension(options.sourceKind, options.qualityMode, options.filename);
  return `${stem}__${label}__${startToken}_to_${endToken}${tunedToken}__${modeToken}.${extension}`;
}

export function createClipExportJobSpec(options: {
  filename: string;
  durationS: number;
  range: RangeMark;
  sourceKind: SourceKind;
  qualityMode: MediaQualityMode;
  tuning: ClipExportTuning | null;
  processorVersion?: string | null;
}): Extract<MediaJobSpec, { kind: 'clip-export' }> {
  const preset = getQuickClipExportPreset(options.sourceKind, options.qualityMode);
  const mode = getQuickClipExportModeDescriptor(options.sourceKind, options.qualityMode);
  const tunedLabel = options.tuning ? ' TUNED' : '';

  return {
    kind: 'clip-export',
    sourceAssetId: buildSourceAssetId(options.filename, options.durationS),
    label: `${options.range.label} ${mode.title}${tunedLabel}`,
    clip: {
      startS: options.range.startS,
      endS: options.range.endS,
      presetId: preset.id,
    },
    tuning: options.tuning,
    preset,
    processor: {
      kind: 'ffmpeg',
      name: 'ffmpeg',
      version: options.processorVersion ?? null,
    },
  };
}

export function createClipExportManifestSeed(options: {
  jobId: string;
  spec: Extract<MediaJobSpec, { kind: 'clip-export' }>;
  range: RangeMark;
}): ClipExportManifestSeed {
  return {
    jobId: options.jobId,
    sourceAssetId: options.spec.sourceAssetId,
    label: options.spec.label,
    rangeLabel: options.range.label,
    rangeNote: options.range.note ?? null,
    preset: options.spec.preset,
    processor: options.spec.processor,
  };
}
