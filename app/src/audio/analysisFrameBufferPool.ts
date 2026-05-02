import type { AnalysisFramePayload } from './analysisWorkerProtocol';

export interface AnalysisFrameBuffers {
  readonly timeDomainLeft: Float32Array<ArrayBuffer>;
  readonly timeDomainRight: Float32Array<ArrayBuffer>;
  readonly frequencyDbLeft: Float32Array<ArrayBuffer>;
  readonly frequencyDbRight: Float32Array<ArrayBuffer>;
}

export class AnalysisFrameBufferPool {
  private fftSize: number;
  private frequencyBinCount: number;
  private freeBuffers: AnalysisFrameBuffers[] = [];

  constructor(fftSize: number) {
    this.fftSize = fftSize;
    this.frequencyBinCount = fftSize / 2;
  }

  resize(fftSize: number): void {
    if (this.fftSize === fftSize) return;
    this.fftSize = fftSize;
    this.frequencyBinCount = fftSize / 2;
    this.freeBuffers = [];
  }

  acquire(): AnalysisFrameBuffers {
    return this.freeBuffers.pop() ?? this.createBuffers();
  }

  release(buffers: AnalysisFrameBuffers | AnalysisFramePayload): void {
    if (!this.canReuse(buffers)) return;
    this.freeBuffers.push({
      timeDomainLeft: buffers.timeDomainLeft,
      timeDomainRight: buffers.timeDomainRight,
      frequencyDbLeft: buffers.frequencyDbLeft,
      frequencyDbRight: buffers.frequencyDbRight,
    });
  }

  get availableCount(): number {
    return this.freeBuffers.length;
  }

  private createBuffers(): AnalysisFrameBuffers {
    return {
      timeDomainLeft: new Float32Array(new ArrayBuffer(this.fftSize * 4)),
      timeDomainRight: new Float32Array(new ArrayBuffer(this.fftSize * 4)),
      frequencyDbLeft: new Float32Array(new ArrayBuffer(this.frequencyBinCount * 4)),
      frequencyDbRight: new Float32Array(new ArrayBuffer(this.frequencyBinCount * 4)),
    };
  }

  private canReuse(buffers: AnalysisFrameBuffers | AnalysisFramePayload): boolean {
    return (
      buffers.timeDomainLeft.buffer.byteLength > 0 &&
      buffers.timeDomainRight.buffer.byteLength > 0 &&
      buffers.frequencyDbLeft.buffer.byteLength > 0 &&
      buffers.frequencyDbRight.buffer.byteLength > 0 &&
      buffers.timeDomainLeft.length === this.fftSize &&
      buffers.timeDomainRight.length === this.fftSize &&
      buffers.frequencyDbLeft.length === this.frequencyBinCount &&
      buffers.frequencyDbRight.length === this.frequencyBinCount
    );
  }
}
