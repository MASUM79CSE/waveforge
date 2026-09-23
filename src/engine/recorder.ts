/**
 * RecorderEngine (M4, browser-only): getUserMedia → AnalyserNode (meter)
 * → AudioWorkletNode 'wf-recorder' (chunks → RecordBuffer). Falls back to
 * a ScriptProcessorNode when AudioWorklet is unavailable. Stopping yields
 * the take as channel arrays at the context rate. Streams/nodes are fully
 * torn down on stop and error (ADR 006 security review).
 */
import workletUrl from '../worklets/recorder.worklet.js?url';
import { meterLevel, type MeterLevel } from './meter';
import { RecordBuffer } from './recordBuffer';

export interface MicConstraints {
  deviceId?: string;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
}

export interface RecordingTake {
  channels: Float32Array[];
  sampleRate: number;
}

export type RecorderState = 'idle' | 'recording';

const FALLBACK_BUFFER_FRAMES = 4096;

export class RecorderEngine {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private worklet: AudioWorkletNode | null = null;
  private legacy: ScriptProcessorNode | null = null;
  private sink: GainNode | null = null;
  private buffer: RecordBuffer | null = null;
  private channelCount = 1;
  private meterRaf = 0;
  private meterData: Float32Array<ArrayBuffer> = new Float32Array(1024);

  state: RecorderState = 'idle';
  onLevel: ((level: MeterLevel) => void) | null = null;
  onChunkError: ((detail: string) => void) | null = null;

  get sampleRate(): number {
    return this.ctx?.sampleRate ?? 48000;
  }

  async start(constraints: MicConstraints): Promise<void> {
    if (this.state === 'recording') return;
    const audio: MediaTrackConstraints = {
      echoCancellation: constraints.echoCancellation,
      noiseSuppression: constraints.noiseSuppression,
      autoGainControl: constraints.autoGainControl,
    };
    if (constraints.deviceId) audio.deviceId = { exact: constraints.deviceId };

    this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') await this.ctx.resume().catch(() => {});
    this.stream = await navigator.mediaDevices.getUserMedia({ audio });

    this.channelCount = Math.min(2, this.stream.getAudioTracks()[0]?.getSettings().channelCount ?? 1) || 1;
    this.buffer = new RecordBuffer(this.channelCount);

    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = this.meterData.length;
    this.sink = this.ctx.createGain();
    this.sink.gain.value = 0; // monitor path exists but is muted (no feedback)

    let usedWorklet = false;
    try {
      await this.ctx.audioWorklet.addModule(workletUrl);
      this.worklet = new AudioWorkletNode(this.ctx, 'wf-recorder', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [this.channelCount],
        channelCount: this.channelCount,
        channelCountMode: 'explicit',
      });
      this.worklet.port.onmessage = (event) => this.onWorkletMessage(event.data);
      this.source.connect(this.worklet);
      this.worklet.connect(this.sink);
      usedWorklet = true;
    } catch {
      usedWorklet = false;
    }
    if (!usedWorklet) {
      // legacy fallback (deprecated API — last resort only)
      this.legacy = this.ctx.createScriptProcessor(FALLBACK_BUFFER_FRAMES, this.channelCount, this.channelCount);
      this.legacy.onaudioprocess = (event) => {
        const chunks: Float32Array[] = [];
        for (let ch = 0; ch < this.channelCount; ++ch) {
          chunks.push(new Float32Array(event.inputBuffer.getChannelData(ch)));
        }
        this.pushChunks(chunks);
      };
      this.source.connect(this.legacy);
      this.legacy.connect(this.sink);
    }
    this.source.connect(this.analyser);
    this.sink.connect(this.ctx.destination);

    this.state = 'recording';
    this.tickMeter();
  }

  async stop(): Promise<RecordingTake | null> {
    if (this.state !== 'recording') return null;
    this.state = 'idle';
    cancelAnimationFrame(this.meterRaf);
    this.worklet?.port.postMessage({ cmd: 'flush' });
    // let the flush message land before snapshotting
    await new Promise((resolve) => setTimeout(resolve, 60));

    const take = this.buffer && this.buffer.length > 0
      ? { channels: this.buffer.snapshot(), sampleRate: this.ctx?.sampleRate ?? 48000 }
      : null;
    this.teardown();
    return take;
  }

  private onWorkletMessage(msg: { type?: string; frames?: number; channels?: Float32Array[] }): void {
    if (msg.type !== 'chunk') return;
    const channels = msg.channels;
    if (!Array.isArray(channels)) return;
    this.pushChunks(channels);
  }

  private pushChunks(chunks: Float32Array[]): void {
    try {
      this.buffer?.push(chunks);
    } catch (error: unknown) {
      this.onChunkError?.(String(error));
    }
  }

  private tickMeter = (): void => {
    if (this.state !== 'recording' || !this.analyser) return;
    this.analyser.getFloatTimeDomainData(this.meterData);
    this.onLevel?.(meterLevel(this.meterData));
    this.meterRaf = requestAnimationFrame(this.tickMeter);
  };

  /** Full teardown: every node, stream track and context reference. */
  private teardown(): void {
    cancelAnimationFrame(this.meterRaf);
    try {
      this.worklet?.disconnect();
      this.legacy?.disconnect();
      this.analyser?.disconnect();
      this.source?.disconnect();
      this.sink?.disconnect();
    } catch {
      /* already disconnected */
    }
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    void this.ctx?.close().catch(() => {});
    this.worklet = null;
    this.legacy = null;
    this.analyser = null;
    this.source = null;
    this.sink = null;
    this.stream = null;
    this.ctx = null;
    this.buffer = null;
  }
}
