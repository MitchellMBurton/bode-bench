const MAX_IN_MEMORY_FILE_BYTES = 384 * 1024 * 1024;
const MAX_DECODE_AUDIO_BYTES = 768 * 1024 * 1024;
const MAX_STRETCH_PREP_BYTES = 512 * 1024 * 1024;
const STREAMED_MEDIA_SAMPLE_RATE = 48_000;
const STREAMED_MEDIA_CHANNELS = 2;

export function shouldPreflightStreaming(file: File): boolean {
  return file.type.startsWith('video/') || file.size >= MAX_IN_MEMORY_FILE_BYTES;
}

export function estimateDecodedPcmBytes(
  durationSeconds: number,
  sampleRate = STREAMED_MEDIA_SAMPLE_RATE,
  channelCount = STREAMED_MEDIA_CHANNELS,
): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return 0;
  }
  return durationSeconds * sampleRate * channelCount * Float32Array.BYTES_PER_ELEMENT;
}

export function shouldPreferStreamingLoad(file: File, durationSeconds: number | null): boolean {
  if (file.size >= MAX_IN_MEMORY_FILE_BYTES) return true;
  if (durationSeconds === null) return false;
  return estimateDecodedPcmBytes(durationSeconds) >= MAX_DECODE_AUDIO_BYTES;
}

export function estimateStretchPrepBytes(buffer: AudioBuffer): number {
  return buffer.length * buffer.numberOfChannels * Float32Array.BYTES_PER_ELEMENT;
}

export function canPrepareStretchBuffers(buffer: AudioBuffer): boolean {
  return estimateStretchPrepBytes(buffer) <= MAX_STRETCH_PREP_BYTES;
}
