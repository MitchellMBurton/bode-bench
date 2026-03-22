// ============================================================
// scrollSpeed — runtime scroll speed multiplier shared by all
// scrolling panels. Read in RAF loops; no React re-renders.
// ============================================================

export class ScrollSpeedStore {
  private listeners = new Set<() => void>();
  private speed = 1.0;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): number => {
    return this.speed;
  };

  get value(): number {
    return this.speed;
  }

  set(v: number): void {
    const next = Math.max(0.25, Math.min(4, v));
    if (Math.abs(next - this.speed) < 0.0001) return;
    this.speed = next;
    for (const listener of this.listeners) {
      listener();
    }
  }
}
