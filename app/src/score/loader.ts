// ============================================================
// Score loader — reads processed JSON from data/processed/.
// Returns typed ProcessedScore or null if unavailable.
// ============================================================

import type { ProcessedScore } from '../types';

export async function loadScore(url: string): Promise<ProcessedScore | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const raw: unknown = await res.json();
    // Minimal runtime validation — explicit required fields
    if (
      typeof raw !== 'object' ||
      raw === null ||
      !('version' in raw) ||
      !('metadata' in raw) ||
      !('events' in raw)
    ) {
      console.warn('[score] Invalid score shape');
      return null;
    }
    return raw as ProcessedScore;
  } catch (e) {
    console.warn('[score] Failed to load score:', e);
    return null;
  }
}
