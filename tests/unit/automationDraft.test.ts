import { describe, expect, test } from 'vitest';
import { draftHeaderSchema } from '../../src/storage/draftPayload';
import { buildClipProject, exportProjectClips, type ClipProjectPayload } from '../../src/app/projectActions';
import { mixTracks, createTrack, type ProjectState } from '../../src/engine/project';
import { newProject } from '../../src/engine/projectEditor';

const SR = 44100;

function laneProject(): ProjectState {
  const project = newProject(SR, []);
  const pcm = [new Float32Array(1000).fill(0.5), new Float32Array(1000).fill(-0.5)];
  const t = createTrack(pcm, { name: 'A', sampleRate: SR });
  project.assets[`asset_${t.id}`] = { id: `asset_${t.id}`, sampleRate: SR, channels: pcm };
  project.tracks.push(t);
  return project;
}

describe('A5 — drafts v3 carry automation (optional field, no version bump)', () => {
  test('schema accepts track automation ≤4096 points/curve; rejects oversized', () => {
    const header = {
      v: 3 as const,
      name: 'x',
      sampleRate: SR,
      channels: 2 as const,
      length: 10,
      savedAt: 1,
      tracks: [
        {
          id: 't1',
          name: 'A',
          gain: 1,
          pan: 0,
          mute: false,
          solo: false,
          channels: 2 as const,
          length: 10,
          automation: { volume: [{ at: 0, value: 1 }, { at: 10, value: 0.5 }] },
        },
      ],
    };
    const parsed = draftHeaderSchema.parse(header);
    expect(parsed.tracks?.[0]?.automation?.volume).toEqual([
      { at: 0, value: 1 },
      { at: 10, value: 0.5 },
    ]);
    const big = structuredClone(header);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (big.tracks![0]!.automation as any).volume = Array.from({ length: 4097 }, (_, i) => ({ at: i, value: 1 }));
    expect(draftHeaderSchema.safeParse(big).success).toBe(false);
    const bad = structuredClone(header);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (bad.tracks![0]!.automation as any).pan = [{ at: 1.5, value: 0 }];
    expect(draftHeaderSchema.safeParse(bad).success).toBe(false); // fractional `at`
  });

  test('exportProjectClips carries the automation meta; buildClipProject restores it', () => {
    const project = laneProject();
    const curve = [
      { at: 0, value: 0 },
      { at: 1000, value: 1 },
    ];
    project.tracks[0]!.automation = { volume: curve, pan: [{ at: 0, value: -1 }] };
    const payload = exportProjectClips(project)!;
    expect(payload.tracks[0]!.meta.automation?.volume).toEqual(curve);

    // wire shape: zod keeps it (v3, no version bump)
    expect(draftHeaderSchema.safeParse({ v: 3, name: 'x', sampleRate: SR, channels: 2, length: 1, savedAt: 1 }).success).toBe(true);

    const restored = buildClipProject(
      { tracks: payload.tracks.map((t) => ({ meta: t.meta, channels: t.channels })), assets: payload.assets },
      SR,
      null,
    );
    expect(restored.tracks[0]!.automation?.volume).toEqual(curve);
    expect(restored.tracks[0]!.automation?.pan).toEqual([{ at: 0, value: -1 }]);
    // and it RENDERS bit-identically to the pre-save project
    expect(mixTracks(restored)).toEqual(mixTracks(project));
  });

  test('lanes WITHOUT automation restore exactly as before (field absent)', () => {
    const project = laneProject();
    const payload = exportProjectClips(project)!;
    expect(payload.tracks[0]!.meta.automation).toBeUndefined();
    const restored = buildClipProject(
      { tracks: payload.tracks.map((t) => ({ meta: t.meta, channels: t.channels })), assets: payload.assets },
      SR,
      null,
    );
    expect(restored.tracks[0]!.automation).toBeUndefined();
  });

  test('v2-lane restore path also takes automation when present', () => {
    const pcm = [new Float32Array(500).fill(0.25)];
    const meta = {
      id: 't9',
      name: 'B',
      gain: 1,
      pan: 0,
      mute: false,
      solo: false,
      channels: 1 as const,
      length: 500,
      automation: { pan: [{ at: 0, value: 1 }] },
    };
    const payload: ClipProjectPayload = { tracks: [{ meta, channels: pcm }] };
    const restored = buildClipProject(payload, SR, null);
    expect(restored.tracks[0]!.automation?.pan).toEqual([{ at: 0, value: 1 }]);
  });
});
