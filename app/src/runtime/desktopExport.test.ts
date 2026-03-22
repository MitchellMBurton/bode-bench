import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getClipExportStatus,
  resolveClipExportOutputPath,
  startClipExport,
  type StartClipExportRequest,
} from './desktopExport';

const START_REQUEST: StartClipExportRequest = {
  sourcePath: 'C:/video/source.mov',
  sourceKind: 'video',
  startS: 12.5,
  endS: 18.75,
  qualityMode: 'copy-fast',
  destinationPath: 'C:/exports/clip.mp4',
};

describe('desktopExport', () => {
  const invoke = vi.fn();

  beforeEach(() => {
    (globalThis as { window?: unknown }).window = {
      __TAURI_INTERNALS__: {
        invoke,
      },
    };
  });

  afterEach(() => {
    vi.resetAllMocks();
    delete (globalThis as { window?: unknown }).window;
  });

  it('normalizes snake_case export status payloads', async () => {
    invoke
      .mockResolvedValueOnce({ status: 'queued', progress_percent: 5, message: 'Queued export...' })
      .mockResolvedValueOnce({ status: 'running', progress_percent: 48, message: 'Exporting 48%' })
      .mockResolvedValueOnce({ status: 'completed', output_path: 'C:/exports/clip.mp4' })
      .mockResolvedValueOnce({ status: 'failed', error_text: 'boom' });

    await expect(getClipExportStatus('job-1')).resolves.toEqual({
      status: 'queued',
      progressPercent: 5,
      message: 'Queued export...',
    });
    await expect(getClipExportStatus('job-1')).resolves.toEqual({
      status: 'running',
      progressPercent: 48,
      message: 'Exporting 48%',
    });
    await expect(getClipExportStatus('job-1')).resolves.toEqual({
      status: 'completed',
      outputPath: 'C:/exports/clip.mp4',
    });
    await expect(getClipExportStatus('job-1')).resolves.toEqual({
      status: 'failed',
      errorText: 'boom',
    });
  });

  it('keeps camelCase payloads intact and normalizes start responses', async () => {
    invoke
      .mockResolvedValueOnce({ jobId: 'clip-export-7' })
      .mockResolvedValueOnce({ status: 'running', progressPercent: 64, message: 'Exporting 64%' });

    await expect(startClipExport(START_REQUEST)).resolves.toEqual({
      jobId: 'clip-export-7',
    });
    await expect(getClipExportStatus('clip-export-7')).resolves.toEqual({
      status: 'running',
      progressPercent: 64,
      message: 'Exporting 64%',
    });
  });

  it('falls back to the chosen destination when completed status omits outputPath', async () => {
    invoke.mockResolvedValueOnce({ status: 'completed' });

    await expect(getClipExportStatus('job-2')).resolves.toEqual({
      status: 'completed',
      outputPath: null,
    });
    expect(resolveClipExportOutputPath(null, 'C:/exports/clip.mp4')).toBe('C:/exports/clip.mp4');
    expect(resolveClipExportOutputPath('C:/exports/real.mp4', 'C:/exports/fallback.mp4')).toBe('C:/exports/real.mp4');
  });
});
