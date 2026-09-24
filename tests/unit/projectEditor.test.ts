import { describe, expect, test } from 'vitest';
import { AudioProjectEditor, newProject } from '../../src/engine/projectEditor';
import { makeOverwritePaste } from '../../src/engine/editOps';
import { createTrack, type TrackState } from '../../src/engine/project';

const SR = 44100;

function block(n: number, fill: number): Float32Array {
  return new Float32Array(n).fill(fill);
}

function trackOf(name: string, n: number, fill: number): TrackState {
  return createTrack([block(n, fill)], { name });
}

/** Mono overwrite outcome on the track's channel 0. */
function overwrite(channels: Float32Array[], at: number, fill: number, len = 4) {
  return makeOverwritePaste(channels, at, len, [block(len, fill)]);
}

/** Sample accessor: channel 0, index i, f32-rounded literal expected. */
function sample0(ed: AudioProjectEditor, trackId: string, i: number): number {
  return ed.trackChannels(trackId)![0]![i]!;
}

describe('M8c AudioProjectEditor — track-tagged history', () => {
  test('edits route to the right track; interleaved undo/redo restores both bit-exactly', () => {
    const ed = new AudioProjectEditor(newProject(SR, [trackOf('A', 16, 0.25), trackOf('B', 16, 0.5)]));
    const idA = ed.project.tracks[0]!.id;
    const idB = ed.project.tracks[1]!.id;

    ed.executeTrackEdit(idA, overwrite(ed.trackChannels(idA)!, 0, 0.9), 'A edit');
    ed.executeTrackEdit(idB, overwrite(ed.trackChannels(idB)!, 8, 0.1), 'B edit');

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

  test('labels ride the entries (undo returns them in order)', () => {
    const ed = new AudioProjectEditor(newProject(SR, [trackOf('A', 8, 0.5)]));
    const id = ed.project.tracks[0]!.id;
    ed.executeTrackEdit(id, overwrite(ed.trackChannels(id)!, 0, 0.2), 'gain tweak');
    expect(ed.undo()?.label).toBe('gain tweak');
  });

  test('addTrack: undo removes, redo re-adds same track (id + data + index)', () => {
    const ed = new AudioProjectEditor(newProject(SR, [trackOf('A', 8, 0.5)]));
    const added = trackOf('B', 8, 0.7);
    ed.addTrack(added);
    expect(ed.project.tracks).toHaveLength(2);
    expect(ed.project.tracks[1]!.name).toBe('B');

    ed.undo();
    expect(ed.project.tracks).toHaveLength(1);
    ed.redo();
    expect(ed.project.tracks).toHaveLength(2);
    const back = ed.project.tracks[1]!;
    expect(back.id).toBe(added.id);
    expect(back.channels[0]![0]).toBe(Math.fround(0.7));
  });

  test('removeTrack: undo restores at the original index with data intact', () => {
    const ed = new AudioProjectEditor(
      newProject(SR, [trackOf('A', 8, 0.25), trackOf('B', 8, 0.5), trackOf('C', 8, 0.75)]),
    );
    const idA = ed.project.tracks[0]!.id;
    const idB = ed.project.tracks[1]!.id;
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

  test('structural + edit ops interleave: undo×4 walks back to the original state', () => {
    const ed = new AudioProjectEditor(newProject(SR, [trackOf('A', 16, 0.25)]));
    const idA = ed.project.tracks[0]!.id;
    ed.executeTrackEdit(idA, overwrite(ed.trackChannels(idA)!, 0, 0.9), 'A1');
    const added = trackOf('B', 16, 0.5);
    ed.addTrack(added);
    const idB = added.id;
    ed.executeTrackEdit(idB, overwrite(ed.trackChannels(idB)!, 4, 0.8), 'B1');
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

  test('byte accounting: entries charge their real payload (edit region / track data)', () => {
    const ed = new AudioProjectEditor(newProject(SR, [trackOf('A', 8, 0.5)]), {
      maxBytes: Number.POSITIVE_INFINITY,
      minKeep: 100,
    });
    const id = ed.project.tracks[0]!.id;
    const before = ed.retainedBytes();
    ed.executeTrackEdit(id, overwrite(ed.trackChannels(id)!, 0, 0.2, 4), 'e1');
    expect(ed.retainedBytes()).toBeGreaterThan(before);
    expect(ed.retainedBytes()).toBeLessThanOrEqual(before + 8 * 4 + 64); // undo+redo slices, mono f32
  });

  test('history trim respects maxBytes across tracks (minKeep floor holds)', () => {
    const ed = new AudioProjectEditor(newProject(SR, [trackOf('A', 4, 0.5), trackOf('B', 4, 0.25)]), {
      maxBytes: 4 * 4 * 3, // ~3 edit entries worth (mono f32 slice pairs)
      minKeep: 1,
    });
    const idA = ed.project.tracks[0]!.id;
    const idB = ed.project.tracks[1]!.id;
    for (let i = 0; i < 10; ++i) {
      const id = i % 2 === 0 ? idA : idB;
      ed.executeTrackEdit(id, overwrite(ed.trackChannels(id)!, 0, 0.1 + i, 4), `e${i}`);
    }
    expect(ed.canUndo()).toBe(true);
    ed.undo(); // must still work after trims
    expect(ed.canRedo()).toBe(true);
  });

  test('adopt(project) resets history; editing without a matching track throws', () => {
    const ed = new AudioProjectEditor(newProject(SR, [trackOf('A', 8, 0.5)]));
    const id = ed.project.tracks[0]!.id;
    ed.executeTrackEdit(id, overwrite(ed.trackChannels(id)!, 0, 0.2), 'e');
    ed.adopt(newProject(SR, [trackOf('fresh', 8, 0.1)]));
    expect(ed.canUndo()).toBe(false);
    expect(ed.project.tracks[0]!.name).toBe('fresh');
    expect(() => ed.executeTrackEdit('nope', overwrite([block(4, 0)], 0, 0.5), 'x')).toThrow();
  });
});
