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

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
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
      return this.ctx;
    } catch (error: unknown) {
      logger.error('AudioContext unavailable', { detail: getErrorMessage(error) });
      return null;
    }
  }

  private async resumeContext(): Promise<boolean> {
    const ctx = this.ensureContext();
    if (!ctx) return false;
    if (ctx.state === 'running') return true;
    try {
      await ctx.resume();
      return true;
    } catch (error: unknown) {
      logger.warn('AudioContext resume blocked', { detail: getErrorMessage(error) });
      return false;
    }
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

  setVolume(v: number): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    this.master.gain.value = Math.max(0, Math.min(1.5, v));
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
    src.connect(this.master);

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
