// ============================================================
// scrollSpeed — runtime scroll speed multiplier shared by all
// scrolling panels. Read in RAF loops; no React re-renders.
// ============================================================

let _speed = 1.0;

export const scrollSpeed = {
  get value(): number { return _speed; },
  set(v: number): void { _speed = Math.max(0.25, Math.min(4, v)); },
};
