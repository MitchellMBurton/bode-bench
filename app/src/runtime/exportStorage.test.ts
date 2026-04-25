import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getRememberedSourcePath,
  rememberSourcePath,
} from './exportStorage';

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

describe('exportStorage', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = createMemoryStorage();
    vi.stubGlobal('localStorage', storage);
  });

  it('returns null for a missing remembered source path', () => {
    expect(getRememberedSourcePath('clip.wav', 12.3)).toBeNull();
  });

  it('recovers a valid remembered source path', () => {
    rememberSourcePath('clip.wav', 12.3, 'C:\\media\\clip.wav');

    expect(getRememberedSourcePath('clip.wav', 12.3)).toBe('C:\\media\\clip.wav');
  });

  it('clears malformed JSON and degrades to an empty source map', () => {
    storage.setItem('console:source-paths', '{bad json');

    expect(getRememberedSourcePath('clip.wav', 12.3)).toBeNull();
    expect(storage.getItem('console:source-paths')).toBeNull();
  });

  it('clears array payloads and degrades to an empty source map', () => {
    storage.setItem('console:source-paths', JSON.stringify(['bad']));

    expect(getRememberedSourcePath('clip.wav', 12.3)).toBeNull();
    expect(storage.getItem('console:source-paths')).toBeNull();
  });

  it('keeps only string values from mixed remembered source payloads', () => {
    storage.setItem('console:source-paths', JSON.stringify({
      'clip.wav::123': 'C:\\media\\clip.wav',
      'bad.wav::99': 42,
      'other.wav::50': null,
    }));

    expect(getRememberedSourcePath('clip.wav', 12.3)).toBe('C:\\media\\clip.wav');
    expect(JSON.parse(storage.getItem('console:source-paths') ?? 'null')).toEqual({
      'clip.wav::123': 'C:\\media\\clip.wav',
    });
  });
});
