import { describe, it, expect } from 'vitest';
import { formatTransportTime, formatRuntimeMs } from './format';

describe('formatTransportTime', () => {
  it('formats 0 as 00:00.0', () => {
    expect(formatTransportTime(0)).toBe('00:00.0');
  });

  it('formats 65.5 as 01:05.5', () => {
    expect(formatTransportTime(65.5)).toBe('01:05.5');
  });

  it('formats 3600 as 60:00.0', () => {
    expect(formatTransportTime(3600)).toBe('60:00.0');
  });

  it('truncates tenths (does not round up)', () => {
    expect(formatTransportTime(1.99)).toBe('00:01.9');
  });

  it('zero-pads minutes and seconds', () => {
    expect(formatTransportTime(9.0)).toBe('00:09.0');
    expect(formatTransportTime(60.0)).toBe('01:00.0');
  });
});

describe('formatRuntimeMs', () => {
  it('returns -- for null', () => {
    expect(formatRuntimeMs(null)).toBe('--');
  });

  it('returns -- for Infinity', () => {
    expect(formatRuntimeMs(Infinity)).toBe('--');
  });

  it('formats with 0 decimal places by default', () => {
    expect(formatRuntimeMs(12.6)).toBe('13 ms');
  });

  it('respects digits parameter', () => {
    expect(formatRuntimeMs(12.567, 2)).toBe('12.57 ms');
  });
});
