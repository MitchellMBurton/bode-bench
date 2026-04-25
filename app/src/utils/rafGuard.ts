// RAF frame guard — caps panel draws at FG_FPS while the document is visible
// and skips entirely when hidden.
//
// Foreground cap: analysis frames arrive at ~20 fps, so 60 fps RAF wastes half
// the draws. Capping at 30 fps keeps sub-frame interpolation smooth while
// halving canvas compositing cost.
//
// We intentionally do NOT throttle on focus loss. The instrument should keep
// rendering at full cadence when the user clicks into another window (OBS,
// VSCode, a browser tab), because split-screen and side-by-side workflows are
// first-class. Only document.hidden — true tab background or minimise — skips
// drawing.

const FG_FPS = 30;
const FG_FRAME_INTERVAL_MS = 1000 / FG_FPS;

const lastFrameAtByTarget = new WeakMap<object, number>();

/**
 * Returns true when the panel draw function should return early without
 * painting. Always call requestAnimationFrame(draw) *before* calling this so
 * the loop keeps rescheduling itself.
 */
export function shouldSkipFrame(target: object): boolean {
  if (document.hidden) return true;

  const now = performance.now();
  const lastFrameAt = lastFrameAtByTarget.get(target) ?? 0;
  if (now - lastFrameAt < FG_FRAME_INTERVAL_MS) return true;
  lastFrameAtByTarget.set(target, now);

  return false;
}
