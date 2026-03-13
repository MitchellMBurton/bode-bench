// ============================================================
// Shared runtime constants.
// Single source of truth for limits and defaults that are
// enforced in the audio engine AND reflected in the UI.
// ============================================================

// Playback rate
export const RATE_MIN     = 0.25;
export const RATE_MAX     = 2;
export const RATE_DEFAULT = 1;

// Pitch shift (semitones)
export const PITCH_MIN     = -12;
export const PITCH_MAX     =  12;
export const PITCH_DEFAULT =   0;

// Visual scroll speed multiplier
export const SCROLL_MIN     = 0.25;
export const SCROLL_MAX     = 4;
export const SCROLL_DEFAULT = 1;

// Master volume (normalised 0–1)
export const VOLUME_DEFAULT = 1;
