/**
 * AudioDocument — owns the decoded AudioBuffer plus metadata (Build Plan M1).
 * Structural `AudioBufferLike` keeps the document testable without WebAudio.
 */
export interface AudioBufferLike {
  numberOfChannels: number;
  length: number;
  sampleRate: number;
  duration: number;
  getChannelData(channel: number): Float32Array;
}

export type DocSource = 'file' | 'url' | 'sample' | 'recording' | 'draft';

export interface DocMeta {
  name: string;
  sizeBytes: number;
  source: DocSource;
}

export class AudioDocument {
  readonly buffer: AudioBufferLike;
  readonly meta: DocMeta;

  constructor(buffer: AudioBufferLike, meta: DocMeta) {
    this.buffer = buffer;
    this.meta = meta;
  }

  get duration(): number {
    return this.buffer.duration;
  }

  get sampleRate(): number {
    return this.buffer.sampleRate;
  }

  get channels(): number {
    return this.buffer.numberOfChannels;
  }

  get length(): number {
    return this.buffer.length;
  }

  channelData(channel: number): Float32Array {
    return this.buffer.getChannelData(channel);
  }
}
