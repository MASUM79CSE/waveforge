/**
 * AudioEngine — owns the AudioContext, playback transport and master gain.
 * One AudioBufferSourceNode per play invocation; the playhead derives from
 * the context clock via pure transportMath (drift-free).
 */
import { getErrorMessage } from '../core/errors';
import { logger } from '../core/logger-instance';
import type { AudioDocument } from './AudioDocument';
import { clampSeek, positionAt, type LoopRegion } from './transportMath';

const END_EPSILON = 0.005;
const MIN_LOOP_SECONDS = 0.01;
const STEREO = 2;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private splitter: ChannelSplitterNode | null = null;
  private merger: ChannelMergerNode | null = null;
  private chGains: GainNode[] = [];
  private swapped = false;
  private doc: AudioDocument | null = null;
  private source: AudioBufferSourceNode | null = null;
  private startedAtCtx = 0;
  private startOffset = 0;
  private stopTarget = 0;
  private rafId = 0;

  playing = false;
  loop = false;
  private loopRegion: LoopRegion | null = null;
  cursor = 0;

  onCursor: ((t: number) => void) | null = null;
  onPlayingChange: ((p: boolean) => void) | null = null;

  get document(): AudioDocument | null {
    return this.doc;
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      // spectrum tap: master → analyser (parallel branch, never muted)
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.75;
      this.master.connect(this.analyser);

      // per-channel routing: splitter → per-channel gain → merger → master
      this.splitter = this.ctx.createChannelSplitter(STEREO);
      this.merger = this.ctx.createChannelMerger(STEREO);
      this.chGains = [this.ctx.createGain(), this.ctx.createGain()];
      for (let ch = 0; ch < STEREO; ++ch) {
        const gain = this.chGains[ch];
        if (!gain) continue;
        // BOTH legs are required: splitter→gain feeds the chain, gain→merger
        // drains it. (Missing the first leg left stereo documents silent.)
        this.splitter.connect(gain, ch, 0);
        gain.connect(this.merger, 0, ch);
      }
      this.merger.connect(this.master);
      this.routeChannels();
      return this.ctx;
    } catch (error: unknown) {
      logger.error('AudioContext unavailable', { detail: getErrorMessage(error) });
      return null;
    }
  }

  private routeChannels(): void {
    if (!this.merger) return;
    for (let ch = 0; ch < STEREO; ++ch) {
      const gain = this.chGains[ch];
      if (!gain) continue;
      try {
        gain.disconnect();
      } catch {
        /* not yet connected */
      }
      const target = this.swapped ? (ch === 0 ? 1 : 0) : ch;
      gain.connect(this.merger, 0, target);
    }
  }

  onBlocked: (() => void) | null = null;
  private blockedNotified = false;

  /**
   * Resume the context, bounding the wait: under strict autoplay policies
   * (sandboxed iframes) `resume()` can stay pending forever. Reports via
   * `onBlocked` once per suspension episode; playback still starts so a
   * later unlock (gesture) makes it audible without re-pressing play.
   */
  private async resumeContext(): Promise<boolean> {
    const ctx = this.ensureContext();
    if (!ctx) return false;
    if (ctx.state === 'running') {
      this.blockedNotified = false;
      return true;
    }
    try {
      await Promise.race([
        ctx.resume(),
        new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 400)),
      ]);
    } catch (error: unknown) {
      logger.warn('AudioContext resume blocked', { detail: getErrorMessage(error) });
    }
    const state = ctx.state as AudioContextState; // assertion widens narrowing
    if (state === 'running') {
      this.blockedNotified = false;
      return true;
    }
    if (!this.blockedNotified) {
      this.blockedNotified = true;
      this.onBlocked?.();
    }
    return false;
  }

  /** Best-effort resume from a user gesture (pointer/key handlers). */
  unlockFromGesture(): void {
    if (this.ctx && this.ctx.state !== 'running') void this.ctx.resume().catch(() => {});
  }

  setDocument(doc: AudioDocument | null): void {
    this.teardownSource();
    this.playing = false;
    this.doc = doc;
    this.cursor = 0;
    this.stopTarget = 0;
    this.loop = false;
    this.loopRegion = null;
    this.onPlayingChange?.(false);
  }

  /** Spectrum tap for the analysis panel (null until the context exists). */
  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  setVolume(v: number): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    this.master.gain.value = Math.max(0, Math.min(1.5, v));
  }

  /** Mute/unmute a stereo channel (playback routing, not destructive). */
  setChannelMute(ch: number, muted: boolean): void {
    const ctx = this.ensureContext();
    const gain = this.chGains[ch];
    if (!ctx || !gain) return;
    gain.gain.value = muted ? 0 : 1;
  }

  /** Swap left/right output routing (flip channels). */
  setChannelsSwapped(swapped: boolean): void {
    this.ensureContext();
    this.swapped = swapped;
    this.routeChannels();
  }

  async play(): Promise<void> {
    const doc = this.doc;
    if (!doc || this.playing) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    if (!(await this.resumeContext())) return;

    const src = ctx.createBufferSource();
    // runtime documents always wrap a real AudioBuffer (AudioBufferLike is a
    // test-only structural view — see tests/unit/audioDocument.test.ts)
    src.buffer = doc.buffer as AudioBuffer;

    // stereo documents route through per-channel gains (mute/flip); mono
    // connects straight to the master to preserve proper upmixing
    if (doc.channels >= STEREO && this.splitter) src.connect(this.splitter);
    else src.connect(this.master);

    const duration = doc.duration;
    let from = this.cursor;
    if (from >= duration - END_EPSILON) {
      from = this.loop && this.loopRegion ? this.loopRegion.start : 0;
    }

    let region: LoopRegion | null = null;
    if (this.loop) {
      region = this.loopRegion ?? { start: 0, end: duration };
      if (region.end - region.start > MIN_LOOP_SECONDS) {
        src.loop = true;
        src.loopStart = region.start;
        src.loopEnd = region.end;
        this.loopRegion = region;
      }
    }

    this.stopTarget = from;
    this.startOffset = from;
    this.startedAtCtx = ctx.currentTime;

    src.onended = () => {
      if (this.source === src && this.playing) {
        this.playing = false;
        this.cursor = duration;
        this.teardownSource();
        this.onPlayingChange?.(false);
        this.onCursor?.(this.cursor);
      }
    };

    this.source = src;
    src.start(0, from);
    this.playing = true;
    this.onPlayingChange?.(true);
    this.tick();
  }

  pause(): void {
    if (!this.playing) return;
    this.cursor = this.position();
    this.playing = false;
    this.teardownSource();
    this.onPlayingChange?.(false);
  }

  stop(): void {
    if (!this.playing) return;
    const target = this.stopTarget;
    this.playing = false;
    this.teardownSource();
    this.cursor = target;
    this.onPlayingChange?.(false);
    this.onCursor?.(this.cursor);
  }

  seek(t: number): void {
    const duration = this.doc?.duration ?? 0;
    const target = clampSeek(t, duration);
    if (this.playing) {
      this.playing = false;
      this.teardownSource();
      this.cursor = target;
      void this.play();
    } else {
      this.cursor = target;
      this.stopTarget = target;
    }
    this.onCursor?.(this.cursor);
  }

  /** Enable looping over a region; null region loops the whole document. */
  setLoop(on: boolean, region: LoopRegion | null): void {
    this.loop = on;
    this.loopRegion = region && region.end - region.start > MIN_LOOP_SECONDS ? region : null;
    if (this.playing) {
      this.pause();
      void this.play();
    }
  }

  position(): number {
    const doc = this.doc;
    if (!doc) return 0;
    if (!this.playing || !this.ctx) return this.cursor;
    return positionAt(
      this.startOffset,
      this.startedAtCtx,
      this.ctx.currentTime,
      this.loop ? this.loopRegion : null,
      doc.duration,
    );
  }

  private tick = (): void => {
    if (!this.playing) return;
    this.cursor = this.position();
    this.onCursor?.(this.cursor);
    this.rafId = requestAnimationFrame(this.tick);
  };

  private teardownSource(): void {
    cancelAnimationFrame(this.rafId);
    const src = this.source;
    this.source = null;
    if (!src) return;
    src.onended = null;
    try {
      src.stop();
    } catch (error: unknown) {
      logger.debug('source already stopped', { detail: getErrorMessage(error) });
    }
    try {
      src.disconnect();
    } catch (error: unknown) {
      logger.debug('source already disconnected', { detail: getErrorMessage(error) });
    }
  }
}
