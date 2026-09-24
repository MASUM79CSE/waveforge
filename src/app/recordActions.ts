/**
 * Recording actions (M4): constraints persistence, start/stop lifecycle,
 * duration guard, meter → signal plumbing, and turning a finished take
 * into the active document (stage-then-swap not needed — a recording is a
 * fresh install).
 */
import { RECORD_MAX_SECONDS, RECORD_SETTINGS_KEY } from '../core/constants';
import { logger } from '../core/logger-instance';
import { RecorderEngine, type MicConstraints } from '../engine/recorder';
import { AudioDocument } from '../engine/AudioDocument';
import { t } from '../i18n';
import { toastError, toastInfo } from './actions';
import { getSharedContext } from '../io/decode';
import { installDoc } from './runtime';
import { addProjectTrack, conformToProjectRate, ensureProject } from './projectActions';
import { createTrack } from '../engine/project';
import * as S from './state';

export const recorder = new RecorderEngine();

const DEFAULT_CONSTRAINTS: MicConstraints = {
  echoCancellation: false,
  noiseSuppression: true,
  autoGainControl: false,
};

let takeCounter = 0;
let timerInterval = 0;
let warnedLong = false;

export function loadConstraints(): MicConstraints {
  try {
    const raw = localStorage.getItem(`${'waveforge'}.${RECORD_SETTINGS_KEY}`);
    if (!raw) return DEFAULT_CONSTRAINTS;
    const parsed = JSON.parse(raw) as Partial<MicConstraints>;
    return {
      echoCancellation: Boolean(parsed.echoCancellation),
      noiseSuppression: Boolean(parsed.noiseSuppression),
      autoGainControl: Boolean(parsed.autoGainControl),
      deviceId: typeof parsed.deviceId === 'string' && parsed.deviceId ? parsed.deviceId : undefined,
    };
  } catch {
    return DEFAULT_CONSTRAINTS;
  }
}

export function saveConstraints(constraints: MicConstraints): void {
  try {
    localStorage.setItem(
      `${'waveforge'}.${RECORD_SETTINGS_KEY}`,
      JSON.stringify({
        echoCancellation: constraints.echoCancellation,
        noiseSuppression: constraints.noiseSuppression,
        autoGainControl: constraints.autoGainControl,
        deviceId: constraints.deviceId,
      }),
    );
  } catch (error: unknown) {
    logger.warn('could not persist recording settings', { detail: String(error) });
  }
}

recorder.onLevel = (level) => {
  S.recLevel.value = level;
};
recorder.onChunkError = (detail) => {
  logger.error('recorder dropped a chunk', { detail });
};

export async function toggleRecord(): Promise<void> {
  if (S.recording.value) {
    await stopRecording();
    return;
  }
  await startRecording();
}

async function startRecording(): Promise<void> {
  if (S.recording.value) return;
  try {
    await recorder.start(loadConstraints());
  } catch (error: unknown) {
    const denied = error instanceof DOMException && error.name === 'NotAllowedError';
    toastError(denied ? t().recNoPermission : t().recordFailed);
    logger.error('recording failed to start', { detail: String(error) });
    return;
  }
  warnedLong = false;
  S.recSeconds.value = 0;
  S.recording.value = true;
  toastInfo(t().recordStart);
  timerInterval = window.setInterval(() => {
    S.recSeconds.value += 1;
    if (S.recSeconds.value >= RECORD_MAX_SECONDS && !warnedLong) {
      warnedLong = true;
      toastInfo(t().recordTooLong);
      void stopRecording();
    }
  }, 1000);
}

async function stopRecording(): Promise<void> {
  if (!S.recording.value) return;
  window.clearInterval(timerInterval);
  S.recording.value = false;
  const take = await recorder.stop();
  S.recLevel.value = { peakDb: Number.NEGATIVE_INFINITY, rmsDb: Number.NEGATIVE_INFINITY };
  if (!take || take.channels[0]?.length === 0) {
    toastError(t().recordFailed);
    return;
  }

  takeCounter += 1;
  const frames = take.channels[0]?.length ?? 0;

  // M8f: with a project open, the take lands as a NEW LANE (the project
  // survives); without one the take stays a fresh document (M4 behavior).
  if (S.projectOpen.value) {
    try {
      ensureProject();
      const projectRate = S.docInfo.value?.sampleRate ?? take.sampleRate;
      addProjectTrack(
        createTrack(
          conformToProjectRate(
            take.channels.map((c) => c.slice()),
            take.sampleRate,
            projectRate,
          ),
          { name: `Recording ${takeCounter}` },
        ),
      );
      toastInfo(`${t().recordReady} — ${t().trackImported}: Recording ${takeCounter}`);
      return;
    } catch {
      /* fall through to the document path */
    }
  }

  // a REAL AudioBuffer on the shared context: the engine hands doc.buffer
  // straight to AudioBufferSourceNode, and the peaks worker reads it too
  const audioBuffer = getSharedContext().createBuffer(
    take.channels.length,
    Math.max(1, frames),
    take.sampleRate,
  );
  take.channels.forEach((data, ch) => {
    audioBuffer.copyToChannel(data as Float32Array<ArrayBuffer>, ch);
  });
  const doc = new AudioDocument(audioBuffer, {
    name: `Recording ${takeCounter}`,
    sizeBytes: frames * 4 * take.channels.length,
    source: 'recording',
  });
  installDoc(doc); // adopts into the editor (fresh session)
  toastInfo(t().recordReady);
}
