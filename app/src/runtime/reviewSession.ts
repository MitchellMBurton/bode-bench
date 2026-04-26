import type { VisualMode } from '../audio/displayMode';
import { DEFAULT_ANALYSIS_CONFIG, normalizeAnalysisConfig } from '../audio/analysisConfig';
import { RANGE_NOTE_MAX_LENGTH, type AnalysisConfig, type Marker, type RangeMark } from '../types';

export const REVIEW_SESSION_SCHEMA = 'bode-bench.review-session';
export const REVIEW_SESSION_VERSION = 1;
const SESSION_SOURCE_DURATION_TOLERANCE_S = 1;

export interface ReviewSessionSource {
  readonly filename: string | null;
  readonly kind: 'audio' | 'video' | null;
  readonly durationS: number | null;
  readonly mediaKey: string | null;
  readonly size: number | null;
  readonly lastModified: number | null;
  readonly sourcePath: string | null;
}

export interface ReviewSessionWorkspace {
  readonly visualMode: VisualMode;
  readonly grayscale: boolean;
  readonly analysisConfig: AnalysisConfig;
  readonly layout: Readonly<Record<string, readonly number[]>>;
  readonly runtimeTrayHeight: number | null;
}

export interface ReviewSessionV1 {
  readonly schema: typeof REVIEW_SESSION_SCHEMA;
  readonly version: typeof REVIEW_SESSION_VERSION;
  readonly metadata: {
    readonly savedAt: string;
  };
  readonly source: ReviewSessionSource;
  readonly review: {
    readonly markers: readonly Marker[];
    readonly pendingRangeStartS: number | null;
    readonly rangeMarks: readonly RangeMark[];
    readonly selectedRangeId: number | null;
  };
  readonly workspace: ReviewSessionWorkspace;
}

export type ReviewSessionParseResult =
  | { readonly kind: 'ok'; readonly session: ReviewSessionV1 }
  | { readonly kind: 'error'; readonly message: string };

export type ReviewSessionSourceMatch =
  | { readonly kind: 'match' }
  | { readonly kind: 'no-current-source' }
  | { readonly kind: 'mismatch'; readonly message: string };

export interface CurrentSessionSourceIdentity {
  readonly filename: string | null;
  readonly kind: 'audio' | 'video' | null;
  readonly durationS: number | null;
  readonly mediaKey: string | null;
}

export interface BuildReviewSessionInput {
  readonly source: ReviewSessionSource;
  readonly review: ReviewSessionV1['review'];
  readonly workspace: ReviewSessionWorkspace;
  readonly savedAt?: Date;
}

export function buildReviewSession(input: BuildReviewSessionInput): ReviewSessionV1 {
  return {
    schema: REVIEW_SESSION_SCHEMA,
    version: REVIEW_SESSION_VERSION,
    metadata: {
      savedAt: (input.savedAt ?? new Date()).toISOString(),
    },
    source: input.source,
    review: input.review,
    workspace: input.workspace,
  };
}

const VISUAL_MODES: readonly VisualMode[] = ['default', 'amber', 'nge', 'hyper', 'eva', 'optic', 'red'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function finiteNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nonNegativeNumberOrNull(value: unknown): number | null {
  const numberValue = finiteNumberOrNull(value);
  return numberValue === null ? null : Math.max(0, numberValue);
}

function sourceKindOrNull(value: unknown): 'audio' | 'video' | null {
  return value === 'audio' || value === 'video' ? value : null;
}

function normalizeRangeNote(value: unknown): string | undefined {
  const note = stringOrNull(value);
  if (note === null) return undefined;
  const normalized = note.trim().replace(/\s+/g, ' ').slice(0, RANGE_NOTE_MAX_LENGTH).trim();
  return normalized || undefined;
}

function visualModeOrDefault(value: unknown): VisualMode {
  return VISUAL_MODES.includes(value as VisualMode) ? value as VisualMode : 'default';
}

function normalizeMarker(value: unknown): Marker | null {
  if (!isRecord(value)) return null;
  const id = finiteNumberOrNull(value.id);
  const time = finiteNumberOrNull(value.time);
  const label = stringOrNull(value.label);
  if (id === null || id <= 0 || time === null || !label) return null;
  return {
    id: Math.floor(id),
    time: Math.max(0, time),
    label,
  };
}

function normalizeRange(value: unknown): RangeMark | null {
  if (!isRecord(value)) return null;
  const id = finiteNumberOrNull(value.id);
  const startS = finiteNumberOrNull(value.startS);
  const endS = finiteNumberOrNull(value.endS);
  const label = stringOrNull(value.label);
  if (id === null || id <= 0 || startS === null || endS === null || !label || startS === endS) return null;
  const note = normalizeRangeNote(value.note);
  return {
    id: Math.floor(id),
    startS: Math.max(0, Math.min(startS, endS)),
    endS: Math.max(0, Math.max(startS, endS)),
    label,
    ...(note ? { note } : {}),
  };
}

function normalizeLayout(value: unknown): Readonly<Record<string, readonly number[]>> {
  if (!isRecord(value)) return {};
  const entries: Array<[string, readonly number[]]> = [];
  for (const [key, maybeFractions] of Object.entries(value)) {
    if (!Array.isArray(maybeFractions)) continue;
    const fractions = maybeFractions
      .map((item) => finiteNumberOrNull(item))
      .filter((item): item is number => item !== null && item > 0);
    if (fractions.length > 0) {
      entries.push([key, fractions]);
    }
  }
  return Object.fromEntries(entries);
}

export function buildReviewSessionFilename(filename: string | null, savedAt = new Date()): string {
  const stem = (filename ?? 'session')
    .replace(/\.[^/.\\]+$/, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'session';
  return `${stem}_${savedAt.toISOString().replace(/[:.]/g, '-')}.review-session.json`;
}

export function parseReviewSession(value: unknown): ReviewSessionParseResult {
  if (!isRecord(value)) {
    return { kind: 'error', message: 'Session file is not a JSON object.' };
  }
  if (value.schema !== REVIEW_SESSION_SCHEMA || value.version !== REVIEW_SESSION_VERSION) {
    return { kind: 'error', message: 'Unsupported review session version.' };
  }

  const source = isRecord(value.source) ? value.source : {};
  const review = isRecord(value.review) ? value.review : {};
  const workspace = isRecord(value.workspace) ? value.workspace : {};
  const metadata = isRecord(value.metadata) ? value.metadata : {};
  const rangeMarks = Array.isArray(review.rangeMarks)
    ? review.rangeMarks.map(normalizeRange).filter((range): range is RangeMark => range !== null)
    : [];
  const selectedRangeId = finiteNumberOrNull(review.selectedRangeId);
  const validSelectedRangeId = selectedRangeId !== null && rangeMarks.some((range) => range.id === selectedRangeId)
    ? Math.floor(selectedRangeId)
    : rangeMarks[rangeMarks.length - 1]?.id ?? null;

  return {
    kind: 'ok',
    session: {
      schema: REVIEW_SESSION_SCHEMA,
      version: REVIEW_SESSION_VERSION,
      metadata: {
        savedAt: stringOrNull(metadata.savedAt) ?? new Date().toISOString(),
      },
      source: {
        filename: stringOrNull(source.filename),
        kind: sourceKindOrNull(source.kind),
        durationS: nonNegativeNumberOrNull(source.durationS),
        mediaKey: stringOrNull(source.mediaKey),
        size: nonNegativeNumberOrNull(source.size),
        lastModified: nonNegativeNumberOrNull(source.lastModified),
        sourcePath: stringOrNull(source.sourcePath),
      },
      review: {
        markers: Array.isArray(review.markers)
          ? review.markers.map(normalizeMarker).filter((marker): marker is Marker => marker !== null)
          : [],
        pendingRangeStartS: nonNegativeNumberOrNull(review.pendingRangeStartS),
        rangeMarks,
        selectedRangeId: validSelectedRangeId,
      },
      workspace: {
        visualMode: visualModeOrDefault(workspace.visualMode),
        grayscale: typeof workspace.grayscale === 'boolean' ? workspace.grayscale : false,
        analysisConfig: isRecord(workspace.analysisConfig)
          ? normalizeAnalysisConfig(workspace.analysisConfig)
          : DEFAULT_ANALYSIS_CONFIG,
        layout: normalizeLayout(workspace.layout),
        runtimeTrayHeight: nonNegativeNumberOrNull(workspace.runtimeTrayHeight),
      },
    },
  };
}

export async function readReviewSessionFile(file: File): Promise<ReviewSessionParseResult> {
  try {
    return parseReviewSession(JSON.parse(await file.text()));
  } catch {
    return { kind: 'error', message: 'Session file could not be read as JSON.' };
  }
}

export function downloadReviewSession(session: ReviewSessionV1, filename: string): void {
  const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function matchReviewSessionSource(
  saved: ReviewSessionSource,
  current: CurrentSessionSourceIdentity,
): ReviewSessionSourceMatch {
  if (!current.filename || !current.durationS || !current.kind) {
    return { kind: 'no-current-source' };
  }
  if (saved.kind !== null && saved.kind !== current.kind) {
    return {
      kind: 'mismatch',
      message: `Session expects ${saved.kind} source ${saved.filename ?? 'media'}. Open the matching media file to apply it.`,
    };
  }
  if (saved.mediaKey && current.mediaKey && saved.mediaKey === current.mediaKey) {
    return { kind: 'match' };
  }
  if (
    saved.filename &&
    saved.durationS !== null &&
    saved.filename === current.filename &&
    Math.abs(saved.durationS - current.durationS) <= SESSION_SOURCE_DURATION_TOLERANCE_S
  ) {
    return { kind: 'match' };
  }
  return {
    kind: 'mismatch',
    message: `Session expects ${saved.filename ?? 'a different source'}. Open the matching media file to apply it.`,
  };
}
