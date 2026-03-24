import { describe, expect, it } from 'vitest';

import {
  buildSourceAssetId,
  buildSuggestedClipExportFilename,
  createClipExportJobSpec,
  describeExportMode,
  describeExportPreset,
  formatExportTimeToken,
  getQuickClipExportModeDescriptor,
  getQuickClipExportPreset,
  getSuggestedExportExtension,
} from './exportPresets';

describe('exportPresets', () => {
  it('creates stable source asset ids from filename and duration', () => {
    expect(buildSourceAssetId('Cello Suite No.1.mov', 92.3456)).toBe('cello-suite-no-1-mov:92.346');
  });

  it('returns quick presets for audio and video export modes', () => {
    const audioFast = getQuickClipExportPreset('audio', 'copy-fast');
    const videoFast = getQuickClipExportPreset('video', 'copy-fast');
    const videoMaster = getQuickClipExportPreset('video', 'exact-master');

    expect(audioFast.audioCodec).toBe('copy');
    expect(audioFast.videoCodec).toBeNull();
    expect(videoFast.label).toBe('FAST REVIEW');
    expect(videoFast.container).toBe('mp4');
    expect(videoFast.audioCodec).toBe('aac');
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
      tuning: {
        volume: 0.66,
        playbackRate: 1.15,
        pitchSemitones: 2,
      },
    });

    expect(spec.kind).toBe('clip-export');
    expect(spec.sourceAssetId).toBe('prelude-wav:120.000');
    expect(spec.label).toBe('R3 EXACT MASTER TUNED');
    expect(spec.clip).toEqual({
      startS: 8,
      endS: 12.5,
      presetId: 'audio-exact-master',
    });
    expect(spec.tuning).toEqual({
      volume: 0.66,
      playbackRate: 1.15,
      pitchSemitones: 2,
    });
  });

  it('describes export modes and preset codecs for the UI', () => {
    expect(describeExportMode('audio', 'copy-fast')).toBe('FAST COPY');
    expect(describeExportMode('video', 'copy-fast')).toBe('FAST REVIEW');
    expect(describeExportMode('video', 'exact-master')).toBe('EXACT MASTER');
    expect(describeExportPreset(getQuickClipExportPreset('video', 'copy-fast'))).toBe('MP4 / LIBX264 + AAC');
    expect(describeExportPreset(getQuickClipExportPreset('audio', 'exact-master'))).toBe('WAV / PCM_S24LE');
    expect(getQuickClipExportModeDescriptor('audio', 'copy-fast')).toEqual({
      title: 'FAST COPY',
      statusToken: 'FAST',
      summary: 'Best for the quickest review clip.',
      buttonLabel: 'EXPORT FAST',
      detail: 'Output: source container / no re-encode.',
    });
    expect(getQuickClipExportModeDescriptor('video', 'copy-fast')).toEqual({
      title: 'FAST REVIEW',
      statusToken: 'REVIEW',
      summary: 'Quick accurate MP4 for review and sharing.',
      buttonLabel: 'EXPORT REVIEW',
      detail: 'Output: MP4 / LIBX264 + AAC.',
    });
    expect(getQuickClipExportModeDescriptor('video', 'exact-master')).toEqual({
      title: 'EXACT MASTER',
      statusToken: 'MASTER',
      summary: 'Best for the highest-quality final video clip.',
      buttonLabel: 'EXPORT MASTER',
      detail: 'Output: MP4 / LIBX264 + AAC.',
    });
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

    expect(
      buildSuggestedClipExportFilename({
        filename: 'Every Hour.flac',
        range: { id: 2, label: 'R2', startS: 25.8, endS: 34.1 },
        sourceKind: 'audio',
        qualityMode: 'exact-master',
        tuned: true,
      }),
    ).toBe('Every-Hour__R2__00-25-8_to_00-34-1__tuned__master.wav');
  });

  it('maps export extensions for source-copy and master outputs', () => {
    expect(getSuggestedExportExtension('audio', 'copy-fast', 'Prelude.aiff')).toBe('aiff');
    expect(getSuggestedExportExtension('audio', 'exact-master', 'Prelude.aiff')).toBe('wav');
    expect(getSuggestedExportExtension('video', 'copy-fast', 'Study.mov')).toBe('mp4');
    expect(getSuggestedExportExtension('video', 'exact-master', 'Study.mov')).toBe('mp4');
  });
});
