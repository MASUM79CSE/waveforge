import { describe, expect, test } from 'vitest';
import { AudioProjectEditor, newProject } from '../../src/engine/projectEditor';
import { bounceLaneRegion } from '../../src/engine/clipAssets';
import { splitClip } from '../../src/engine/clips';
import { createProjectTrack, createTrack, sweepAssets, trackChannels, type ProjectState, type TrackState } from '../../src/engine/project';

const SR = 44100;

function block(n: number, fill: number): Float32Array {
  return new Float32Array(n).fill(fill);
}

function stereo(n: number, l: number, r: number): Float32Array[] {
  return [block(n, l), block(n, r)];
}

function trackOf(name: string, n: number, fill: number): TrackState {
  return createTrack([block(n, fill)], { name, sampleRate: SR });
}

/** Project with the given lanes and their zero-copy factory assets. */
function projectOf(lanes: TrackState[]): ProjectState {
  const p = newProject(SR, []);
  for (const lane of lanes) {
    const assetId = `asset_${lane.id}`;
    p.assets[assetId] = {
      id: assetId,
      sampleRate: SR,
      channels: [block(lane.clips[0]!.duration, 0)], // placeholder; tests pass real PCM below
    };
    p.tracks.push(lane);
  }
  p.activeTrackId = p.tracks[0]?.id ?? null;
  return p;
}

function projectWithTrack(name: string, n: number, fill: number): { p: ProjectState; id: string } {
  const ch = stereo(n, fill, fill);
  const p = newProject(SR, []);
  const t = createProjectTrack(p, ch, { name });
  return { p, id: t.id };
}

/** Mono overwrite bounce: [at, at+len) of channel 0 ← fill (COW via bounceLaneRegion). */
function overwrite(ed: AudioProjectEditor, trackId: string, at: number, fill: number, len = 4): void {
  const bounce = bounceLaneRegion(
    ed.project,
    trackId,
    at,
    len,
    (channels) => {
      const out = channels.map((c) => c.slice());
      out[0]!.fill(fill, 0, len);
      return out;
    },
    `bounce_${trackId}_${at}_${fill}`,
  );
  if (!bounce) throw new Error('overwrite: bounce failed');
  ed.executeClipEdit(trackId, `overwrite@${at}`, bounce.before, bounce.after, [bounce.asset]);
  sweepAssets(ed.project);
}

/** Sample accessor: channel 0, index i, f32-rounded literal expected. */
function sample0(ed: AudioProjectEditor, trackId: string, i: number): number {
  return trackChannels(ed.project, trackId)![0]![i]!;
}

describe('M8c/M9d1 AudioProjectEditor — clip history', () => {
  test('clip edits route to the right track; interleaved undo/redo restores both bit-exactly', () => {
    const a = projectWithTrack('A', 16, 0.25);
    const b = projectWithTrack('B', 16, 0.5);
    const p = a.p;
    p.tracks.push(...b.p.tracks);
    Object.assign(p.assets, b.p.assets);
    const ed = new AudioProjectEditor(p);
    const idA = a.id;
    const idB = b.id;

    overwrite(ed, idA, 0, 0.9);
    overwrite(ed, idB, 8, 0.1);

    expect(sample0(ed, idA, 0)).toBe(Math.fround(0.9));
    expect(sample0(ed, idB, 8)).toBe(Math.fround(0.1));
    expect(sample0(ed, idA, 8)).toBe(Math.fround(0.25)); // B's edit didn't touch A

    ed.undo();
    expect(sample0(ed, idB, 8)).toBe(Math.fround(0.5)); // B reverted
    expect(sample0(ed, idA, 0)).toBe(Math.fround(0.9)); // A untouched by B's undo
    ed.undo();
    expect(sample0(ed, idA, 0)).toBe(Math.fround(0.25));
    ed.redo();
    expect(sample0(ed, idA, 0)).toBe(Math.fround(0.9));
    ed.redo();
    expect(sample0(ed, idB, 8)).toBe(Math.fround(0.1));
    expect(ed.canUndo()).toBe(true);
    expect(ed.canRedo()).toBe(false); // back at the newest state
  });

  test('split via executeClipEdit: undo restores the pre-split single clip', () => {
    const { p, id } = projectWithTrack('A', 100, 0.5);
    const ed = new AudioProjectEditor(p);
    const before = p.tracks[0]!.clips;
    const split = splitClip({ clips: before }, before[0]!.id, 40);
    ed.executeClipEdit(id, 'split', before, split.track.clips, []);
    expect(p.tracks[0]!.clips).toHaveLength(2);
    ed.undo();
    expect(p.tracks[0]!.clips).toHaveLength(1);
    expect(trackChannels(p, id)![0]).toEqual(block(100, 0.5));
  });

  test('labels ride the entries (undo returns them in order)', () => {
    const { p, id } = projectWithTrack('A', 8, 0.5);
    const ed = new AudioProjectEditor(p);
    overwrite(ed, id, 0, 0.2);
    expect(ed.undo()?.label).toBe('overwrite@0');
  });

  test('addTrack: undo removes, redo re-adds same track (id + data + index)', () => {
    const { p } = projectWithTrack('A', 8, 0.5);
    const ed = new AudioProjectEditor(p);
    const added = trackOf('B', 8, 0.7);
    p.assets[`asset_${added.id}`] = {
      id: `asset_${added.id}`,
      sampleRate: SR,
      channels: stereo(8, 0.7, 0.7),
    };
    ed.addTrack(added);
    expect(ed.project.tracks).toHaveLength(2);
    expect(ed.project.tracks[1]!.name).toBe('B');

    ed.undo();
    expect(ed.project.tracks).toHaveLength(1);
    ed.redo();
    expect(ed.project.tracks).toHaveLength(2);
    const back = ed.project.tracks[1]!;
    expect(back.id).toBe(added.id);
    expect(trackChannels(p, back.id)![0]![0]).toBe(Math.fround(0.7));
  });

  test('removeTrack: undo restores at the original index with data intact', () => {
    const p = projectOf([trackOf('A', 8, 0.25), trackOf('B', 8, 0.5), trackOf('C', 8, 0.75)]);
    for (const t of p.tracks) {
      const assetId = `asset_${t.id}`;
      const fill = t.name === 'A' ? 0.25 : t.name === 'B' ? 0.5 : 0.75;
      p.assets[assetId] = { id: assetId, sampleRate: SR, channels: stereo(8, fill, fill) };
    }
    const ed = new AudioProjectEditor(p);
    const idA = p.tracks[0]!.id;
    const idB = p.tracks[1]!.id;
    ed.removeTrack(idB);
    expect(ed.project.tracks.map((t) => t.name)).toEqual(['A', 'C']);
    expect(ed.project.activeTrackId).toBe(idA); // active (A) was not removed

    ed.removeTrack(idA);
    expect(ed.project.activeTrackId).toBeNull(); // removing the active lane clears it
    expect(ed.project.tracks.map((t) => t.name)).toEqual(['C']);

    ed.undo(); // restore A
    ed.undo(); // restore B
    expect(ed.project.tracks.map((t) => t.name)).toEqual(['A', 'B', 'C']);
    expect(sample0(ed, idB, 0)).toBe(Math.fround(0.5)); // B data intact
    ed.redo(); // re-remove B (its entry is next on the redo stack)
    ed.redo(); // re-remove A
    expect(ed.project.tracks.map((t) => t.name)).toEqual(['C']);
  });

  test('structural + clip ops interleave: undo×4 walks back to the original state', () => {
    const { p, id: idA } = projectWithTrack('A', 16, 0.25);
    const ed = new AudioProjectEditor(p);
    overwrite(ed, idA, 0, 0.9);
    const added = trackOf('B', 16, 0.5);
    p.assets[`asset_${added.id}`] = {
      id: `asset_${added.id}`,
      sampleRate: SR,
      channels: stereo(16, 0.5, 0.5),
    };
    ed.addTrack(added);
    const idB = added.id;
    overwrite(ed, idB, 4, 0.8);
    ed.removeTrack(idA);

    ed.undo(); // un-remove A
    expect(ed.project.tracks.map((t) => t.name)).toEqual(['A', 'B']);
    ed.undo(); // revert B1
    expect(sample0(ed, idB, 4)).toBe(Math.fround(0.5));
    ed.undo(); // remove B
    expect(ed.project.tracks).toHaveLength(1);
    ed.undo(); // revert A1
    expect(sample0(ed, idA, 0)).toBe(Math.fround(0.25));
    expect(ed.canUndo()).toBe(false);
    // redo×4 forward again
    ed.redo();
    ed.redo();
    ed.redo();
    ed.redo();
    expect(ed.project.tracks).toHaveLength(1);
    expect(ed.project.tracks[0]!.name).toBe('B');
    expect(sample0(ed, idB, 4)).toBe(Math.fround(0.8));
  });

  test('bounce entries charge the new asset PCM (byte accounting)', () => {
    const { p, id } = projectWithTrack('A', 8, 0.5);
    const ed = new AudioProjectEditor(p, { maxBytes: Number.POSITIVE_INFINITY, minKeep: 100 });
    const before = ed.retainedBytes();
    overwrite(ed, id, 0, 0.2, 4);
    expect(ed.retainedBytes()).toBeGreaterThan(before);
    // charge = the full bounce asset (2 × 8 mono f32) — conservative but exact
    expect(ed.retainedBytes()).toBeLessThanOrEqual(before + 8 * 2 * 4 + 64);
  });

  test('history trim respects maxBytes across tracks (minKeep floor holds)', () => {
    const a = projectWithTrack('A', 4, 0.5);
    const p = a.p;
    const b = projectWithTrack('B', 4, 0.25);
    p.tracks.push(...b.p.tracks);
    Object.assign(p.assets, b.p.assets);
    const ed = new AudioProjectEditor(p, {
      maxBytes: 4 * 2 * 4 * 3, // ~3 bounce entries worth (stereo f32)
      minKeep: 1,
    });
    const idA = a.id;
    const idB = b.id;
    for (let i = 0; i < 10; ++i) {
      overwrite(ed, i % 2 === 0 ? idA : idB, 0, 0.1 + i, 4);
    }
    expect(ed.canUndo()).toBe(true);
    ed.undo(); // must still work after trims
    expect(ed.canRedo()).toBe(true);
  });

  test('adopt(project) resets history; editing without a matching track throws', () => {
    const { p, id } = projectWithTrack('A', 8, 0.5);
    const ed = new AudioProjectEditor(p);
    overwrite(ed, id, 0, 0.2);
    const fresh = newProject(SR, []);
    createProjectTrack(fresh, stereo(8, 0.1, 0.1), { name: 'fresh' });
    ed.adopt(fresh);
    expect(ed.canUndo()).toBe(false);
    expect(ed.project.tracks[0]!.name).toBe('fresh');
    expect(() => ed.executeClipEdit('nope', 'x', [], [], [])).toThrow();
  });
});
