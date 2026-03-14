type Listener = () => void;

export class TheaterModeStore {
  private active = false;
  private listeners = new Set<Listener>();

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): boolean => {
    return this.active;
  };

  setActive(nextActive: boolean): void {
    if (this.active === nextActive) return;
    this.active = nextActive;
    for (const listener of this.listeners) {
      listener();
    }
  }
}
