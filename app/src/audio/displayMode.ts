// ============================================================
// displayMode — runtime visual mode flags.
// Read in RAF draw loops; no React re-renders needed.
// ============================================================

export class DisplayModeStore {
  private ngeEnabled = false;

  get nge(): boolean {
    return this.ngeEnabled;
  }

  set(nge: boolean): void {
    this.ngeEnabled = nge;
  }
}
