// ============================================================
// scrollSpeed — runtime scroll speed multiplier shared by all
// scrolling panels. Read in RAF loops; no React re-renders.
// ============================================================

export class ScrollSpeedStore {
  private speed = 1.0;

  get value(): number {
    return this.speed;
  }

  set(v: number): void {
    this.speed = Math.max(0.25, Math.min(4, v));
  }
}
