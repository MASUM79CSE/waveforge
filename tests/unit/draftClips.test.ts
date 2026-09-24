import { describe, expect, test } from 'vitest';
import {
  decodeDraft,
  draftHeaderSchema,
  draftTrackSchema,
  encodeDraftProject,
} from '../../src/storage/draftPayload';
import { renderClipTrack, splitClip } from '../../src/engine/clips';
import {
  createTrack,
  mixTracks,
  mixdownReference,
  trackChannels,
  type ProjectState,
} from '../../src/engine/project';
import {
  buildClipProject,
  exportProjectClips,
} from '../../src/app/projectActions';
import { newProject } from '../../src/engine/projectEditor';

const SR = 44100;

function block(n: number, fill: number): Float32Array {
  return new Float32Array(n).fill(fill);
}

function stereo(n: number, l: number, r: number): Float32Array[] {
  return [block(n, l), block(n, r)];
}

/** Arranged two-lane project: lane A single-clip (4410), lane B split+moved. */
function arrangedProject(): ProjectState {
  const project = newProject(SR, []);
  const pcmA = stereo(4410, 0.25, -0.25);
  const pcmB = stereo(2205, 0.5, 0.5);
  const a = createTrack(pcmA, { name: 'A', sampleRate: SR });
  const b = createTrack(pcmB, { name: 'B', sampleRate: SR });
  const bClip = b.clips[0]!;
  const split = splitClip({ clips: [bClip] }, bClip.id, 800);
  b.clips = [{ ...split.track.clips[1]!, start: 1200, id: split.track.clips[1]!.id }, split.track.clips[0]!].sort(
    (x, y) => x.start - y.start,
  );
  project.assets[`asset_${a.id}`] = { id: `asset_${a.id}`, sampleRate: SR, channels: pcmA };
  project.assets[`asset_${b.id}`] = { id: `asset_${b.id}`, sampleRate: SR, channels: pcmB };
  project.tracks.push(a, b);
  project.activeTrackId = a.id;
  return project;
}

/** Standard v3 byte payload for a project. */
async function v3Bytes(project: ProjectState): Promise<Uint8Array> {
  const payload = exportProjectClips(project)!;
  const header = draftHeaderSchema.parse({
    v: 3,
    name: 'clip draft',
    sampleRate: SR,
    channels: 2,
    length: 4410,
    savedAt: 1,
    tracks: payload.tracks.map((t) => t.meta),
    assets: payload.assets.map((x) => x.meta),
  });
  return encodeDraftProject(
    header,
    payload.tracks.map((t) => ({ meta: t.meta, clips: t.clips, channels: t.channels })),
    payload.assets,
    { compress: false },
  );
}

describe('M9f drafts v3 — payload round-trip', () => {
  test('encode→decode: assets bit-exact, clips survive, track channels rendered', async () => {
    const project = arrangedProject();
    const payload = exportProjectClips(project)!;
    expect(payload.tracks).toHaveLength(2);
    expect(payload.tracks[1]!.clips).toHaveLength(2);
    expect(payload.assets).toHaveLength(2);

    const decoded = await decodeDraft(await v3Bytes(project));
    expect(decoded.header.v).toBe(3);
    expect(decoded.assets).toHaveLength(2);
    const pcmA = stereo(4410, 0.25, -0.25);
    expect(decoded.assets![0]!.channels[0]).toEqual(pcmA[0]);
    expect(decoded.assets![0]!.channels[1]).toEqual(pcmA[1]);
    expect(decoded.tracks![1]!.clips).toHaveLength(2);
    // doc block mirrors track 1 (single full clip → its asset PCM)
    expect(decoded.channels[0]).toEqual(pcmA[0]);
    // v3 track channels render from clips (moved piece ends at 1200+1405)
    expect(decoded.tracks![1]!.channels[0]!.length).toBe(2605);
  });

  test('dedup: a shared asset is stored ONCE and both clips reference it', async () => {
    const project = newProject(SR, []);
    const shared = stereo(1000, 0.5, 0.5);
    const a = createTrack(shared, { name: 'A', sampleRate: SR });
    const b = createTrack(shared, { name: 'B', sampleRate: SR });
    b.clips = [{ ...b.clips[0]!, assetId: `asset_${a.id}`, id: `clip_${b.id}` }];
    project.assets[`asset_${a.id}`] = { id: `asset_${a.id}`, sampleRate: SR, channels: shared };
    project.tracks.push(a, b);
    project.activeTrackId = a.id;

    const payload = exportProjectClips(project)!;
    expect(payload.assets).toHaveLength(1); // deduped
    const decoded = await decodeDraft(await v3Bytes(project));
    expect(decoded.assets).toHaveLength(1);
    expect(decoded.tracks![1]!.clips![0]!.assetId).toBe(`asset_${a.id}`);
    // lane B renders the shared PCM through the reference
    expect(decoded.tracks![1]!.channels[0]).toEqual(shared[0]);
  });

  test('v2 records still validate (clips/assets optional in the schemas)', () => {
    const meta = draftTrackSchema.parse({
      id: 't1', name: 'A', gain: 1, pan: 0, mute: false, solo: false,
      channels: 1, length: 8,
    });
    expect(meta.clips).toBeUndefined();
    const header = draftHeaderSchema.parse({
      v: 2, name: 'x', sampleRate: SR, channels: 1, length: 8, savedAt: 0,
      tracks: [meta],
    });
    expect(header.assets).toBeUndefined();
  });
});

describe('M9f buildClipProject — v3 → arranged project', () => {
  test('v3 payload: lane ≥ 2 arrangement survives; lane 1 mirrors the doc', () => {
    const docCh = stereo(4410, 0.25, -0.25);
    const project = buildClipProject(
      {
        tracks: [
          {
            meta: {
              id: 't_doc', name: 'doc', gain: 1, pan: 0, mute: false, solo: false,
              channels: 2, length: 4410,
            },
            channels: docCh,
          },
          {
            meta: {
              id: 't_arr', name: 'arranged', gain: 0.8, pan: 0.25, mute: false, solo: true,
              channels: 2, length: 2605,
              clips: [
                { id: 'c1', assetId: 'asset_bX', start: 0, offset: 0, duration: 800 },
                { id: 'c2', assetId: 'asset_bX', start: 1200, offset: 800, duration: 1405 },
              ],
            },
            channels: stereo(2605, 0.5, 0.5),
          },
        ],
        assets: [
          {
            meta: { id: 'asset_bX', sampleRate: SR, channels: 2, length: 2205 },
            channels: stereo(2205, 0.5, 0.5),
          },
        ],
      },
      SR,
      docCh,
    );

    expect(project.assets['asset_bX']).toBeDefined();
    const lane2 = project.tracks[1]!;
    expect(lane2.name).toBe('arranged');
    expect(lane2.gain).toBe(0.8);
    expect(lane2.solo).toBe(true);
    expect(lane2.clips).toHaveLength(2);
    expect(lane2.clips[1]!.start).toBe(1200);
    // lane 1 = doc mirror (single full clip over the live doc channels)
    expect(project.tracks[0]!.clips).toHaveLength(1);
    expect(project.tracks[0]!.clips[0]!.duration).toBe(4410);
    // arranged lane renders exactly the clip arrangement
    const rendered = trackChannels(project, lane2.id)!;
    expect(rendered[0]!.length).toBe(2605);
    expect(rendered[0]![0]).toBe(Math.fround(0.5));
    expect(rendered[0]![1000]).toBe(0); // gap
  });

  test('v2-shaped payload (no clips/assets) → single-clip lanes; doc mirror wins lane 1', () => {
    const docCh = stereo(4410, 0.25, -0.25);
    const project = buildClipProject(
      {
        tracks: [
          {
            meta: { id: 't1', name: 'A', gain: 1, pan: 0, mute: false, solo: false, channels: 2, length: 2205 },
            channels: stereo(2205, 0.4, 0.4),
          },
          {
            meta: { id: 't2', name: 'B', gain: 1, pan: 0, mute: false, solo: false, channels: 2, length: 1000 },
            channels: stereo(1000, 0.7, 0.7),
          },
        ],
      },
      SR,
      docCh,
    );
    // lane 1 = doc mirror (single full clip over the LIVE doc channels)
    expect(project.tracks[0]!.clips).toHaveLength(1);
    expect(project.tracks[0]!.clips[0]!.duration).toBe(4410);
    // lane ≥ 2 = single full clip over its stored PCM block
    expect(project.tracks[1]!.clips).toHaveLength(1);
    expect(project.tracks[1]!.clips[0]!.duration).toBe(1000);
    expect(project.assets['asset_t2']).toBeDefined();
    expect(trackChannels(project, 't2')![0]).toEqual(stereo(1000, 0.7, 0.7)[0]);
  });
});

describe('M9f export parity — arranged project mixes/stems from clip timelines', () => {
  test('mixTracks == reference on the arranged project; export channels == kernel render', () => {
    const project = arrangedProject();
    expect(mixTracks(project)).toEqual(mixdownReference(project));
    const payload = exportProjectClips(project)!;
    for (const t of project.tracks) {
      const row = payload.tracks.find((r) => r.meta.id === t.id)!;
      const rendered = renderClipTrack({ clips: t.clips }, new Map(Object.entries(project.assets)));
      expect(row.channels[0]).toEqual(rendered[0]);
      expect(trackChannels(project, t.id)!).toEqual(rendered);
    }
  });
});
