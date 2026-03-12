import createSignalsmithStretch from 'signalsmith-stretch';

export interface StretchConfig {
  preset?: 'default' | 'cheaper';
  blockMs?: number | null;
  intervalMs?: number;
  splitComputation?: boolean;
}

export interface StretchSchedule {
  active?: boolean;
  input?: number;
  output?: number;
  outputTime?: number;
  rate?: number;
  semitones?: number;
  tonalityHz?: number;
  formantSemitones?: number;
  formantCompensation?: boolean;
  formantBaseHz?: number;
  loopStart?: number;
  loopEnd?: number;
}

export interface StretchBufferExtent {
  start: number;
  end: number;
}

export interface StretchNode extends AudioWorkletNode {
  inputTime: number;
  configure(config: StretchConfig): Promise<void>;
  latency(): Promise<number>;
  start(
    when?: number | StretchSchedule,
    offset?: number,
    duration?: number,
    rate?: number,
    semitones?: number,
  ): Promise<StretchSchedule | void>;
  stop(when?: number): Promise<StretchSchedule | void>;
  schedule(schedule: StretchSchedule, adjustPrevious?: boolean): Promise<StretchSchedule>;
  addBuffers(sampleBuffers: Float32Array[], transfer?: Transferable[]): Promise<number>;
  dropBuffers(toSeconds?: number): Promise<StretchBufferExtent>;
  setUpdateInterval(seconds: number, callback?: (seconds: number) => void): Promise<void>;
}

export function createStretchNode(audioContext: AudioContext, channelCount: number): Promise<StretchNode> {
  return createSignalsmithStretch(audioContext, {
    // Keep one unconnected input for compatibility with runtimes which do not
    // reliably drive zero-input AudioWorkletNodes from internal buffer state.
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [channelCount],
  }) as Promise<StretchNode>;
}
