// ============================================================
// displayMode — runtime visual mode flags.
// Read in RAF draw loops; no React re-renders needed.
// ============================================================

export type VisualMode = 'default' | 'nge' | 'hyper';

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

  setMode(mode: VisualMode): void {
    this.currentMode = mode;
  }

  set(modeOrNge: VisualMode | boolean): void {
    if (typeof modeOrNge === 'boolean') {
      this.currentMode = modeOrNge ? 'nge' : 'default';
      return;
    }
    this.currentMode = modeOrNge;
  }
}
