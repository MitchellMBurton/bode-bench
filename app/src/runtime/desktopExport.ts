import type { ClipExportManifestSeed, ClipExportTuning, MediaQualityMode } from '../types';
import type { SourceKind } from './exportPresets';

interface TauriInvokeBridge {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: TauriInvokeBridge;
  }
}

export interface ExportToolFeatures {
  readonly rubberbandFilter: boolean;
  readonly volumeFilter: boolean;
  readonly setptsFilter: boolean;
  readonly libx264Encoder: boolean;
  readonly aacEncoder: boolean;
  readonly pcmS24leEncoder: boolean;
}

export interface ExportToolReport {
  readonly ffmpegPath: string;
  readonly ffmpegVersion: string;
  readonly ffprobePath: string | null;
  readonly features: ExportToolFeatures;
  readonly warnings: readonly string[];
}

export type ExportToolStatus =
  | { kind: 'ready'; report: ExportToolReport }
  | { kind: 'missing'; reason: string; report: ExportToolReport | null };

export interface PickClipExportDestinationRequest {
  readonly defaultDirectory: string | null;
  readonly defaultFileName: string;
  readonly sourceKind: SourceKind;
  readonly qualityMode: MediaQualityMode;
}

export type PickClipExportDestinationResult =
  | { kind: 'selected'; path: string }
  | { kind: 'canceled' };

export interface PickSourceMediaFileRequest {
  readonly filename: string;
  readonly sourceKind: SourceKind;
}

export interface StartClipExportRequest {
  readonly sourcePath: string;
  readonly sourceKind: SourceKind;
  readonly startS: number;
  readonly endS: number;
  readonly qualityMode: MediaQualityMode;
  readonly destinationPath: string;
  readonly tuning: ClipExportTuning | null;
  readonly manifest: ClipExportManifestSeed;
}

export interface StartClipExportResponse {
  readonly jobId: string;
}

export type ClipExportStatus =
  | { status: 'queued'; progressPercent: number; message: string }
  | { status: 'running'; progressPercent: number; message: string }
  | { status: 'completed'; outputPath: string | null; manifestPath: string | null; manifestError: string | null }
  | { status: 'failed'; errorText: string }
  | { status: 'canceled' };

export function resolveClipExportOutputPath(outputPath: string | null, destinationPath: string): string {
  return typeof outputPath === 'string' && outputPath.trim() ? outputPath : destinationPath;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function getInvokeBridge(): TauriInvokeBridge | null {
  return window.__TAURI_INTERNALS__ ?? null;
}

export function isDesktopRuntime(): boolean {
  return getInvokeBridge() !== null || location.protocol === 'tauri:' || location.hostname === 'tauri.localhost';
}

async function invokeDesktop<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const bridge = getInvokeBridge();
  if (!bridge) {
    throw new Error('Desktop export commands are only available in the desktop runtime.');
  }
  return bridge.invoke<T>(command, args);
}

function getObject(value: unknown, message: string): Record<string, unknown> {
  assert(typeof value === 'object' && value !== null && !Array.isArray(value), message);
  return value as Record<string, unknown>;
}

function getStringValue(
  object: Record<string, unknown>,
  camelKey: string,
  snakeKey: string,
): string | null {
  const value = object[camelKey] ?? object[snakeKey];
  return typeof value === 'string' && value.trim() ? value : null;
}

function getNumberValue(
  object: Record<string, unknown>,
  camelKey: string,
  snakeKey: string,
): number | null {
  const value = object[camelKey] ?? object[snakeKey];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeStartClipExportResponse(raw: unknown): StartClipExportResponse {
  const object = getObject(raw, 'desktop export start response must be an object');
  const jobId = getStringValue(object, 'jobId', 'job_id');
  assert(jobId, 'desktop export start response is missing a job id');
  return { jobId };
}

function normalizeClipExportStatus(raw: unknown): ClipExportStatus {
  const object = getObject(raw, 'desktop export status must be an object');
  const status = getStringValue(object, 'status', 'status');
  assert(status, 'desktop export status is missing a status tag');

  switch (status) {
    case 'queued':
      return {
        status,
        progressPercent: getNumberValue(object, 'progressPercent', 'progress_percent') ?? 0,
        message: getStringValue(object, 'message', 'message') ?? 'Queued export...',
      };
    case 'running':
      return {
        status,
        progressPercent: getNumberValue(object, 'progressPercent', 'progress_percent') ?? 0,
        message: getStringValue(object, 'message', 'message') ?? 'Exporting...',
      };
    case 'completed':
      return {
        status,
        outputPath: getStringValue(object, 'outputPath', 'output_path'),
        manifestPath: getStringValue(object, 'manifestPath', 'manifest_path'),
        manifestError: getStringValue(object, 'manifestError', 'manifest_error'),
      };
    case 'failed':
      return {
        status,
        errorText: getStringValue(object, 'errorText', 'error_text') ?? 'Clip export failed.',
      };
    case 'canceled':
      return { status };
    default:
      throw new Error(`desktop export status "${status}" is not supported`);
  }
}

function getBooleanValue(object: Record<string, unknown>, camelKey: string, snakeKey: string): boolean {
  return (object[camelKey] ?? object[snakeKey]) === true;
}

function normalizeExportToolReport(raw: unknown): ExportToolReport {
  const object = getObject(raw, 'desktop export tool report must be an object');
  const featureObject = getObject(object.features, 'desktop export tool features must be an object');
  const warnings = Array.isArray(object.warnings)
    ? object.warnings.filter((warning): warning is string => typeof warning === 'string')
    : [];

  return {
    ffmpegPath: getStringValue(object, 'ffmpegPath', 'ffmpeg_path') ?? '',
    ffmpegVersion: getStringValue(object, 'ffmpegVersion', 'ffmpeg_version') ?? 'ffmpeg version unknown',
    ffprobePath: getStringValue(object, 'ffprobePath', 'ffprobe_path'),
    features: {
      rubberbandFilter: getBooleanValue(featureObject, 'rubberbandFilter', 'rubberband_filter'),
      volumeFilter: getBooleanValue(featureObject, 'volumeFilter', 'volume_filter'),
      setptsFilter: getBooleanValue(featureObject, 'setptsFilter', 'setpts_filter'),
      libx264Encoder: getBooleanValue(featureObject, 'libx264Encoder', 'libx264_encoder'),
      aacEncoder: getBooleanValue(featureObject, 'aacEncoder', 'aac_encoder'),
      pcmS24leEncoder: getBooleanValue(featureObject, 'pcmS24leEncoder', 'pcm_s24le_encoder'),
    },
    warnings,
  };
}

function normalizeExportToolStatus(raw: unknown): ExportToolStatus {
  const object = getObject(raw, 'desktop export tool status must be an object');
  const kind = getStringValue(object, 'kind', 'kind');
  assert(kind === 'ready' || kind === 'missing', 'desktop export tool status is not supported');
  const report = object.report === null || object.report === undefined
    ? null
    : normalizeExportToolReport(object.report);

  if (kind === 'ready') {
    assert(report, 'desktop export tool ready status is missing its capability report');
    return { kind, report };
  }

  return {
    kind,
    reason: getStringValue(object, 'reason', 'reason') ?? 'Export tools are unavailable.',
    report,
  };
}

export function probeExportTools(): Promise<ExportToolStatus> {
  return invokeDesktop<unknown>('probe_export_tools').then(normalizeExportToolStatus);
}

export function pickClipExportDestination(
  request: PickClipExportDestinationRequest,
): Promise<PickClipExportDestinationResult> {
  return invokeDesktop<PickClipExportDestinationResult>('pick_clip_export_destination', { request });
}

export function pickSourceMediaFile(
  request: PickSourceMediaFileRequest,
): Promise<PickClipExportDestinationResult> {
  return invokeDesktop<PickClipExportDestinationResult>('pick_source_media_file', { request });
}

export function sourceMediaPathExists(path: string): Promise<boolean> {
  return invokeDesktop<boolean>('source_media_path_exists', { path });
}

export function startClipExport(request: StartClipExportRequest): Promise<StartClipExportResponse> {
  return invokeDesktop<unknown>('start_clip_export', { request }).then(normalizeStartClipExportResponse);
}

export function getClipExportStatus(jobId: string): Promise<ClipExportStatus> {
  return invokeDesktop<unknown>('get_clip_export_status', { jobId }).then(normalizeClipExportStatus);
}

export function cancelClipExport(jobId: string): Promise<void> {
  return invokeDesktop<void>('cancel_clip_export', { jobId });
}

export function revealInFolder(path: string): Promise<void> {
  return invokeDesktop<void>('reveal_in_folder', { path });
}
