// ============================================================
// displayMode — runtime visual mode flags.
// Read in RAF draw loops; no React re-renders needed.
// ============================================================

export type VisualMode = 'default' | 'nge' | 'hyper' | 'eva' | 'optic' | 'red';

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

  get optic(): boolean {
    return this.currentMode === 'optic';
  }

  get red(): boolean {
    return this.currentMode === 'red';
  }

  setMode(mode: VisualMode): void {
    this.currentMode = mode;
  }

}
