/**
 * Recording actions (M4): constraints persistence, start/stop lifecycle,
 * duration guard, meter → signal plumbing, and turning a finished take
 * into the active document (stage-then-swap not needed — a recording is a
 * fresh install).
 */
import { RECORD_MAX_SECONDS, RECORD_SETTINGS_KEY } from '../core/constants';
import { logger } from '../core/logger-instance';
import { RecorderEngine, type MicConstraints } from '../engine/recorder';
import { advanceHold, initialHold } from '../engine/meter';
import { clickSchedule } from '../engine/metronome';
import { punchPlan } from '../engine/punch';
import { appendTake, discardLast, keepTake, type TakesState } from '../engine/takes';
import { scheduleClicks } from './clickTrack';
import { AudioDocument } from '../engine/AudioDocument';
import { t } from '../i18n';
import { toastError, toastInfo } from './actions';
import { getSharedContext } from '../io/decode';
import { getDoc, engine, installDoc, performEdit } from './runtime';
import { addProjectTrack, conformToProjectRate, ensureProject, registerLaneAsset } from './projectActions';
import { makeOverwritePaste } from '../engine/editOps';
import { currentChannels } from './editActions';
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

/** R2: studio settings (count-in/click/monitor) — persisted separately. */
const STUDIO_KEY = 'waveforge.recStudio';

export function loadStudio(): S.RecStudioSettings {
  try {
    const raw = localStorage.getItem(STUDIO_KEY);
    if (!raw) return S.recStudio.value;
    const p = JSON.parse(raw) as Partial<S.RecStudioSettings>;
    return {
      countInBars: Math.min(4, Math.max(0, Number(p.countInBars ?? 1))),
      metronome: Boolean(p.metronome),
      useDetectedBpm: Boolean(p.useDetectedBpm),
      manualBpm: Math.min(240, Math.max(40, Number(p.manualBpm ?? 120))),
      clickVolume: Math.min(1, Math.max(0, Number(p.clickVolume ?? 0.8))),
      monitoring: Boolean(p.monitoring),
    };
  } catch {
    return S.recStudio.value;
  }
}

export function saveStudio(settings: S.RecStudioSettings): void {
  S.recStudio.value = settings;
  if (S.armed.value) recorder.setMonitor(settings.monitoring);
  try {
    localStorage.setItem(STUDIO_KEY, JSON.stringify(settings));
  } catch (error: unknown) {
    logger.warn('could not persist studio settings', { detail: String(error) });
  }
}

let monitorWarned = false;

/** R1: input monitoring toggle — first enable per session warns about feedback. */
export function setMonitoring(on: boolean): void {
  saveStudio({ ...S.recStudio.value, monitoring: on });
  if (on && !monitorWarned && S.armed.value) {
    monitorWarned = true;
    toastInfo(t().monitorWarning);
  }
  toastInfo(on ? t().monitorOn : t().monitorOff);
}

/** R2: metronome on/off (M / menu). */
export function toggleMetronome(): void {
  const next = { ...S.recStudio.value, metronome: !S.recStudio.value.metronome };
  saveStudio(next);
  toastInfo(next.metronome ? t().metronomeOn : t().metronomeOff);
}

export function resetClipLatch(): void {
  hold = { ...hold, clip: false };
  S.clipLatched.value = false;
}

function tempoBpm(): number {
  const st = S.recStudio.value;
  return st.useDetectedBpm ? S.bpmResult.value?.bpm ?? st.manualBpm : st.manualBpm;
}

export async function toggleRecord(): Promise<void> {
  if (S.recording.value) {
    await stopRecording();
    return;
  }
  if (S.armed.value) {
    await rollRecord();
    return;
  }
  await armRecord();
}

/** R1: arm — open the mic + live meter BEFORE rolling (permission prompt). */
export async function armRecord(): Promise<void> {
  if (S.armed.value || S.recording.value) return;
  try {
    await recorder.open(loadConstraints());
  } catch (error: unknown) {
    const denied = error instanceof DOMException && error.name === 'NotAllowedError';
    toastError(denied ? t().recNoPermission : t().recordFailed);
    logger.error('arming failed', { detail: String(error) });
    return;
  }
  hold = initialHold();
  S.clipLatched.value = false;
  S.armed.value = true;
  toastInfo(t().recArmed);
}

/** R1: disarm — release the mic without a take. */
export async function disarmRecord(): Promise<void> {
  if (!S.armed.value) return;
  await recorder.disarm();
  S.armed.value = false;
  S.recLevel.value = { peakDb: Number.NEGATIVE_INFINITY, rmsDb: Number.NEGATIVE_INFINITY };
  S.peakHoldDb.value = Number.NEGATIVE_INFINITY;
}

function beginRecording(): void {
  recorder.beginCapture();
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

/** R2: roll — optional count-in (clicks + on-screen beats), then capture. */
async function rollRecord(): Promise<void> {
  const st = S.recStudio.value;
  const bars = st.metronome ? st.countInBars : 0;
  if (bars <= 0) {
    beginRecording();
    return;
  }
  recorder.setMonitor(st.monitoring);
  const bpm = tempoBpm();
  const beatSec = 60 / Math.min(240, Math.max(40, bpm));
  const countInSec = bars * 4 * beatSec; // 4/4
  const clicks = clickSchedule({ bpm, bars, beatsPerBar: 4, preRollSec: 0 });
  const ctx = getSharedContext();
  const base = ctx.currentTime + 0.08;
  scheduleClicks(clicks, base, st.clickVolume);
  S.countInBeat.value = bars * 4;
  countInTimers.push(
    window.setTimeout(() => {
      S.countInBeat.value = 0;
      beginRecording();
    }, countInSec * 1000),
  );
  for (let beat = 1; beat < bars * 4; ++beat) {
    countInTimers.push(
      window.setTimeout(() => {
        S.countInBeat.value = bars * 4 - beat;
      }, beat * beatSec * 1000),
    );
  }
}

/** R3: session takes list management. */
function addTake(state: TakesState, seconds: number): void {
  const appended = appendTake(state, seconds);
  S.takes.value = keepTake(appended, state.nextId); // committed = kept
}

export function discardLastTake(): void {
  const next = discardLast(S.takes.value);
  if (next === S.takes.value) return;
  S.takes.value = next;
  toastInfo(t().takeDiscardHint);
}

/** R2: abort a running count-in (Esc / re-press) — stays armed. */
export function cancelCountIn(): void {
  for (const id of countInTimers) window.clearTimeout(id);
  countInTimers = [];
  S.countInBeat.value = 0;
}

// ---- R4: punch in/out (docs/recording-plan.md) ----

/** v1 pre-roll: 1.5 s of the existing audio before the punch-in point. */
const PUNCH_PRE_ROLL_SEC = 1.5;
let punchTimers: number[] = [];
let countInTimers: number[] = [];
let punchRunning = false;

export function punchBusy(): boolean {
  return punchRunning;
}

/**
 * Punch in/out over the selection: count-in -> pre-roll playback -> capture
 * between the selection edges -> one undoable overwrite edit (the replaced
 * material stays in history -- non-destructive by contract).
 */
export async function punchRecord(): Promise<void> {
  if (punchRunning || S.recording.value) return;
  const doc = getDoc();
  if (!doc) {
    toastInfo(t().recordNeedsDoc);
    return;
  }
  const sel = S.selection.value;
  if (!sel) {
    toastInfo(t().punchNeedsSelection);
    return;
  }
  const rate = doc.sampleRate;
  const start = Math.max(0, Math.round(Math.min(sel.start, sel.end) * rate));
  const end = Math.min(doc.length, Math.round(Math.max(sel.start, sel.end) * rate));
  if (end - start < 2) {
    toastInfo(t().punchNeedsSelection);
    return;
  }
  if (!S.armed.value) {
    await armRecord();
    if (!S.armed.value) return; // arm failed (permission) -- abort
  }
  const st = S.recStudio.value;
  if (!st.monitoring) {
    toastInfo(t().punchNeedsMonitor);
    return;
  }

  const bpm = tempoBpm();
  const beatSec = 60 / Math.min(240, Math.max(40, bpm));
  const bars = st.metronome ? st.countInBars : 0;
  const plan = punchPlan({ start, end, rate, preRollSec: PUNCH_PRE_ROLL_SEC, countInBars: bars, bpm, beatsPerBar: 4 });
  const preRollSec = (plan.punchInFrame - plan.playFromFrame) / rate;
  const punchSec = (plan.punchOutFrame - plan.punchInFrame) / rate;
  punchRunning = true;

  const ctx = getSharedContext();
  const base = ctx.currentTime + 0.08;
  const countInSec = plan.countInSec;

  // clicks: count-in window, then the seamless grid across the pre-roll
  scheduleClicks(plan.clicks, base + countInSec, st.clickVolume);
  if (preRollSec > 0) {
    const grid = clickSchedule({ bpm, bars: Math.max(1, Math.ceil(preRollSec / beatSec)), beatsPerBar: 4, preRollSec: 0 });
    scheduleClicks(grid.filter((c) => c.atSec < preRollSec), base + countInSec, st.clickVolume);
  }

  // count-in beats on screen (4-3-2-1)
  if (countInSec > 0) {
    const beats = bars * 4;
    S.countInBeat.value = beats;
    for (let beat = 1; beat < beats; ++beat) {
      punchTimers.push(window.setTimeout(() => {
        S.countInBeat.value = beats - beat;
      }, beat * beatSec * 1000));
    }
  }

  const ms = (sec: number): number => Math.max(0, sec * 1000);

  // 1) pre-roll playback starts after the count-in
  punchTimers.push(window.setTimeout(() => {
    S.countInBeat.value = 0;
    engine.seek(plan.playFromFrame / rate);
    void engine.play();
  }, ms(countInSec)));

  // 2) roll at the punch-in point
  punchTimers.push(window.setTimeout(() => {
    engine.stop();
    engine.seek(plan.punchOutFrame / rate);
    beginRecording();
  }, ms(countInSec + preRollSec)));

  // 3) punch out at the selection end -> one undoable overwrite edit
  punchTimers.push(window.setTimeout(() => {
    void (async () => {
      window.clearInterval(timerInterval);
      S.recording.value = false;
      const take = await recorder.stop();
      S.recLevel.value = { peakDb: Number.NEGATIVE_INFINITY, rmsDb: Number.NEGATIVE_INFINITY };
      S.peakHoldDb.value = Number.NEGATIVE_INFINITY;
      S.armed.value = false;
      punchRunning = false;
      punchTimers = [];
      if (!take || take.channels[0]?.length === 0) {
        toastError(t().recordFailed);
        return;
      }
      try {
        const conformed = conformToProjectRate(
          take.channels.map((c) => c.slice()),
          take.sampleRate,
          rate,
        );
        const outcome = makeOverwritePaste(currentChannels(), plan.punchInFrame, plan.punchOutFrame - plan.punchInFrame, conformed);
        if (outcome) performEdit(outcome, t().opPunch);
        addTake(S.takes.value, punchSec);
        toastInfo(t().punchDone);
      } catch (error: unknown) {
        logger.error('punch splice failed', { detail: String(error) });
        toastError(t().editFailed);
      }
    })();
  }, ms(countInSec + preRollSec + punchSec)));
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

let hold = initialHold();
recorder.onLevel = (level) => {
  S.recLevel.value = level;
  hold = advanceHold(hold, level.peakDb);
  S.peakHoldDb.value = hold.db;
  S.clipLatched.value = hold.clip;
};
recorder.onChunkError = (detail) => {
  logger.error('recorder dropped a chunk', { detail });
};

async function stopRecording(): Promise<void> {
  if (!S.recording.value) return;
  window.clearInterval(timerInterval);
  S.recording.value = false;
  const take = await recorder.stop();
  S.recLevel.value = { peakDb: Number.NEGATIVE_INFINITY, rmsDb: Number.NEGATIVE_INFINITY };
  S.peakHoldDb.value = Number.NEGATIVE_INFINITY;
  S.armed.value = false;
  if (!take || take.channels[0]?.length === 0) {
    toastError(t().recordFailed);
    return;
  }

  takeCounter += 1;
  const frames = take.channels[0]?.length ?? 0;
  addTake(S.takes.value, frames / take.sampleRate);

  // M8f: with a project open, the take lands as a NEW LANE (the project
  // survives); without one the take stays a fresh document (M4 behavior).
  if (S.projectOpen.value) {
    try {
      ensureProject();
      const projectRate = S.docInfo.value?.sampleRate ?? take.sampleRate;
      const takeChannels = conformToProjectRate(
        take.channels.map((c) => c.slice()),
        take.sampleRate,
        projectRate,
      );
      const lane = createTrack(takeChannels, { name: `Recording ${takeCounter}` });
      registerLaneAsset(lane.id, takeChannels);
      addProjectTrack(lane);
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
