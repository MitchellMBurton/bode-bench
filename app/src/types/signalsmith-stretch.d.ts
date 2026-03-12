declare module 'signalsmith-stretch' {
  export default function createSignalsmithStretch(
    audioContext: AudioContext,
    options?: AudioWorkletNodeOptions,
  ): Promise<AudioWorkletNode>;
}
