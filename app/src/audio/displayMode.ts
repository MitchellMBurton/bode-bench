// ============================================================
// displayMode — runtime visual mode flags.
// Read in RAF draw loops; no React re-renders needed.
// ============================================================

export type VisualMode = 'default' | 'nge' | 'hyper' | 'eva' | 'optic' | 'red';

export class DisplayModeStore {
  mode: VisualMode = 'default';

  setMode(mode: VisualMode): void {
    this.mode = mode;
  }
}
