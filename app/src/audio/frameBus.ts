// ============================================================
// Frame bus — lightweight event emitter for AudioFrame objects.
// Panels subscribe once and receive frames without triggering
// React re-renders. Uses a simple callback pattern.
// ============================================================

import type { AudioFrame } from '../types';

export type FrameListener = (frame: AudioFrame) => void;

export interface FrameBusOptions {
  readonly onListenerError?: (error: unknown, listener: FrameListener) => void;
}

function retainFrame(frame: AudioFrame): AudioFrame {
  return {
    ...frame,
    timeDomain: new Float32Array(frame.timeDomain),
    timeDomainRight: new Float32Array(frame.timeDomainRight),
    frequencyDb: new Float32Array(frame.frequencyDb),
    frequencyDbRight: new Float32Array(frame.frequencyDbRight),
  };
}

export class FrameBus {
  private listeners = new Set<FrameListener>();
  private readonly onListenerError: ((error: unknown, listener: FrameListener) => void) | null;

  constructor(options: FrameBusOptions = {}) {
    this.onListenerError = options.onListenerError ?? null;
  }

  subscribe(fn: FrameListener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  publish(frame: AudioFrame): void {
    const retainedFrame = retainFrame(frame);
    for (const fn of this.listeners) {
      try {
        fn(retainedFrame);
      } catch (error) {
        this.handleListenerError(error, fn);
      }
    }
  }

  private handleListenerError(error: unknown, listener: FrameListener): void {
    if (this.onListenerError) {
      this.onListenerError(error, listener);
      return;
    }
    console.error('frame listener failed', error);
  }
}
