import { describe, expect, it } from 'vitest';

import { parseSubtitleFile } from './subtitles';

describe('subtitles', () => {
  it('parses srt subtitles', () => {
    const parsed = parseSubtitleFile('scene.srt', `1
00:00:01,250 --> 00:00:03,500
Hello there.

2
00:00:04,000 --> 00:00:05,200
General Kenobi.`);

    expect(parsed.format).toBe('srt');
    expect(parsed.cues).toEqual([
      { startS: 1.25, endS: 3.5, lines: ['Hello there.'] },
      { startS: 4, endS: 5.2, lines: ['General Kenobi.'] },
    ]);
  });

  it('parses vtt subtitles', () => {
    const parsed = parseSubtitleFile('scene.vtt', `WEBVTT

00:00:00.500 --> 00:00:02.000
Line one
Line two`);

    expect(parsed.format).toBe('vtt');
    expect(parsed.cues).toEqual([
      { startS: 0.5, endS: 2, lines: ['Line one', 'Line two'] },
    ]);
  });

  it('rejects unsupported subtitle files', () => {
    expect(() => parseSubtitleFile('scene.ass', 'Dialogue')).toThrow('Subtitles must be .srt or .vtt files.');
  });
});
