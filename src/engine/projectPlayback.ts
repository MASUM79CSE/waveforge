/**
 * ProjectPlayback — multitrack transport (M8b, docs/multitrack-plan.md).
 * One AudioBufferSourceNode per track → splitter → L/R balance-law gains →
 * shared merger. Gain values come from the SAME pure kernels as the mixdown
 * (`trackEffectiveGain` + `panGains`), so what you hear during multitrack
 * playback is exactly what mixdown renders (anchor-tested parity).
 * The single-document AudioEngine path is untouched.
 */
import { panGains, trackEffectiveGain } from './project';
import { positionAt, type LoopRegion } from './transportMath';

/** Structural track view (TrackState satisfies it; tests pass plain objects). */
export interface PlaybackTrack {
  channels: Float32Array[];
  gain: number;
  pan: number;
  mute: boolean;
  solo: boolean;
}

const MIN_LOOP_SECONDS = 0.01; // parity with AudioEngine
const END_EPSILON = 0.005;
const RAMP_TAU = 0.01; // D8 click-free convention

interface AudioParamLike {
  value: number;
  setTargetAtTime(value: number, startTime: number, timeConstant: number): void;
}

interface GraphSource {
  buffer: unknown;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
  onended: (() => void) | null;
  connect(dest: unknown, out?: number, in_?: number): unknown;
  start(when?: number, offset?: number): void;
  stop(): void;
  disconnect(): void;
}

interface GraphGain {
  gain: AudioParamLike;
  connect(dest: unknown, out?: number, in_?: number): unknown;
  disconnect(): void;
}

interface GraphSplitter {
  connect(dest: unknown, out?: number, in_?: number): unknown;
  disconnect(): void;
}

interface GraphBuffer {
  getChannelData(channel: number): Float32Array;
}

export interface GraphContext {
  currentTime: number;
  destination: unknown;
  createBufferSource(): GraphSource;
  createGain(): GraphGain;
  createChannelSplitter(n: number): GraphSplitter;
  createChannelMerger(n: number): GraphSplitter;
  createBuffer(channels: number, length: number, sampleRate: number): GraphBuffer;
}

export interface ProjectStartOptions {
  /** Timeline position in seconds. */
  from?: number;
  /** Loop region, or null for no loop (null region loops nothing here —
   * whole-project looping passes { start: 0, end: duration }). */
  loop?: LoopRegion | null;
}

interface TrackNodes {
  src: GraphSource;
  gL: GraphGain;
  gR: GraphGain;
  samples: number;
}

export class ProjectPlayback {
  private readonly ctx: GraphContext;
  private readonly sampleRate: number;
  private nodes: TrackNodes[] = [];
  private merger: GraphSplitter | null = null;
  private startedAtCtx = 0;
  private startOffset = 0;
  private loopRegion: LoopRegion | null = null;
  private duration = 0;
  playing = false;
  /** Fired once when the longest track's source ends naturally. */
  onEnded: (() => void) | null = null;

  constructor(ctx: GraphContext, sampleRate: number) {
    this.ctx = ctx;
    this.sampleRate = sampleRate;
  }

  /** Start (or restart) playback of the given tracks. */
  start(tracks: PlaybackTrack[], opts: ProjectStartOptions = {}): void {
    this.stop();
    if (tracks.length === 0) return;

    let maxLen = 0;
    let longest = 0;
    for (let i = 0; i < tracks.length; ++i) {
      const t = tracks[i]!;
      for (const ch of t.channels) {
        if (ch.length > maxLen) {
          maxLen = ch.length;
          longest = i;
        }
      }
    }
    this.duration = maxLen / this.sampleRate;

    const from = opts.from ?? 0;
    let begin = from;
    if (begin >= this.duration - END_EPSILON) begin = 0;

    const loop = opts.loop ?? null;
    this.loopRegion =
      loop && loop.end - loop.start > MIN_LOOP_SECONDS ? loop : null;

    this.merger = this.ctx.createChannelMerger(2);
    this.merger.connect(this.ctx.destination);

    const anySolo = tracks.some((t) => t.solo);
    this.nodes = tracks.map((t, i) => {
      const ch0 = t.channels[0]!;
      const ch1 = t.channels[1] ?? ch0;
      const buffer = this.ctx.createBuffer(2, ch0.length, this.sampleRate);
      buffer.getChannelData(0).set(ch0);
      buffer.getChannelData(1).set(ch1);

      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      const splitter = this.ctx.createChannelSplitter(2);
      const gL = this.ctx.createGain();
      const gR = this.ctx.createGain();
      const geff = trackEffectiveGain(t, anySolo);
      const [pl, pr] = panGains(t.pan);
      gL.gain.value = pl * geff;
      gR.gain.value = pr * geff;

      src.connect(splitter);
      splitter.connect(gL, 0, 0);
      splitter.connect(gR, 1, 0);
      gL.connect(this.merger!, 0, 0);
      gR.connect(this.merger!, 0, 1);

      if (this.loopRegion) {
        src.loop = true;
        src.loopStart = this.loopRegion.start;
        src.loopEnd = this.loopRegion.end;
      }
      if (i === longest) {
        src.onended = () => this.handleEnded();
      }

      src.start(0, begin);
      return { src, gL, gR, samples: ch0.length };
    });

    this.startOffset = begin;
    this.startedAtCtx = this.ctx.currentTime;
    this.playing = true;
  }

  /** Live mixer update (mute/solo/gain/pan) — click-free ramps, no restart. */
  updateMix(tracks: PlaybackTrack[]): void {
    if (!this.playing) return;
    const anySolo = tracks.some((t) => t.solo);
    const now = this.ctx.currentTime;
    const n = Math.min(tracks.length, this.nodes.length);
    for (let i = 0; i < n; ++i) {
      const t = tracks[i]!;
      const node = this.nodes[i]!;
      const geff = trackEffectiveGain(t, anySolo);
      const [pl, pr] = panGains(t.pan);
      node.gL.gain.setTargetAtTime(pl * geff, now, RAMP_TAU);
      node.gR.gain.setTargetAtTime(pr * geff, now, RAMP_TAU);
    }
  }

  stop(): void {
    this.playing = false;
    this.teardown();
  }

  /** Timeline position in seconds (drift-free via transportMath). */
  position(): number {
    if (!this.playing) return this.startOffset;
    return positionAt(
      this.startOffset,
      this.startedAtCtx,
      this.ctx.currentTime,
      this.loopRegion,
      this.duration,
    );
  }

  /** Natural end (longest track finished) → stop + notify. */
  private handleEnded(): void {
    if (!this.playing) return;
    this.playing = false;
    this.teardown();
    this.onEnded?.();
  }

  /** Silence + release every source; safe to call repeatedly. */
  private teardown(): void {
    for (const n of this.nodes) {
      n.src.onended = null;
      try {
        n.src.stop();
      } catch {
        /* already stopped */
      }
      try {
        n.src.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    this.nodes = [];
    if (this.merger) {
      try {
        this.merger.disconnect();
      } catch {
        /* already disconnected */
      }
      this.merger = null;
    }
  }
}
