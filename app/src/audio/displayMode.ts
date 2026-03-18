// ============================================================
// displayMode — runtime visual mode flags.
// Read in RAF draw loops; no React re-renders needed.
// ============================================================

export type VisualMode = 'default' | 'nge' | 'hyper' | 'eva';

export class DisplayModeStore {
  private currentMode: VisualMode = 'default';

  get mode(): VisualMode {
    return this.currentMode;
  }

  get nge(): boolean {
    return this.currentMode === 'nge';
  }

  get hyper(): boolean {
    return this.currentMode === 'hyper';
  }

  get eva(): boolean {
    return this.currentMode === 'eva';
  }

  setMode(mode: VisualMode): void {
    this.currentMode = mode;
  }

}
