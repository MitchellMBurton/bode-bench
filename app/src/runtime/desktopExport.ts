import type { MediaQualityMode } from '../types';
import type { SourceKind } from './exportPresets';

interface TauriInvokeBridge {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: TauriInvokeBridge;
  }
}

export type ExportToolStatus =
  | { kind: 'ready' }
  | { kind: 'missing'; reason: string };

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
}

export interface StartClipExportResponse {
  readonly jobId: string;
}

export type ClipExportStatus =
  | { status: 'queued'; progressPercent: number; message: string }
  | { status: 'running'; progressPercent: number; message: string }
  | { status: 'completed'; outputPath: string }
  | { status: 'failed'; errorText: string }
  | { status: 'canceled' };

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

export function probeExportTools(): Promise<ExportToolStatus> {
  return invokeDesktop<ExportToolStatus>('probe_export_tools');
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
  return invokeDesktop<StartClipExportResponse>('start_clip_export', { request });
}

export function getClipExportStatus(jobId: string): Promise<ClipExportStatus> {
  return invokeDesktop<ClipExportStatus>('get_clip_export_status', { jobId });
}

export function cancelClipExport(jobId: string): Promise<void> {
  return invokeDesktop<void>('cancel_clip_export', { jobId });
}

export function revealInFolder(path: string): Promise<void> {
  return invokeDesktop<void>('reveal_in_folder', { path });
}
