export type SplitPaneFractionsSnapshot = Readonly<Record<string, readonly number[]>>;

const persistedPaneFractions = new Map<string, number[]>();

export function normalizeSplitPaneFractions(sizes: readonly number[]): number[] {
  const total = sizes.reduce((a, b) => a + b, 0);
  if (total === 0) return sizes.map(() => 1 / sizes.length);
  return sizes.map((size) => size / total);
}

export function readInitialSplitPaneFractions(initialSizes: readonly number[], persistKey?: string): number[] {
  if (!persistKey) return normalizeSplitPaneFractions(initialSizes);

  const stored = persistedPaneFractions.get(persistKey);
  if (!stored || stored.length !== initialSizes.length) {
    return normalizeSplitPaneFractions(initialSizes);
  }

  if (stored.some((value) => !Number.isFinite(value) || value <= 0)) {
    return normalizeSplitPaneFractions(initialSizes);
  }

  return normalizeSplitPaneFractions(stored);
}

export function rememberSplitPaneFractions(key: string, fractions: readonly number[]): void {
  persistedPaneFractions.set(key, normalizeSplitPaneFractions(fractions));
}

export function readSplitPaneFractions(keys: readonly string[]): SplitPaneFractionsSnapshot {
  const entries: Array<[string, readonly number[]]> = [];
  for (const key of keys) {
    const fractions = persistedPaneFractions.get(key);
    if (fractions) {
      entries.push([key, [...fractions]]);
    }
  }
  return Object.fromEntries(entries);
}

export function restoreSplitPaneFractions(snapshot: SplitPaneFractionsSnapshot): void {
  for (const [key, fractions] of Object.entries(snapshot)) {
    if (fractions.length === 0) continue;
    if (fractions.some((value) => !Number.isFinite(value) || value <= 0)) continue;
    rememberSplitPaneFractions(key, fractions);
  }
}
