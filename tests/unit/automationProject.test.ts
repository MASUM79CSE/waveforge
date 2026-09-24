import { describe, expect, test } from 'vitest';
import { mixTracks, mixdownReference, trackChannels, createTrack, type ProjectState } from '../../src/engine/project';
import { AudioProjectEditor, newProject } from '../../src/engine/projectEditor';
import { arrangeSplitClip } from '../../src/app/clipActions';

const SR = 44100;

function block(n: number, fill: number): Float32Array {
  return new Float32Array(n).fill(fill);
}

function stereo(n: number, l: number, r: number): Float32Array[] {
  return [block(n, l), block(n, r)];
}

/** One stereo lane (0.5/−0.5, 1000 samples), asset registered. */
function oneLane(): { project: ProjectState; ed: AudioProjectEditor; id: string } {
  const project = newProject(SR, []);
  const pcm = stereo(1000, 0.5, -0.5);
  const t = createTrack(pcm, { name: 'A', sampleRate: SR });
  project.assets[`asset_${t.id}`] = { id: `asset_${t.id}`, sampleRate: SR, channels: pcm };
  project.tracks.push(t);
  project.activeTrackId = t.id;
  return { project, ed: new AudioProjectEditor(project), id: t.id };
}

describe('A2 bit-identity — constant curves are byte-equal to no automation', () => {
  test('volume=1 + pan=0 constant curves → mixdown byte-equal', () => {
    const { project } = oneLane();
    const plainL = mixTracks(project)[0];
    const plainR = mixTracks(project)[1];
    project.tracks[0]!.automation = {
      volume: [{ at: 0, value: 1 }],
      pan: [{ at: 0, value: 0 }],
    };
    const automated = mixTracks(project);
    expect(automated[0]).toEqual(plainL);
    expect(automated[1]).toEqual(plainR);
    expect(mixdownReference(project)).toEqual(automated);
  });

  test('empty/missing curves leave the existing loop byte-identical', () => {
    const { project } = oneLane();
    const plain = mixTracks(project);
    project.tracks[0]!.automation = { volume: [], pan: [] };
    expect(mixTracks(project)).toEqual(plain);
  });
});

describe('A2 volume automation — mixdown anchors', () => {
  test('0→1 fade across the lane matches the hand-computed reference', () => {
    const { project } = oneLane();
    project.tracks[0]!.automation = {
      volume: [
        { at: 0, value: 0 },
        { at: 1000, value: 1 },
      ],
    };
    const out = mixTracks(project);
    const ref = mixdownReference(project);
    expect(out).toEqual(ref); // fast == reference (Float64 discipline)
    // literal anchors: out[i] = fround(0.5 · i/1000) — exact binary at these i
    expect(out[0]![0]).toBe(0);
    expect(out[0]![250]).toBe(Math.fround(0.5 * 0.25));
    expect(out[0]![500]).toBe(Math.fround(0.25));
    expect(out[0]![999]).toBe(Math.fround(0.5 * 0.999));
  });

  test('fade multiplies the STRIP gain too (geff × curve per sample)', () => {
    const { project } = oneLane();
    project.tracks[0]!.gain = 0.5;
    project.tracks[0]!.automation = {
      volume: [
        { at: 0, value: 1 },
        { at: 1000, value: 0 },
      ],
    };
    const out = mixTracks(project);
    // out[i] = fround(0.5 · 0.5 · (1 − i/1000))
    expect(out[0]![0]).toBe(Math.fround(0.25));
    expect(out[0]![500]).toBe(Math.fround(0.5 * 0.5 * 0.5));
    expect(out[0]![999]).toBe(Math.fround(0.5 * 0.5 * 0.001));
  });
});

describe('A2 pan automation — balance law per sample', () => {
  test('mono lane, hard-L constant: right channel EXACTLY zero everywhere', () => {
    const project = newProject(SR, []);
    const pcm = [block(1000, 0.5)];
    const t = createTrack(pcm, { name: 'M', sampleRate: SR });
    project.assets[`asset_${t.id}`] = { id: `asset_${t.id}`, sampleRate: SR, channels: pcm };
    project.tracks.push(t);
    t.automation = { pan: [{ at: 0, value: -1 }] };
    const mid = mixTracks(project);
    expect(mid).toHaveLength(2);
    for (let i = 0; i < 1000; ++i) {
      expect(mid[0]![i]).toBe(Math.fround(0.5)); // gl = 1 → passthrough
      expect(mid[1]![i]).toBe(0); // gr = 1 + (−1) = EXACTLY 0
    }
  });

  test('−1→1 sweep: interpolates in the pan domain, law per sample', () => {
    const { project } = oneLane(); // stereo 0.5/−0.5
    project.tracks[0]!.automation = {
      pan: [
        { at: 0, value: -1 },
        { at: 1000, value: 1 },
      ],
    };
    const out = mixTracks(project);
    // i=0: pan −1 → (gl,gr) = (1,0): L = 0.5·1 = 0.5, R = −0.5·0 = 0 (sign exact)
    expect(out[0]![0]).toBe(Math.fround(0.5));
    expect(out[1]![0]).toBe(0);
    // i=250: pan −0.5 → (1, 0.5): L = 0.5, R = fround(−0.5·0.5)
    expect(out[0]![250]).toBe(Math.fround(0.5));
    expect(out[1]![250]).toBe(Math.fround(-0.25));
    // i=750: pan 0.5 → (0.5, 1): L = 0.25, R = −0.5
    expect(out[0]![750]).toBe(Math.fround(0.25));
    expect(out[1]![750]).toBe(Math.fround(-0.5));
  });
});

describe('A2 history — setAutomation rides the project op union', () => {
  test('executeAutomationEdit: undo/redo restores curve AND render bit-exactly', () => {
    const { project, ed, id } = oneLane();
    const before: Array<{ at: number; value: number }> = [];
    const after = [
      { at: 0, value: 0 },
      { at: 1000, value: 1 },
    ];
    ed.executeAutomationEdit(id, 'volume', before, after, 'fade in');
    const faded = trackChannels(project, id); // lane view unaffected (mix concern)
    void faded;
    const outFade = mixTracks(project)[0]!;
    expect(outFade[500]).toBe(Math.fround(0.25));

    ed.undo();
    expect(project.tracks[0]!.automation?.volume ?? []).toEqual([]);
    expect(mixTracks(project)[0]).toEqual(new Float32Array(1000).fill(Math.fround(0.5)));
    ed.redo();
    expect(mixTracks(project)[0]).toEqual(outFade);
    expect(ed.undo()?.label).toBe('fade in');
  });

  test('entries charge 0 bytes; interleaves with clip ops bit-exactly', () => {
    const { project, ed, id } = oneLane();
    const bytesBefore = ed.retainedBytes();
    // interleave: automation → split → automation → undo×3 → redo×3
    const renderAt = (): Float32Array => mixTracks(project)[0]!;
    const snap0 = renderAt(); // true initial state — no automation yet
    ed.executeAutomationEdit(id, 'volume', [], [{ at: 0, value: 0.5 }], 'vol');
    expect(ed.retainedBytes()).toBe(bytesBefore); // timeline-light payload
    ed.executeAutomationEdit(id, 'volume', [{ at: 0, value: 0.5 }], [{ at: 0, value: 1 }], 'vol2');
    const snap1 = renderAt();
    const clipId = project.tracks[0]!.clips[0]!.id;
    arrangeSplitClip(ed, id, clipId, 400);
    const snap2 = renderAt();
    expect(snap2).toEqual(snap1); // split is render-neutral on the timeline

    ed.undo(); // un-split
    expect(renderAt()).toEqual(snap1);
    ed.undo(); // vol2 → vol constant 0.5 → constant fround(0.25)
    expect(renderAt()).toEqual(new Float32Array(1000).fill(Math.fround(0.25)));
    ed.undo(); // vol removed
    expect(renderAt()).toEqual(snap0);
    ed.redo();
    ed.redo();
    ed.redo();
    expect(renderAt()).toEqual(snap2);
  });

  test('unknown track throws; empty `after` removes the param key', () => {
    const { project, ed, id } = oneLane();
    expect(() => ed.executeAutomationEdit('ghost', 'volume', [], [{ at: 0, value: 1 }], 'x')).toThrow();
    ed.executeAutomationEdit(id, 'volume', [], [{ at: 0, value: 1 }], 'add');
    expect(project.tracks[0]!.automation!.volume).toEqual([{ at: 0, value: 1 }]);
    ed.executeAutomationEdit(id, 'volume', [{ at: 0, value: 1 }], [], 'remove');
    expect(project.tracks[0]!.automation!.volume).toBeUndefined();
  });
});
