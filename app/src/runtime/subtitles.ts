export interface SubtitleCue {
  readonly startS: number;
  readonly endS: number;
  readonly lines: readonly string[];
}

export type SubtitleFormat = 'srt' | 'vtt';

export interface ParsedSubtitleFile {
  readonly format: SubtitleFormat;
  readonly cues: readonly SubtitleCue[];
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function normalizeSubtitleText(text: string): string {
  return text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
}

function parseTimestamp(raw: string): number {
  const match = raw.trim().match(/^(\d+):([0-5]\d):([0-5]\d)[,.](\d{1,3})$/);
  assert(match, `invalid subtitle timestamp ${raw}`);
  const [, hoursText, minutesText, secondsText, millisText] = match;
  const millis = Number(millisText.padEnd(3, '0'));
  return Number(hoursText) * 3600 + Number(minutesText) * 60 + Number(secondsText) + millis / 1000;
}

function parseCue(lines: readonly string[]): SubtitleCue {
  assert(lines.length >= 2, 'subtitle block must include timing');
  const timingIndex = lines[0].includes('-->') ? 0 : 1;
  const timing = lines[timingIndex];
  const [startText, endText] = timing.split('-->').map((part) => part.trim().split(/\s+/)[0]);
  const textLines = lines.slice(timingIndex + 1).filter((line) => line.trim().length > 0);
  assert(textLines.length > 0, 'subtitle cue must include text');
  return {
    startS: parseTimestamp(startText),
    endS: parseTimestamp(endText),
    lines: textLines,
  };
}

function parseSubtitleBlocks(text: string): readonly SubtitleCue[] {
  const normalized = normalizeSubtitleText(text);
  if (!normalized) {
    return [];
  }

  const blocks = normalized.split('\n\n');
  const cues: SubtitleCue[] = [];

  for (const block of blocks) {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) {
      continue;
    }
    if (lines[0] === 'WEBVTT') {
      continue;
    }
    cues.push(parseCue(lines));
  }

  return cues;
}

export function parseSubtitleFile(filename: string, text: string): ParsedSubtitleFile {
  if (/\.srt$/i.test(filename)) {
    return { format: 'srt', cues: parseSubtitleBlocks(text) };
  }
  if (/\.vtt$/i.test(filename)) {
    return { format: 'vtt', cues: parseSubtitleBlocks(text) };
  }
  throw new Error('Subtitles must be .srt or .vtt files.');
}
