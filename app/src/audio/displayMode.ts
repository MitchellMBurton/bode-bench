// ============================================================
// displayMode — runtime visual mode flags.
// Read in RAF draw loops; no React re-renders needed.
// ============================================================

let _nge = false;

export const displayMode = {
  get nge(): boolean { return _nge; },
  set(nge: boolean): void { _nge = nge; },
};
