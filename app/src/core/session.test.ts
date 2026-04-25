import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAppSession, destroyAppSession } from './session';

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

describe('app session lifecycle', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryStorage());
    vi.stubGlobal('window', {
      addEventListener() {},
      removeEventListener() {},
    });
    vi.stubGlobal('location', {
      protocol: 'http:',
      hostname: 'localhost',
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates and destroys sessions repeatedly without throwing', () => {
    const first = createAppSession();
    expect(() => destroyAppSession(first)).not.toThrow();
    expect(() => destroyAppSession(first)).not.toThrow();

    const second = createAppSession();
    expect(() => destroyAppSession(second)).not.toThrow();
  });
});
