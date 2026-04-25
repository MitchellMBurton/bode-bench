// ============================================================
// displayMode — runtime visual mode flags.
// Read in RAF draw loops; React can subscribe when it needs chrome updates.
// ============================================================

export type VisualMode = 'default' | 'amber' | 'nge' | 'hyper' | 'eva' | 'optic' | 'red';

export type VisualDecoration = 'none' | 'scan-lines' | 'optic-bloom' | 'red-lighting';

export const VISUAL_DECORATIONS: Record<VisualMode, VisualDecoration> = {
  default: 'none',
  amber: 'scan-lines',
  nge: 'scan-lines',
  hyper: 'scan-lines',
  eva: 'scan-lines',
  optic: 'optic-bloom',
  red: 'red-lighting',
};

export class DisplayModeStore {
  private readonly listeners = new Set<() => void>();
  mode: VisualMode = 'default';

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): VisualMode => this.mode;

  setMode(mode: VisualMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    for (const listener of this.listeners) {
      listener();
    }
  }
}
