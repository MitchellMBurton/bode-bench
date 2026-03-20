import { describe, expect, it } from 'vitest';

import {
  buildSourceAssetId,
  buildSuggestedClipExportFilename,
  createClipExportJobSpec,
  describeExportMode,
  describeExportPreset,
  formatExportTimeToken,
  getQuickClipExportPreset,
  getSuggestedExportExtension,
} from './exportPresets';

describe('exportPresets', () => {
  it('creates stable source asset ids from filename and duration', () => {
    expect(buildSourceAssetId('Cello Suite No.1.mov', 92.3456)).toBe('cello-suite-no-1-mov:92.346');
  });

  it('returns quick presets for audio and video export modes', () => {
    const audioFast = getQuickClipExportPreset('audio', 'copy-fast');
    const videoMaster = getQuickClipExportPreset('video', 'exact-master');

    expect(audioFast.audioCodec).toBe('copy');
    expect(audioFast.videoCodec).toBeNull();
    expect(videoMaster.container).toBe('mp4');
    expect(videoMaster.videoCodec).toBe('libx264');
  });

  it('builds clip export jobs from a saved range', () => {
    const spec = createClipExportJobSpec({
      filename: 'Prelude.wav',
      durationS: 120,
      sourceKind: 'audio',
      qualityMode: 'exact-master',
      range: {
        id: 3,
        label: 'R3',
        startS: 8,
        endS: 12.5,
      },
    });

    expect(spec.kind).toBe('clip-export');
    expect(spec.sourceAssetId).toBe('prelude-wav:120.000');
    expect(spec.label).toBe('R3 EXACT MASTER');
    expect(spec.clip).toEqual({
      startS: 8,
      endS: 12.5,
      presetId: 'audio-exact-master',
    });
  });

  it('describes export modes and preset codecs for the UI', () => {
    expect(describeExportMode('copy-fast')).toBe('STREAM COPY');
    expect(describeExportMode('exact-master')).toBe('EXACT MASTER');
    expect(describeExportPreset(getQuickClipExportPreset('video', 'copy-fast'))).toBe('source container / no re-encode');
    expect(describeExportPreset(getQuickClipExportPreset('audio', 'exact-master'))).toBe('WAV / PCM_S24LE');
  });

  it('builds filesystem-safe time tokens and suggested clip export filenames', () => {
    expect(formatExportTimeToken(35.3)).toBe('00-35-3');
    expect(formatExportTimeToken(125.98)).toBe('02-05-9');

    expect(
      buildSuggestedClipExportFilename({
        filename: 'Every Hour.flac',
        range: { id: 2, label: 'R2', startS: 25.8, endS: 34.1 },
        sourceKind: 'audio',
        qualityMode: 'copy-fast',
      }),
    ).toBe('Every-Hour__R2__00-25-8_to_00-34-1__fast.flac');
  });

  it('maps export extensions for source-copy and master outputs', () => {
    expect(getSuggestedExportExtension('audio', 'copy-fast', 'Prelude.aiff')).toBe('aiff');
    expect(getSuggestedExportExtension('audio', 'exact-master', 'Prelude.aiff')).toBe('wav');
    expect(getSuggestedExportExtension('video', 'copy-fast', 'Study.mov')).toBe('mov');
    expect(getSuggestedExportExtension('video', 'exact-master', 'Study.mov')).toBe('mp4');
  });
});
