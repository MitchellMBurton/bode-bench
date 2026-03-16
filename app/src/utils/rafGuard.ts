// RAF frame guard — skip drawing when the window is invisible or unfocused.
//
// Two instances running side-by-side saturate shared GPU/CPU resources because
// each window runs ~10 canvas RAF loops at 60fps simultaneously. This module
// provides shouldSkipFrame() which panels call at the top of their draw
// functions to bail out early when:
//   • document.hidden  — tab is in background or window is minimised (skip entirely)
//   • !document.hasFocus() — window is visible but not the active window
//                            (throttle to BG_FPS)
//
// Audio playback and the engine analysis loop are unaffected — only canvas
// draw work is suppressed.

const BG_FPS = 4;
const BG_FRAME_INTERVAL_MS = 1000 / BG_FPS;

let lastBgFrameAt = 0;

/**
 * Returns true when the panel draw function should return early without
 * painting. Always call requestAnimationFrame(draw) *before* calling this so
 * the loop keeps rescheduling itself.
 */
export function shouldSkipFrame(): boolean {
  if (document.hidden) return true;

  if (!document.hasFocus()) {
    const now = performance.now();
    if (now - lastBgFrameAt < BG_FRAME_INTERVAL_MS) return true;
    lastBgFrameAt = now;
  }

  return false;
}
