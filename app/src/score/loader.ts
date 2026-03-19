// ============================================================
// Score loader — reads processed JSON from data/processed/.
// Returns typed ProcessedScore or null if unavailable.
// ============================================================

import type { ProcessedScore } from '../types';

export async function loadScore(url: string): Promise<ProcessedScore | null> {
  const res = await fetch(url);
  if (!res.ok) return null;
  const raw: unknown = await res.json();
  if (typeof raw !== 'object' || raw === null || !('version' in raw) || !('metadata' in raw) || !('events' in raw)) {
    return null;
  }
  return raw as ProcessedScore;
}
