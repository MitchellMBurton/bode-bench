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

const FG_FPS = 30;
const FG_FRAME_INTERVAL_MS = 1000 / FG_FPS;
const BG_FPS = 4;
const BG_FRAME_INTERVAL_MS = 1000 / BG_FPS;

const lastFrameAtByTarget = new WeakMap<object, number>();

/**
 * Returns true when the panel draw function should return early without
 * painting. Always call requestAnimationFrame(draw) *before* calling this so
 * the loop keeps rescheduling itself.
 *
 * Foreground: capped at 30fps per canvas — analysis data arrives at 20fps so
 * 60fps wastes half the draws. 30fps keeps sub-frame interpolation smooth
 * while halving canvas compositing cost.
 * Background: throttled to 4fps.
 * Hidden: skipped entirely.
 */
export function shouldSkipFrame(target: object): boolean {
  if (document.hidden) return true;

  const now = performance.now();
  const interval = document.hasFocus() ? FG_FRAME_INTERVAL_MS : BG_FRAME_INTERVAL_MS;
  const lastFrameAt = lastFrameAtByTarget.get(target) ?? 0;
  if (now - lastFrameAt < interval) return true;
  lastFrameAtByTarget.set(target, now);

  return false;
}
