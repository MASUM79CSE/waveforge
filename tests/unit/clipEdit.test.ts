import { describe, expect, test } from 'vitest';
import {
  arrangeDeleteClip,
  arrangeDuplicateClip,
  arrangeMoveClip,
  arrangeSplitClip,
  arrangeTrimClip,
  dragModeAt,
  hitTestClip,
  snapClipPosition,
} from '../../src/app/clipActions';
import { createTrack, sweepAssets, trackChannels, type ProjectState } from '../../src/engine/project';
import { newProject, AudioProjectEditor } from '../../src/engine/projectEditor';
import { renderClipTrack } from '../../src/engine/clips';

const SR = 44100;

function projectWithClips(): { project: ProjectState; ed: AudioProjectEditor; trackId: string } {
  const project = newProject(SR, []);
  const channels = [new Float32Array(1000).fill(0.5), new Float32Array(1000).fill(0.5)];
  const track = createTrack(channels, { name: 'A', sampleRate: SR });
  project.assets[`asset_${track.id}`] = {
    id: `asset_${track.id}`,
    sampleRate: SR,
    channels,
  };
  project.tracks.push(track);
  project.activeTrackId = track.id;
  const ed = new AudioProjectEditor(project);
  return { project, ed, trackId: track.id };
}

describe('M9d2 hit test + drag mode (pure)', () => {
  const clips = [
    { id: 'c1', assetId: 'a', start: 0, offset: 0, duration: 500 },
    { id: 'c2', assetId: 'a', start: 600, offset: 0, duration: 400 },
  ];

  test('hitTestClip: clip containing the sample; null in gaps/outside', () => {
    expect(hitTestClip(clips, 250)?.id).toBe('c1');
    expect(hitTestClip(clips, 650)?.id).toBe('c2');
    expect(hitTestClip(clips, 550)).toBeNull(); // gap
    expect(hitTestClip(clips, 500)).toBeNull(); // end is exclusive
  });

  test('dragModeAt: edge zones trim, body moves, empty space null', () => {
    const spp = 5; // 5 samples per px → edge zone (6 px) = 30 samples
    expect(dragModeAt(clips, 10, spp, 6)?.kind).toBe('trim-start');
    expect(dragModeAt(clips, 495, spp, 6)?.kind).toBe('trim-end');
    expect(dragModeAt(clips, 250, spp, 6)?.kind).toBe('move');
    expect(dragModeAt(clips, 700, spp, 6)?.kind).toBe('move');
    expect(dragModeAt(clips, 550, spp, 6)).toBeNull();
    // second clip start edge
    expect(dragModeAt(clips, 605, spp, 6)?.kind).toBe('trim-start');
  });

  test('snapClipPosition: nearest beat when on + beats known; passthrough otherwise', () => {
    const beats = [0, 0.5, 1.0, 1.5]; // seconds
    expect(snapClipPosition(Math.round(0.42 * SR), SR, beats, true)).toBe(Math.round(0.5 * SR));
    expect(snapClipPosition(Math.round(1.61 * SR), SR, beats, true)).toBe(Math.round(1.5 * SR));
    expect(snapClipPosition(12345, SR, beats, false)).toBe(12345); // snap off
    expect(snapClipPosition(12345, SR, [], true)).toBe(12345); // no beats yet
  });
});

describe('M9d2 arrange cores — editor-explicit, history-riding', () => {
  test('arrangeMove: free move right, left-clamped into the gap; undo restores', () => {
    const { project, ed, trackId } = projectWithClips();
    const clipId = project.tracks[0]!.clips[0]!.id;
    // free space to the right → the clip lands exactly at the target
    expect(arrangeMoveClip(ed, trackId, clipId, 2000)).toBe(true);
    expect(project.tracks[0]!.clips[0]!.start).toBe(2000);
    // dragged left past 0 → clamped at 0 (no prev neighbour)
    expect(arrangeMoveClip(ed, trackId, clipId, -500)).toBe(true);
    expect(project.tracks[0]!.clips[0]!.start).toBe(0);
    // split, then drag the right half: right into free space, left into prev.end
    expect(arrangeSplitClip(ed, trackId, clipId, 400)).toBe(true);
    const rightId = project.tracks[0]!.clips[1]!.id;
    expect(project.tracks[0]!.clips[1]!.start).toBe(400);
    expect(arrangeMoveClip(ed, trackId, rightId, 900)).toBe(true);
    expect(project.tracks[0]!.clips[1]!.start).toBe(900);
    expect(arrangeMoveClip(ed, trackId, rightId, 50)).toBe(true);
    expect(project.tracks[0]!.clips[1]!.start).toBe(400); // clamped to prev.end
    // undo ×3 (clamped move, move, split) → original single clip at 0
    ed.undo();
    expect(project.tracks[0]!.clips[1]!.start).toBe(900);
    ed.undo();
    expect(project.tracks[0]!.clips.map((c) => c.start)).toEqual([0, 400]);
    ed.undo();
    expect(project.tracks[0]!.clips).toHaveLength(1);
    expect(project.tracks[0]!.clips[0]!.start).toBe(0);
    expect(trackChannels(project, trackId)![0]).toEqual(new Float32Array(1000).fill(0.5));
  });

  test('arrangeTrim: start shifts into the asset (offset grows); end clamps; undo exact', () => {
    const { project, ed, trackId } = projectWithClips();
    const clipId = project.tracks[0]!.clips[0]!.id;
    expect(arrangeTrimClip(ed, trackId, clipId, 'start', 100)).toBe(true);
    let c = project.tracks[0]!.clips[0]!;
    expect(c.start).toBe(100);
    expect(c.offset).toBe(100);
    expect(c.duration).toBe(900);
    expect(arrangeTrimClip(ed, trackId, clipId, 'end', 500)).toBe(true);
    c = project.tracks[0]!.clips[0]!;
    expect(c.duration).toBe(400);
    const rendered = trackChannels(project, trackId)!;
    expect(rendered[0]).toHaveLength(500);
    ed.undo();
    ed.undo();
    expect(project.tracks[0]!.clips[0]!.duration).toBe(1000);
    expect(trackChannels(project, trackId)![0]).toEqual(new Float32Array(1000).fill(0.5));
  });

  test('arrangeSplit at edges is a no-op (false, no history entry)', () => {
    const { project, ed, trackId } = projectWithClips();
    const clipId = project.tracks[0]!.clips[0]!.id;
    expect(arrangeSplitClip(ed, trackId, clipId, 0)).toBe(false);
    expect(arrangeSplitClip(ed, trackId, clipId, 1000)).toBe(false);
    expect(ed.canUndo()).toBe(false);
    expect(project.tracks[0]!.clips).toHaveLength(1);
  });

  test('arrangeDuplicate lands after the clip (shares the asset); no room → false', () => {
    const { project, ed, trackId } = projectWithClips();
    const clipId = project.tracks[0]!.clips[0]!.id;
    // a lone clip duplicates into the empty space to its right
    expect(arrangeDuplicateClip(ed, trackId, clipId)).toBe(true);
    expect(project.tracks[0]!.clips).toHaveLength(2);
    expect(project.tracks[0]!.clips[1]!.start).toBe(1000);
    expect(project.tracks[0]!.clips[1]!.assetId).toBe(project.tracks[0]!.clips[0]!.assetId);
    expect(project.tracks[0]!.clips[1]!.offset).toBe(0);
    ed.undo(); // single clip again
    // trim to 400 → clone fits at 400; a THIRD copy would overlap → false
    arrangeTrimClip(ed, trackId, clipId, 'end', 400);
    expect(arrangeDuplicateClip(ed, trackId, clipId)).toBe(true);
    expect(project.tracks[0]!.clips[1]!.start).toBe(400);
    expect(arrangeDuplicateClip(ed, trackId, clipId)).toBe(false); // no room
    expect(project.tracks[0]!.clips).toHaveLength(2);
  });

  test('arrangeDelete removes the clip; sweep GCs the orphaned asset; undo resurrects', () => {
    const { project, ed, trackId } = projectWithClips();
    const clipId = project.tracks[0]!.clips[0]!.id;
    expect(arrangeDeleteClip(ed, trackId, clipId)).toBe(true);
    expect(project.tracks[0]!.clips).toHaveLength(0);
    sweepAssets(project);
    expect(project.assets[`asset_${trackId}`]).toBeUndefined();
    ed.undo(); // resurrects clips AND the swept asset
    expect(project.assets[`asset_${trackId}`]).toBeDefined();
    const restored = trackChannels(project, trackId)!;
    expect(restored[0]).toEqual(new Float32Array(1000).fill(0.5));
  });

  test('multi-clip render: moved clips sum correctly (arranged lane vs reference)', () => {
    const { project, ed, trackId } = projectWithClips();
    const clipId = project.tracks[0]!.clips[0]!.id;
    arrangeSplitClip(ed, trackId, clipId, 400);
    const rightId = project.tracks[0]!.clips[1]!.id;
    arrangeMoveClip(ed, trackId, rightId, 900);
    const rendered = trackChannels(project, trackId)!;
    const reference = renderClipTrack(
      { clips: project.tracks[0]!.clips },
      new Map(Object.entries(project.assets)),
    );
    expect(rendered[0]).toEqual(reference[0]);
    // first 400 samples: clip 1; 400..900 gap (zeros); 900..1500: right half
    expect(rendered[0]![0]).toBe(Math.fround(0.5));
    expect(rendered[0]![500]).toBe(0);
    expect(rendered[0]![950]).toBe(Math.fround(0.5));
    expect(rendered[0]).toHaveLength(1500);
  });
});
