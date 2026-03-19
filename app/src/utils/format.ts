// ============================================================
// Shared formatting utilities
// ============================================================

/** Format a playback position (seconds) as MM:SS.T */
export function formatTransportTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const tenths = Math.floor((seconds % 1) * 10);
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
}

/** Format a millisecond measurement for the runtime tray. Returns '--' for null/non-finite. */
export function formatRuntimeMs(value: number | null, digits: number): string {
  if (value === null || !Number.isFinite(value)) return '--';
  return `${value.toFixed(digits)} ms`;
}
