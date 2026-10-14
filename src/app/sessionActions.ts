/**
 * PF-05 / AM-12 — portable `.amss` session save/open (lazy chunk: the
 * codec + this module stay off the startup bundle; the export dialog and
 * the file-open path import on demand). Save maps the live project into
 * the reference byte layout (seconds domain, deduped assets, crossfade
 * index pairs, markers as JSON). Open decodes, conforms asset rates to
 * the session rate, rebuilds the document from track 0 (doc mirror =
 * lane 1) and adopts lanes ≥ 2 through the PROVEN draft payload path
 * (buildClipProject) — one undo-free adopt, cursor + markers restored.
 * Toasts mirror the reference: 'Saved session' / 'Nothing to save' /
 * 'Loaded session: <name>' / 'Could not load session'.
 */
import { decodeAmss, encodeAmss, amssNameOf, AMSS_MIME, type AmssState } from '../io/amss';
import { renderClipTrack, type AudioAsset } from '../engine/clips';
import { t } from '../i18n';
import { activeClip } from './clipActions';
import { conformToProjectRate, projectEditor, restoreProjectClips } from './projectActions';
import { bufferFactory, engine, installDoc, renderer } from './runtime';
import { AudioDocument } from '../engine/AudioDocument';
import * as S from './state';
import { toastInfo, toastError } from './toast';

/** Encode the live project into a `.amss` file and download it. */
export function saveSessionFile(filename: string): void {
  const ed = projectEditor();
  if (!ed || ed.project.tracks.length === 0) {
    toastInfo(t().opSessionEmpty);
    return;
  }
  const sr = ed.project.sampleRate;
  const audio: AmssState['audio'] = [];
  const assetIndex = new Map<string, number>();
  const clips: AmssState['clips'] = [];
  const clipIndex = new Map<string, number>();
  const tracks: AmssState['tracks'] = ed.project.tracks.map((tr) => ({
    name: tr.name,
    vol: tr.gain,
    pan: tr.pan,
    mute: tr.mute,
    solo: tr.solo,
    rec: false,
  }));
  for (const [ti, tr] of ed.project.tracks.entries()) {
    for (const c of tr.clips) {
      let ai = assetIndex.get(c.assetId);
      if (ai === undefined) {
        const asset = ed.project.assets[c.assetId];
        if (!asset) continue; // dangling reference renders as absent
        ai =
          audio.push({
            name: c.assetId,
            sampleRate: asset.sampleRate,
            channels: asset.channels,
          }) - 1;
        assetIndex.set(c.assetId, ai);
      }
      clipIndex.set(
        c.id,
        clips.push({
          track: ti,
          audio: ai,
          start: c.start / sr,
          in: c.offset / sr,
          out: (c.offset + c.duration) / sr,
          fi: (c.fadeIn ?? 0) / sr,
          fo: (c.fadeOut ?? 0) / sr,
          name: c.assetId,
        }) - 1,
      );
    }
  }
  const xfade: Array<[number, number]> = [];
  for (const tr of ed.project.tracks) {
    for (const c of tr.clips) {
      if (!c.xfadeWith) continue;
      const earlier = clipIndex.get(c.xfadeWith);
      const later = clipIndex.get(c.id);
      if (earlier !== undefined && later !== undefined) xfade.push([earlier, later]);
    }
  }
  const selTrack = ed.project.tracks.findIndex((tr) => tr.id === ed.project.activeTrackId);
  const sel = activeClip.value;
  let selClip: number | null = null;
  if (sel) {
    for (const [id, idx] of clipIndex) {
      if (id === sel.clipId) {
        selClip = idx;
        break;
      }
    }
  }
  const state: AmssState = {
    tracks,
    audio,
    clips,
    xfade,
    selectedTrack: selTrack >= 0 ? selTrack : null,
    selectedClip: selClip,
    cursor: S.cursorPos.value, // already seconds
    marker: 0,
    pxPerSec: 100,
    rowH: 90,
    masterVol: 1,
    bpm: 120,
    sig: [4, 4],
    markers: S.markers.value.map((m) => ({ id: m.id, time: m.t / sr, name: m.label })),
  };
  try {
    const bytes = encodeAmss(state);
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: AMSS_MIME });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = amssNameOf(filename);
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toastInfo(t().opSessionSaved);
  } catch (error) {
    toastError(`${t().opSessionFailed}: ${String(error)}`);
  }
}

/** Open a `.amss` session file: replaces the document + project. */
export async function openSessionFile(file: File): Promise<void> {
  let state: AmssState | null = null;
  try {
    state = decodeAmss(await file.arrayBuffer());
  } catch {
    state = null;
  }
  if (!state) {
    toastError(t().opSessionFailed);
    return;
  }
  try {
    const sr = Math.round(state.audio[0]?.sampleRate ?? 44100);
    const assets = new Map<string, AudioAsset>();
    for (const [i, a] of state.audio.entries()) {
      const id = `asset_${i}`;
      const channels = a.channels.map((ch) => ch.slice());
      assets.set(id, {
        id,
        sampleRate: sr,
        channels: a.sampleRate === sr ? channels : conformToProjectRate(channels, a.sampleRate, sr),
      });
    }
    const tracks = state.tracks.map((tr, ti) => ({
      id: `session_t${ti + 1}`,
      name: tr.name,
      gain: tr.vol,
      pan: tr.pan,
      mute: tr.mute,
      solo: tr.solo,
      clips: state!.clips
        .map((c, ci) => ({ c, ci }))
        .filter(({ c }) => c.track === ti)
        .map(({ c, ci }) => ({
          id: `clip_${ti + 1}_${ci + 1}`,
          assetId: `asset_${c.audio}`,
          start: Math.max(0, Math.round(c.start * sr)),
          offset: Math.max(0, Math.round(c.in * sr)),
          duration: Math.max(1, Math.round((c.out - c.in) * sr)),
          fadeIn: Math.round(c.fi * sr) || undefined,
          fadeOut: Math.round(c.fo * sr) || undefined,
          xfadeWith: undefined as string | undefined,
        })),
    }));
    // crossfade pairs: the LATER clip (higher clip index) carries the marker
    const clipIdOf = (track: number, ci: number): string => `clip_${track + 1}_${ci + 1}`;
    for (const [a, b] of state.xfade) {
      const pa = state.clips[a];
      const pb = state.clips[b];
      if (!pa || !pb) continue;
      const laterClip = pa.start <= pb.start ? pb : pa;
      const earlierClip = laterClip === pb ? pa : pb;
      const laterIdx = state.clips.indexOf(laterClip);
      const earlierIdx = state.clips.indexOf(earlierClip);
      const later = tracks[laterClip.track]?.clips.find(
        (c) => c.id === clipIdOf(laterClip.track, laterIdx),
      );
      if (later && tracks[earlierClip.track]) later.xfadeWith = clipIdOf(earlierClip.track, earlierIdx);
    }
    // document = track 0 rendered (becomes the lane-1 doc mirror)
    const first = tracks[0];
    if (!first) throw new Error('empty session');
    const docChannels =
      first.clips.length === 1 && first.clips[0]!.start === 0 && first.clips[0]!.offset === 0
        ? (assets.get(first.clips[0]!.assetId)?.channels.map((ch) => ch.slice()) ?? null)
        : null;
    const render =
      docChannels ??
      renderClipTrack(
        {
          clips: first.clips.map((c) => ({
            id: c.id,
            assetId: c.assetId,
            start: c.start,
            offset: c.offset,
            duration: c.duration,
            fadeIn: c.fadeIn,
            fadeOut: c.fadeOut,
          })),
        },
        assets,
      );
    const buffer = bufferFactory(render, sr);
    installDoc(
      new AudioDocument(buffer, {
        name: amssNameOf(file.name),
        sizeBytes: file.size,
        source: 'file',
      }),
    );
    restoreProjectClips({
      tracks: tracks.map((tr) => ({
        meta: {
          id: tr.id,
          name: tr.name,
          gain: tr.gain,
          pan: tr.pan,
          mute: tr.mute,
          solo: tr.solo,
          channels: 2,
          length: 0,
          clips: tr.clips.map((c) => ({
            id: c.id,
            assetId: c.assetId,
            start: c.start,
            offset: c.offset,
            duration: c.duration,
          })),
        },
        channels: [],
      })),
      assets: [...assets.values()].map((a) => ({
        meta: {
          id: a.id,
          sampleRate: a.sampleRate,
          channels: (a.channels.length === 1 ? 1 : 2) as 1 | 2,
          length: a.channels[0]?.length ?? 0,
        },
        channels: a.channels,
      })),
    });
    if (state.cursor > 0) engine.seek(state.cursor);
    S.markers.value = state.markers.map((m, i) => ({
      id: m.id || `m${i + 1}`,
      t: Math.round(m.time * sr),
      label: m.name,
    }));
    renderer.setMarkers(S.markers.value.map((m) => ({ t: m.t / sr, label: m.label })));
    toastInfo(t().opSessionLoaded(amssNameOf(file.name)));
  } catch (error) {
    toastError(`${t().opSessionFailed}: ${String(error)}`);
  }
}
