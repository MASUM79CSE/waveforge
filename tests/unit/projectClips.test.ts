import { describe, expect, test } from 'vitest';
import {
  createTrack,
  mixTracks,
  mixdownReference,
  projectDuration,
  sweepAssets,
  trackChannels,
  type AudioAsset,
  type AudioClip,
  type ProjectState,
  type TrackState,
} from '../../src/engine/project';
import { newProject } from '../../src/engine/projectEditor';
import { insertClip, renderClipTrack, splitClip } from '../../src/engine/clips';
import { AudioProjectEditor } from '../../src/engine/projectEditor';

const SR = 44100;

function stereo(n: number, fillL: number, fillR: number): Float32Array[] {
  return [new Float32Array(n).fill(fillL), new Float32Array(n).fill(fillR)];
}

function track(channels: Float32Array[], name?: string): TrackState {
  return createTrack(channels, { name, sampleRate: SR });
}

function proj(tracks: TrackState[]): ProjectState {
  const p = newProject(SR, []);
  p.tracks.push(...tracks);
  for (const t of tracks) registerAssets(p, t);
  return p;
}

/** Register a track's clip assets into the project asset table. */
function registerAssets(p: ProjectState, t: TrackState): void {
  for (const c of t.clips) {
    if (!p.assets[c.assetId]) {
      p.assets[c.assetId] = { id: c.assetId, sampleRate: SR, channels: [new Float32Array(0)] };
    }
  }
}

describe('M9d1 flipped model — factory lanes are single-clip tracks', () => {
  test('createTrack: one full clip over a zero-copy asset', () => {
    const ch = stereo(8, 0.25, -0.25);
    const t = track(ch, 'A');
    expect(t.clips).toHaveLength(1);
    const c = t.clips[0]!;
    expect(c.start).toBe(0);
    expect(c.offset).toBe(0);
    expect(c.duration).toBe(8);
    expect(c.assetId).toBe(`asset_${t.id}`);
    expect(c.id).toBe(`clip_${t.id}`);
    // asset table: the project owns it; factory stores the asset on the track
    // until registration (see createProjectTrack helper in app layer)
  });

  test('trackChannels: factory lanes render their channels bit-exact', () => {
    const mono = createTrack([new Float32Array(8).fill(0.6)], { sampleRate: SR });
    const p = proj([mono, track(stereo(8, 0.3, -0.3))]);
    // register real PCM for every clip
    for (const t of p.tracks) {
      for (const c of t.clips) {
        p.assets[c.assetId] = {
          id: c.assetId,
          sampleRate: SR,
          channels: t === mono ? [new Float32Array(8).fill(0.6)] : stereo(8, 0.3, -0.3),
        };
      }
    }
    const m = trackChannels(p, mono.id)!;
    expect(m).toHaveLength(1); // lane view preserves mono-ness (M8 parity)
    expect(m[0]).toEqual(new Float32Array(8).fill(0.6));
    const s = trackChannels(p, p.tracks[1]!.id)!;
    expect(s[0]).toEqual(new Float32Array(8).fill(0.3));
    expect(s[1]).toEqual(new Float32Array(8).fill(-0.3));
    expect(trackChannels(p, 'ghost')).toBeNull();
  });

  test('projectDuration reads the clip timeline end', () => {
    const t = track([new Float32Array(4410).fill(0.5)]);
    const moved = insertClip({ clips: [] }, { ...t.clips[0]!, start: 4410 });
    const p = proj([{ ...t, clips: moved.clips }]);
    // asset PCM only needs the clip span for rendering, duration is timeline math
    expect(projectDuration(p)).toBeCloseTo(8820 / SR, 9);
  });

  test('mixTracks parity: clip lanes mix bit-exactly (== reference, == M8 result)', () => {
    const chA = stereo(100, 0.3, -0.3);
    const chB = stereo(100, 0.5, 0.5);
    const a = track(chA, 'A');
    const b = track(chB, 'B');
    const p = proj([a, b]);
    for (const t of p.tracks) {
      const src = t === a ? chA : chB;
      for (const c of t.clips) {
        p.assets[c.assetId] = { id: c.assetId, sampleRate: SR, channels: src };
      }
    }
    const mixed = mixTracks(p);
    expect(mixed).toEqual(mixdownReference(p));
    expect(mixed[0]).toEqual(new Float32Array(100).fill(0.8)); // 0.3 + 0.5 summed, f32 round
  });
});

describe('M9d1 clip history — snapshot entries, exact undo/redo', () => {
  test('split → undo → redo restores the rendered timeline bit-exactly', () => {
    const ch = stereo(1000, 0.5, 0.5);
    const t = track(ch, 'A');
    const p = proj([t]);
    for (const c of t.clips) p.assets[c.assetId] = { id: c.assetId, sampleRate: SR, channels: ch };

    const editor = new AudioProjectEditor(p);
    const before = t.clips;
    const split = splitClip({ clips: before }, before[0]!.id, 400);
    editor.executeClipEdit(t.id, 'split clip', before, split.track.clips, []);
    expect(p.tracks[0]!.clips).toHaveLength(2);

    const afterRender = trackChannels(p, t.id)!;
    const original = [new Float32Array(1000).fill(0.5), new Float32Array(1000).fill(0.5)];
    editor.undo();
    expect(p.tracks[0]!.clips).toHaveLength(1);
    expect(trackChannels(p, t.id)!).toEqual(original);
    expect(trackChannels(p, t.id)!).toEqual(original);
    editor.redo();
    expect(trackChannels(p, t.id)!).toEqual(afterRender);
    expect(p.tracks[0]!.clips).toHaveLength(2);
  });

  test('bounce entry: orphaned asset swept → undo restores it from the entry', () => {
    const ch = stereo(1000, 0.5, 0.5);
    const t = track(ch, 'A');
    const p = proj([t]);
    for (const c of t.clips) p.assets[c.assetId] = { id: c.assetId, sampleRate: SR, channels: ch };

    const editor = new AudioProjectEditor(p);
    const before = t.clips;
    // bounce: one clip over a NEW asset covering the whole timeline
    const bounce: AudioAsset = {
      id: 'bounce1',
      sampleRate: SR,
      channels: [new Float32Array(1000).fill(0.9), new Float32Array(1000).fill(0.9)],
    };
    const after: AudioClip[] = [
      { id: 'bclip', assetId: 'bounce1', start: 0, offset: 0, duration: 1000 },
    ];
    editor.executeClipEdit(t.id, 'gain bounce', before, after, [bounce]);
    expect(p.assets['bounce1']).toBeDefined();
    // app layer sweeps orphans after a bounce → source asset gone
    sweepAssets(p);
    expect(p.assets[`asset_${t.id}`]).toBeUndefined();

    editor.undo(); // must resurrect the source asset from the entry
    expect(p.assets[`asset_${t.id}`]).toBeDefined();
    expect(trackChannels(p, t.id)!).toEqual([new Float32Array(1000).fill(0.5), new Float32Array(1000).fill(0.5)]);

    editor.redo();
    expect(trackChannels(p, t.id)!).toEqual([new Float32Array(1000).fill(0.9), new Float32Array(1000).fill(0.9)]);
    // sweep again after redo: source orphaned once more
    sweepAssets(p);
    expect(p.assets[`asset_${t.id}`]).toBeUndefined();
    expect(p.assets['bounce1']).toBeDefined();
  });

  test('structural ops still account bytes via clip assets (removeTrack undo)', () => {
    const ch = stereo(1000, 0.5, 0.5);
    const t = track(ch, 'A');
    const p = proj([t]);
    for (const c of t.clips) p.assets[c.assetId] = { id: c.assetId, sampleRate: SR, channels: ch };
    const editor = new AudioProjectEditor(p);
    editor.removeTrack(t.id);
    expect(p.tracks).toHaveLength(0);
    editor.undo();
    expect(p.tracks).toHaveLength(1);
    expect(p.tracks[0]!.clips).toHaveLength(1);
  });
});

describe('M9d1 sweepAssets — refcount over all clip lists', () => {
  test('drops only zero-reference assets; shared assets survive', () => {
    const p = newProject(SR, []);
    const pcm = stereo(100, 0.5, 0.5);
    p.assets['shared'] = { id: 'shared', sampleRate: SR, channels: pcm };
    p.assets['orphan'] = { id: 'orphan', sampleRate: SR, channels: pcm };
    const t = track(pcm, 'A');
    const withShared = insertClip({ clips: [] }, { ...t.clips[0]!, assetId: 'shared' });
    p.tracks.push({ ...t, clips: withShared.clips });
    sweepAssets(p);
    expect(p.assets['shared']).toBeDefined();
    expect(p.assets['orphan']).toBeUndefined();
  });
});

describe('M9d1 render sanity — split halves concatenate to the original', () => {
  test('renderClipTrack over split halves == factory render', () => {
    const ch = stereo(1000, 0.5, -0.5);
    const t = track(ch);
    const p = proj([t]);
    for (const c of t.clips) p.assets[c.assetId] = { id: c.assetId, sampleRate: SR, channels: ch };
    const split = splitClip({ clips: t.clips }, t.clips[0]!.id, 400);
    const r = renderClipTrack(split.track, new Map(Object.entries(p.assets)));
    expect(r[0]).toEqual(new Float32Array(1000).fill(0.5));
    expect(r[1]).toEqual(new Float32Array(1000).fill(-0.5));
  });
});
