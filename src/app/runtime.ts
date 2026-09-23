/**
 * Runtime singletons + engine↔UI wiring. The engine layer never imports
 * signals; this module is the only bridge (Build Plan §3 golden rule 1).
 */
import { AudioDocument } from '../engine/AudioDocument';
import { AudioEngine } from '../engine/AudioEngine';
import { PeakClient } from '../engine/peakClient';
import { WaveRenderer } from '../engine/WaveRenderer';
import * as S from './state';

export const engine = new AudioEngine();
export const renderer = new WaveRenderer();

let peaks: PeakClient | null = null;

export function getDoc(): AudioDocument | null {
  return engine.document;
}

export function getPeaks(): PeakClient | null {
  return peaks;
}

/** Swap the working document (load / close). Resets transport + view. */
export function installDoc(doc: AudioDocument | null): void {
  engine.setDocument(doc);
  peaks?.dispose();
  peaks = doc ? new PeakClient(doc.buffer) : null;
  renderer.setDocument(doc, peaks);
  renderer.cursor = 0;

  if (doc) {
    S.setDocInfo({
      name: doc.meta.name,
      duration: doc.duration,
      sampleRate: doc.sampleRate,
      channels: doc.channels,
      sizeBytes: doc.meta.sizeBytes,
    });
    S.selection.value = null;
  } else {
    S.setDocInfo(null);
    S.selection.value = null;
  }
}

// ---- engine → signals ----
engine.onCursor = (t) => {
  S.cursorPos.value = t;
  renderer.cursor = t;
  if (engine.playing && S.followCursor.value) renderer.followCursor(t);
  renderer.requestDraw();
};

engine.onPlayingChange = (p) => {
  S.playing.value = p;
};

// ---- renderer → signals / engine ----
renderer.onSeek = (t) => engine.seek(t);

renderer.onSelectionChange = (sel) => {
  S.selection.value = sel;
};

renderer.onViewChange = () => {
  S.viewSpp.value = renderer.view.spp;
  S.viewStart.value = renderer.view.start;
};
