import { describe, expect, test } from 'vitest';
import {
  arrangeDeleteClip,
  arrangeDuplicateClip,
  arrangeMoveClip,
  arrangeSplitClip,
  arrangeTrimClip,
} from '../../src/app/clipActions';
import { bounceLaneRegion } from '../../src/engine/clipAssets';
import { createProjectTrack, sweepAssets, trackChannels, type ProjectState } from '../../src/engine/project';
import { AudioProjectEditor, newProject } from '../../src/engine/projectEditor';

const SR = 44100;

function block(n: number, fill: number): Float32Array {
  return new Float32Array(n).fill(fill);
}

function stereo(n: number, l: number, r: number): Float32Array[] {
  return [block(n, l), block(n, r)];
}

/** The M9e rig: lane A (stereo 4410) + lane B (mono 2205). */
function rig(): { project: ProjectState; ed: AudioProjectEditor; idA: string; idB: string } {
  const project = newProject(SR, []);
  const a = createProjectTrack(project, stereo(4410, 0.25, -0.25), { name: 'A' });
  const b = createProjectTrack(project, [block(2205, 0.5)], { name: 'B' });
  return { project, ed: new AudioProjectEditor(project), idA: a.id, idB: b.id };
}

describe('M9e formal gate — interleaved clip/bounce/structural undo×redo', () => {
  test('render of lane A is bit-exact at EVERY step, back and forth', () => {
    const { project, ed, idA, idB } = rig();
    const history: Array<{ label: string; render: Float32Array[]; tracks: number }> = [];
    const snap = (label: string): void => {
      history.push({
        label,
        render: trackChannels(project, idA)!.map((c) => c.slice()),
        tracks: project.tracks.length,
      });
    };
    snap('initial');

    // 1. split A at 1000
    const c0 = project.tracks[0]!.clips[0]!.id;
    expect(arrangeSplitClip(ed, idA, c0, 1000)).toBe(true);
    snap('split');

    // 2. move the right half into free space
    const right = project.tracks[0]!.clips[1]!.id;
    expect(arrangeMoveClip(ed, idA, right, 1200)).toBe(true);
    snap('move');

    // 3. trim the right half's start edge (offset grows)
    expect(arrangeTrimClip(ed, idA, right, 'start', 1300)).toBe(true);
    snap('trim');

    // 4. COW bounce [0, 500) of lane A at ×2 gain (splits, new asset, sweep)
    const bounce = bounceLaneRegion(project, idA, 0, 500, (channels) => {
      return channels.map((c) => c.map((v) => v * 2));
    }, 'b1');
    expect(bounce).not.toBeNull();
    ed.executeClipEdit(idA, 'gain bounce', bounce!.before, bounce!.after, [bounce!.asset]);
    sweepAssets(project);
    snap('bounce');

    // 5. trim the bounced clip short, push the split-edge clip right
    //    (making an 800-wide hole), then duplicate into it
    const bounced = project.tracks[0]!.clips[0]!.id;
    expect(arrangeTrimClip(ed, idA, bounced, 'end', 300)).toBe(true);
    snap('trim2');
    const edge = project.tracks[0]!.clips[1]!.id;
    expect(arrangeMoveClip(ed, idA, edge, 700)).toBe(true);
    snap('move2');
    expect(arrangeDuplicateClip(ed, idA, bounced)).toBe(true);
    snap('duplicate');

    // 6. delete the duplicate
    const dupId = project.tracks[0]!.clips[1]!.id;
    expect(arrangeDeleteClip(ed, idA, dupId)).toBe(true);
    snap('delete');

    // 7. structural interleave: remove lane B, add lane C
    ed.removeTrack(idB);
    snap('removeB');
    const fresh = newProject(SR, []);
    createProjectTrack(fresh, stereo(1102, 0.1, 0.1), { name: 'C' });
    // move C's lane into the live project (structural add like the app layer)
    const cLane = fresh.tracks[0]!;
    project.assets[`asset_${cLane.id}`] = fresh.assets[`asset_${cLane.id}`]!;
    ed.addTrack(cLane);
    snap('addC');

    // undo walk — render + track count bit-exact at every step
    for (let i = history.length - 2; i >= 0; --i) {
      const result = ed.undo();
      expect(result?.label).toBeTruthy();
      expect(trackChannels(project, idA)).toEqual(history[i]!.render);
      expect(project.tracks.length).toBe(history[i]!.tracks);
    }
    expect(ed.canUndo()).toBe(false);

    // redo walk — bit-exact forward again
    for (let i = 1; i < history.length; ++i) {
      ed.redo();
      expect(trackChannels(project, idA)).toEqual(history[i]!.render);
      expect(project.tracks.length).toBe(history[i]!.tracks);
    }
    expect(ed.canRedo()).toBe(false);
  });

  test('bounce entries charge their new-asset PCM; move/trim entries stay light', () => {
    const { project, ed, idA } = rig();
    const beforeBounce = ed.retainedBytes();
    const bounce = bounceLaneRegion(project, idA, 0, 500, (channels) => channels, 'b1');
    ed.executeClipEdit(idA, 'gain bounce', bounce!.before, bounce!.after, [bounce!.asset]);
    sweepAssets(project);
    const charged = ed.retainedBytes() - beforeBounce;
    expect(charged).toBeGreaterThanOrEqual(500 * 2 * 4); // stereo f32 [0,500)

    const beforeMove = ed.retainedBytes();
    const c1 = project.tracks[0]!.clips[0]!.id;
    expect(arrangeMoveClip(ed, idA, c1, 6000)).toBe(true);
    expect(ed.retainedBytes() - beforeMove).toBe(0); // timeline-only payload
  });

  test('split → undo label rides; re-split after undo lands the same ids', () => {
    const { project, ed, idA } = rig();
    const c0 = project.tracks[0]!.clips[0]!.id;
    arrangeSplitClip(ed, idA, c0, 1000);
    const rightId = project.tracks[0]!.clips[1]!.id;
    ed.undo();
    expect(project.tracks[0]!.clips).toHaveLength(1);
    arrangeSplitClip(ed, idA, c0, 1000); // same split again after undo
    expect(project.tracks[0]!.clips[1]!.id).toBe(rightId); // deterministic ids
  });
});
