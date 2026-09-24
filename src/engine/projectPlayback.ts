/**
 * ProjectPlayback — multitrack transport (M8b, docs/multitrack-plan.md).
 * One AudioBufferSourceNode per track → splitter → L/R balance-law gains →
 * shared merger. Gain values come from the SAME pure kernels as the mixdown
 * (`trackEffectiveGain` + `panGains`), so what you hear during multitrack
 * playback is exactly what mixdown renders (anchor-tested parity).
 * The single-document AudioEngine path is untouched.
 */
import { panGains, trackEffectiveGain } from './project';
import { evalCurve } from './automation';
import {
  expandClipPass,
  type ClipPlaybackTrack,
  type ScheduledClip,
} from './clipPlayback';
import { positionAt, type LoopRegion } from './transportMath';

export type { ClipPlaybackTrack, ScheduledClip };
export { expandClipPass };

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
  setValueAtTime(value: number, startTime: number): void;
  linearRampToValueAtTime(value: number, endTime: number): void;
  cancelScheduledValues(cancelTime: number): void;
  setTargetAtTime(value: number, startTime: number, timeConstant: number): void;
}

interface GraphSource {
  buffer: unknown;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
  onended: (() => void) | null;
  connect(dest: unknown, out?: number, in_?: number): unknown;
  start(when?: number, offset?: number, duration?: number): void;
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

/** Per-track audible gain legs shared by both scheduling paths. */
interface GainLegs {
  gL: GraphGain;
  gR: GraphGain;
}

export class ProjectPlayback {
  private readonly ctx: GraphContext;
  private readonly sampleRate: number;
  private nodes: TrackNodes[] = [];
  private clipTracks: ClipPlaybackTrack[] | null = null;
  private clipAnySolo = false;
  private clipLegs: GainLegs[] = [];
  private clipSources: GraphSource[] = [];
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
      const leg = this.makeLeg(t, anySolo);

      src.connect(splitter);
      splitter.connect(leg.gL, 0, 0);
      splitter.connect(leg.gR, 1, 0);

      if (this.loopRegion) {
        src.loop = true;
        src.loopStart = this.loopRegion.start;
        src.loopEnd = this.loopRegion.end;
      }
      if (i === longest) {
        src.onended = () => this.handleEnded();
      }

      src.start(0, begin);
      return { src, gL: leg.gL, gR: leg.gR, samples: ch0.length };
    });

    this.startOffset = begin;
    this.startedAtCtx = this.ctx.currentTime;
    this.playing = true;
  }

  /** Per-track L/R gain legs (balance law × effective gain) → merger. */
  private makeLeg(t: PlaybackTrack | ClipPlaybackTrack, anySolo: boolean): GainLegs {
    const gL = this.ctx.createGain();
    const gR = this.ctx.createGain();
    const geff = trackEffectiveGain(t, anySolo);
    const [pl, pr] = panGains(t.pan);
    gL.gain.value = pl * geff;
    gR.gain.value = pr * geff;
    gL.connect(this.merger!, 0, 0);
    gR.connect(this.merger!, 0, 1);
    return { gL, gR };
  }

  /** Live mixer update (mute/solo/gain/pan) — click-free ramps, no restart. */
  updateMix(tracks: readonly Pick<PlaybackTrack, 'gain' | 'pan' | 'mute' | 'solo'>[]): void {
    if (!this.playing) return;
    const anySolo = tracks.some((t) => t.solo);
    const now = this.ctx.currentTime;
    const legs: GainLegs[] = this.clipLegs.length > 0 ? this.clipLegs : this.nodes;
    const n = Math.min(tracks.length, legs.length);
    for (let i = 0; i < n; ++i) {
      const t = tracks[i]!;
      const auto = (t as ClipPlaybackTrack).automation;
      if (auto && (((auto.volume?.length ?? 0) > 0) || ((auto.pan?.length ?? 0) > 0))) {
        continue; // A3: automation owns these legs until the next (re)start
      }
      const node = legs[i]!;
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

  /**
   * Start (or restart) playback from the clip world (M9c): one source per
   * audible clip. Loop semantics: schedule one pass over the region and
   * restart it when the pass's last source ends (restart-on-loop). Position
   * math and gain kernels are shared with the channel path — what you hear
   * stays exactly what the mixdown renders.
   */
  startClips(tracks: readonly ClipPlaybackTrack[], opts: ProjectStartOptions = {}): void {
    this.stop();
    if (tracks.length === 0) return;

    let endSample = 0;
    for (const t of tracks) {
      for (const c of t.clips) {
        if (c.start + c.duration > endSample) endSample = c.start + c.duration;
      }
    }
    this.duration = endSample / this.sampleRate;

    const from = opts.from ?? 0;
    let begin = from;
    if (begin >= this.duration - END_EPSILON) begin = 0;

    const loop = opts.loop ?? null;
    this.loopRegion =
      loop && loop.end - loop.start > MIN_LOOP_SECONDS ? loop : null;

    this.merger = this.ctx.createChannelMerger(2);
    this.merger.connect(this.ctx.destination);

    const anySolo = tracks.some((t) => t.solo);
    this.clipTracks = [...tracks];
    this.clipAnySolo = anySolo;
    this.clipLegs = tracks.map((t) => this.makeLeg(t, anySolo));

    const winStart = this.loopRegion ? Math.max(begin, this.loopRegion.start) : begin;
    const winEnd = this.loopRegion ? this.loopRegion.end : this.duration;
    if (this.schedulePass(winStart, winEnd, begin) === 0) {
      // e.g. a loop over an empty gap: nothing to play, don't hang "playing"
      this.playing = false;
      this.teardown();
      return;
    }

    this.startOffset = begin;
    this.startedAtCtx = this.ctx.currentTime;
    this.playing = true;
  }

  /** Schedule one clip pass into [winStart, winEnd); returns source count. */
  private schedulePass(winStart: number, winEnd: number, passStart: number): number {
    const list = expandClipPass(
      this.clipTracks!,
      this.sampleRate,
      passStart,
      winStart,
      winEnd,
    );
    const now = this.ctx.currentTime;
    let bestEnd = -1;
    let bestSrc: GraphSource | null = null;
    for (const sc of list) {
      const src = this.ctx.createBufferSource();
      const a0 = sc.asset.channels[0]!;
      const a1 = sc.asset.channels[1] ?? a0;
      const spanLen = Math.min(sc.spanLen, a0.length - sc.spanStart);
      const buffer = this.ctx.createBuffer(2, Math.max(1, spanLen), this.sampleRate);
      buffer.getChannelData(0).set(a0.subarray(sc.spanStart, sc.spanStart + spanLen));
      buffer.getChannelData(1).set(a1.subarray(sc.spanStart, sc.spanStart + spanLen));
      src.buffer = buffer;

      const splitter = this.ctx.createChannelSplitter(2);
      src.connect(splitter);
      const leg = this.clipLegs[sc.trackIndex]!;
      splitter.connect(leg.gL, 0, 0);
      splitter.connect(leg.gR, 1, 0);

      src.start(now + sc.when, sc.offset, sc.dur);
      this.clipSources.push(src);
      const endsAt = sc.when + sc.dur;
      if (endsAt > bestEnd) {
        bestEnd = endsAt;
        bestSrc = src;
      }
    }
    if (bestSrc) {
      const restart = this.loopRegion !== null;
      bestSrc.onended = restart ? () => this.handlePassEnded() : () => this.handleEnded();
    }
    this.stampClipLegs(passStart, winEnd);
    return list.length;
  }

  /**
   * A3: stamp automation curves onto the clip legs for one pass. Piecewise-
   * linear breakpoints in the sample domain map to ctx time
   * `now + (at/sr − passStart)`; the param holds after the last knot (matches
   * evalCurve's endpoint clamp). No curves → NO param calls at all (zero extra
   * scheduling, the bit-identity guard carries over to the monitor path).
   * Monitor tolerance: WebAudio ramps are control-rate (≈per audio block), so
   * playback may deviate from the per-sample render between knots by design —
   * the render (mixdown) is the reference.
   */
  private stampClipLegs(passStart: number, winEnd: number): void {
    const tracks = this.clipTracks;
    if (!tracks) return;
    const now = this.ctx.currentTime;
    const sr = this.sampleRate;
    for (let i = 0; i < this.clipLegs.length; ++i) {
      const t = tracks[i]!;
      const vol = t.automation?.volume;
      const panC = t.automation?.pan;
      const hasVol = !!vol && vol.length > 0;
      const hasPan = !!panC && panC.length > 0;
      if (!hasVol && !hasPan) continue; // zero extra calls
      const geff = trackEffectiveGain(t, this.clipAnySolo);
      // merged, sorted knot seconds strictly inside (passStart, winEnd]
      const knots = new Set<number>();
      if (hasVol) for (const pt of vol!) knots.add(pt.at / sr);
      if (hasPan) for (const pt of panC!) knots.add(pt.at / sr);
      const sorted = [...knots].filter((s) => s > passStart && s <= winEnd).sort((a, b) => a - b);
      const valueAt = (side: 'L' | 'R') => (pos: number): number => {
        const p = hasPan ? evalCurve(panC!, pos * sr) : t.pan;
        const [gl, gr] = panGains(p);
        const m = hasVol ? evalCurve(vol!, pos * sr) : 1;
        return (side === 'L' ? gl : gr) * geff * m;
      };
      this.stampParam(this.clipLegs[i]!.gL.gain, valueAt('L'), sorted, passStart, now);
      this.stampParam(this.clipLegs[i]!.gR.gain, valueAt('R'), sorted, passStart, now);
    }
  }

  /** One leg param: cancel pending, re-anchor at passStart, ramp the knots. */
  private stampParam(
    param: AudioParamLike,
    valueAt: (pos: number) => number,
    knots: number[],
    passStart: number,
    now: number,
  ): void {
    param.cancelScheduledValues(now);
    param.setValueAtTime(valueAt(passStart), now);
    for (const s of knots) {
      param.linearRampToValueAtTime(valueAt(s), now + (s - passStart));
    }
  }

  /** A loop pass finished → schedule the next pass anchored at loop start. */
  private handlePassEnded(): void {
    if (!this.playing) return;
    const loop = this.loopRegion;
    if (loop && this.clipTracks) {
      this.releasePassSources();
      if (this.schedulePass(loop.start, loop.end, loop.start) === 0) {
        this.playing = false;
        this.teardown();
        return;
      }
      this.startOffset = loop.start;
      this.startedAtCtx = this.ctx.currentTime;
      return;
    }
    this.playing = false;
    this.teardown();
    this.onEnded?.();
  }

  /** Stop + disconnect every clip-pass source (legs and merger stay). */
  private releasePassSources(): void {
    for (const src of this.clipSources) {
      src.onended = null;
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
      try {
        src.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    this.clipSources = [];
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
    this.releasePassSources();
    this.clipLegs = [];
    this.clipTracks = null;
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
