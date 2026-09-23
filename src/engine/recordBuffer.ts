/**
 * Recording accumulator (M4): takes transferable per-channel chunks from
 * the recorder worklet and grows per-channel storage geometrically. Pure —
 * the browser layer (RecorderEngine) only feeds it.
 */
const INITIAL_CAPACITY = 1 << 16; // 65536 frames ≈ 1.5 s @ 44.1 kHz

export class RecordBuffer {
  private channels: Float32Array[] = [];
  private filled = 0;

  constructor(private readonly channelCount: number) {
    this.channels = Array.from({ length: channelCount }, () => new Float32Array(0));
  }

  get length(): number {
    return this.filled;
  }

  /** Append one chunk per channel (transferable buffers were copied in). */
  push(chunks: Float32Array[]): void {
    if (chunks.length !== this.channelCount) {
      throw new Error(`RecordBuffer: expected ${this.channelCount} chunks, got ${chunks.length}`);
    }
    const incoming = chunks[0]?.length ?? 0;
    this.ensureCapacity(this.filled + incoming);
    for (let ch = 0; ch < this.channelCount; ++ch) {
      const target = this.channels[ch];
      if (target) target.set(chunks[ch] ?? new Float32Array(0), this.filled);
    }
    this.filled += incoming;
  }

  /** Cut to the final length; rejects sizes larger than what was recorded. */
  trim(length: number): boolean {
    if (length < 0 || length > this.filled) return false;
    this.filled = length;
    return true;
  }

  reset(): void {
    this.filled = 0;
  }

  snapshot(): Float32Array[] {
    return this.channels.map((ch) => (ch ?? new Float32Array(0)).slice(0, this.filled));
  }

  private ensureCapacity(frames: number): void {
    if (frames <= (this.channels[0]?.length ?? 0)) return;
    let capacity = INITIAL_CAPACITY;
    while (capacity < frames) capacity *= 2;
    this.channels = this.channels.map((ch) => {
      const grown = new Float32Array(capacity);
      grown.set(ch ?? new Float32Array(0));
      return grown;
    });
  }
}
