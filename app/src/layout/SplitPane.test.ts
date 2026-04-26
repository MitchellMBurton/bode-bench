import { describe, expect, it } from 'vitest';

import { readSplitPaneFractions, restoreSplitPaneFractions } from './splitPanePersistence';

describe('SplitPane persistence helpers', () => {
  it('restores and reads normalized pane fractions by key', () => {
    restoreSplitPaneFractions({
      'console:test': [2, 1],
      'console:bad': [1, -1],
    });

    expect(readSplitPaneFractions(['console:test', 'console:missing'])).toEqual({
      'console:test': [2 / 3, 1 / 3],
    });
    expect(readSplitPaneFractions(['console:bad'])).toEqual({});
  });
});
