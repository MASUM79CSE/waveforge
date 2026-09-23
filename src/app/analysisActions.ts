/**
 * Analysis actions (M5): BPM detection and LUFS measurement run in the
 * analysis worker (main thread never blocks); results land in signals and
 * feed the wave view (beat grid) and the analysis panel. Any document swap
 * invalidates results — analysis always reflects the current audio.
 */
import { logger } from '../core/logger-instance';
import { t } from '../i18n';
import { toastInfo, toastError } from './actions';
import { currentChannels } from './editActions';
import { getDoc, renderer } from './runtime';
import * as S from './state';

interface BpmReply {
  type: 'bpm';
  bpm: number;
  beats: number[];
  confidence: number;
  profile: { onsetMs: number; detectMs: number };
}
interface LufsReply {
  type: 'lufs';
  integrated: number;
  momentaryMax: number;
  shortTermMax: number;
  momentaryBlocks: number;
  profile: { lufsMs: number };
}
type Reply = BpmReply | LufsReply | { type: 'error'; detail: string };

function spawnAnalysisWorker(): Worker {
  return new Worker(new URL('../workers/analysis.worker.ts', import.meta.url), {
    type: 'module',
  });
}

/** Copies — never transfer document buffers (postMessage detaches them). */
function channelCopies(): Float32Array[] {
  return currentChannels().map((channel) => channel.slice());
}

/**
 * Post with the channels' underlying ArrayBuffers in the transfer list —
 * Chromium does not accept TypedArray views as transferables directly.
 * Falls back to a plain (cloned) post when transfer fails.
 */
function sendTo(
  worker: Worker,
  message:
    | { cmd: 'measure-lufs'; id: number; sampleRate: number; left?: Float32Array; right?: Float32Array }
    | { cmd: 'detect-bpm'; id: number; sampleRate: number; left?: Float32Array; right?: Float32Array },
): void {
  const left = message.left;
  const right = message.right;
  try {
    const transfer: ArrayBuffer[] = [];
    // our copies are never SharedArrayBuffer-backed
    if (left) transfer.push(left.buffer as ArrayBuffer);
    if (right) transfer.push(right.buffer as ArrayBuffer);
    worker.postMessage(message, transfer);
  } catch {
    worker.postMessage(message);
  }
}

function fmt(n: number): string {
  return n <= Number.NEGATIVE_INFINITY ? '−∞' : n.toFixed(1);
}

export function measureLoudness(): void {
  const doc = getDoc();
  if (!doc || S.analysisBusy.value) return;
  S.analysisBusy.value = 'lufs';
  const worker = spawnAnalysisWorker();
  worker.onerror = () => {
    worker.terminate();
    S.analysisBusy.value = null;
    toastError(t().analyzeFailed);
  };
  worker.onmessage = (event: MessageEvent<Reply>) => {
    const msg = event.data;
    worker.terminate();
    S.analysisBusy.value = null;
    if (msg.type !== 'lufs') {
      toastError(t().analyzeFailed);
      return;
    }
    logger.info('[profile] LUFS measure', { ms: msg.profile.lufsMs, sr: doc.sampleRate, ch: doc.channels });
    S.lufsResult.value = {
      integrated: msg.integrated,
      momentaryMax: msg.momentaryMax,
      shortTermMax: msg.shortTermMax,
    };
    toastInfo(t().lufsDone(fmt(msg.integrated)));
  };
  const channels = channelCopies();
  sendTo(worker, {
    cmd: 'measure-lufs',
    id: 1,
    sampleRate: doc.sampleRate,
    left: channels[0],
    right: channels[1],
  });
}

export function detectBpm(): void {
  const doc = getDoc();
  if (!doc || S.analysisBusy.value) return;
  S.analysisBusy.value = 'bpm';
  const worker = spawnAnalysisWorker();
  worker.onerror = () => {
    worker.terminate();
    S.analysisBusy.value = null;
    toastError(t().analyzeFailed);
  };
  worker.onmessage = (event: MessageEvent<Reply>) => {
    const msg = event.data;
    worker.terminate();
    S.analysisBusy.value = null;
    if (msg.type !== 'bpm') {
      toastError(t().analyzeFailed);
      return;
    }
    logger.info('[profile] BPM detect', {
      ms: msg.profile.onsetMs + msg.profile.detectMs,
      onsetMs: msg.profile.onsetMs,
      detectMs: msg.profile.detectMs,
    });
    if (msg.bpm === 0 || msg.beats.length === 0) {
      toastInfo(t().bpmNotFound);
      return;
    }
    S.bpmResult.value = {
      bpm: msg.bpm,
      beatCount: msg.beats.length,
      confidence: msg.confidence,
    };
    S.beats.value = msg.beats;
    applyBeatGrid();
    toastInfo(t().bpmDone(msg.bpm, msg.beats.length));
  };
  const channels = channelCopies();
  sendTo(worker, {
    cmd: 'detect-bpm',
    id: 1,
    sampleRate: doc.sampleRate,
    left: channels[0],
    right: channels[1],
  });
}

/** Push the current beats signal into the renderer (grid visibility). */
export function applyBeatGrid(): void {
  renderer.setBeats(S.beatsShown.value ? S.beats.value : []);
}

export function toggleBeatsShown(): void {
  S.setBeatsShown(!S.beatsShown.value);
  applyBeatGrid();
}

export function isBeatsShown(): boolean {
  return S.beatsShown.value;
}

export function toggleAnalysisPanel(): void {
  S.setAnalysisPanelOpen(!S.analysisPanelOpen.value);
}

export function isAnalysisPanelOn(): boolean {
  return S.analysisPanelOpen.value;
}

export function isAnalysisBusy(): 'bpm' | 'lufs' | null {
  return S.analysisBusy.value;
}

/** Document changed (load or edit) → analysis results are stale. */
export function invalidateAnalysis(): void {
  S.bpmResult.value = null;
  S.lufsResult.value = null;
  S.beats.value = [];
  applyBeatGrid();
}
