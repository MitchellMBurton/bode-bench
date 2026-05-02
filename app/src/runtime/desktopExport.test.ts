import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getClipExportStatus,
  probeExportTools,
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
  tuning: null,
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

  it('passes tuned export requests through to the desktop bridge', async () => {
    invoke.mockResolvedValueOnce({ jobId: 'clip-export-8' });

    const tunedRequest: StartClipExportRequest = {
      ...START_REQUEST,
      tuning: {
        volume: 0.66,
        playbackRate: 1.15,
        pitchSemitones: 2,
      },
    };

    await expect(startClipExport(tunedRequest)).resolves.toEqual({
      jobId: 'clip-export-8',
    });
    expect(invoke).toHaveBeenCalledWith('start_clip_export', { request: tunedRequest });
  });

  it('normalizes rich export tool capability reports', async () => {
    invoke
      .mockResolvedValueOnce({
        kind: 'ready',
        report: {
          ffmpegPath: 'C:/app/resources/ffmpeg/ffmpeg.exe',
          ffmpegVersion: 'ffmpeg version 8.1',
          ffprobePath: 'C:/app/resources/ffmpeg/ffprobe.exe',
          features: {
            rubberbandFilter: true,
            volumeFilter: true,
            setptsFilter: true,
            libx264Encoder: true,
            aacEncoder: true,
            pcmS24leEncoder: true,
          },
          warnings: [],
        },
      })
      .mockResolvedValueOnce({
        kind: 'missing',
        reason: 'ffmpeg is missing required export support: rubberband filter.',
        report: {
          ffmpeg_path: 'C:/tools/ffmpeg.exe',
          ffmpeg_version: 'ffmpeg version custom',
          ffprobe_path: null,
          features: {
            rubberband_filter: false,
            volume_filter: true,
            setpts_filter: true,
            libx264_encoder: true,
            aac_encoder: true,
            pcm_s24le_encoder: true,
          },
          warnings: ['ffprobe was not found'],
        },
      });

    await expect(probeExportTools()).resolves.toEqual({
      kind: 'ready',
      report: {
        ffmpegPath: 'C:/app/resources/ffmpeg/ffmpeg.exe',
        ffmpegVersion: 'ffmpeg version 8.1',
        ffprobePath: 'C:/app/resources/ffmpeg/ffprobe.exe',
        features: {
          rubberbandFilter: true,
          volumeFilter: true,
          setptsFilter: true,
          libx264Encoder: true,
          aacEncoder: true,
          pcmS24leEncoder: true,
        },
        warnings: [],
      },
    });
    await expect(probeExportTools()).resolves.toEqual({
      kind: 'missing',
      reason: 'ffmpeg is missing required export support: rubberband filter.',
      report: {
        ffmpegPath: 'C:/tools/ffmpeg.exe',
        ffmpegVersion: 'ffmpeg version custom',
        ffprobePath: null,
        features: {
          rubberbandFilter: false,
          volumeFilter: true,
          setptsFilter: true,
          libx264Encoder: true,
          aacEncoder: true,
          pcmS24leEncoder: true,
        },
        warnings: ['ffprobe was not found'],
      },
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
