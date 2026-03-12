// ============================================================
// Frame bus — lightweight event emitter for AudioFrame objects.
// Panels subscribe once and receive frames without triggering
// React re-renders. Uses a simple callback pattern.
// ============================================================

import type { AudioFrame } from '../types';

export type FrameListener = (frame: AudioFrame) => void;

export class FrameBus {
  private listeners = new Set<FrameListener>();

  subscribe(fn: FrameListener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  publish(frame: AudioFrame): void {
    for (const fn of this.listeners) {
      fn(frame);
    }
  }
}
