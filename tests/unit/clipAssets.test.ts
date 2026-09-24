import { describe, expect, test } from 'vitest';
import {
  AssetLibrary,
  bounceRegion,
  ensureLaneClips,
  type AssetBounceResult,
} from '../../src/engine/clipAssets';
import { insertClip, renderClipTrack, renderRegion, type AudioClip, type ClipTrack } from '../../src/engine/clips';


const SR = 44100;

function monoAsset(id: string, length: number, fill: number) {
  return { id, sampleRate: SR, channels: [new Float32Array(length).fill(fill)] };
}

function clip(start: number, duration: number, offset = 0, assetId = 'a', id = 'c'): AudioClip {
  return { id, assetId, start, offset, duration };
}

function trackOf(...clips: AudioClip[]): ClipTrack {
  let t: ClipTrack = { clips: [] };
  for (const c of clips) t = insertClip(t, c);
  return t;
}

describe('M9b AssetLibrary — refcount lifecycle', () => {
  test('add/acquire/release; GC exactly at zero', () => {
    const lib = new AssetLibrary();
    lib.add(monoAsset('a', 10, 0.5));
    expect(lib.refcount('a')).toBe(1);
    lib.acquire('a');
    lib.acquire('a');
    expect(lib.refcount('a')).toBe(3);
    expect(lib.release('a')).toBe(false);
    expect(lib.release('a')).toBe(false);
    expect(lib.release('a')).toBe(true); // GC'd
    expect(lib.get('a')).toBeUndefined();
    expect(lib.release('a')).toBe(false); // releasing a ghost is a no-op
  });

  test('get returns the live asset (zero-copy bridge relies on this)', () => {
    const lib = new AssetLibrary();
    const channels = [new Float32Array(4).fill(0.5)];
    lib.add({ id: 'a', sampleRate: SR, channels });
    expect(lib.get('a')!.channels[0]).toBe(channels[0]); // by reference
  });
});

describe('M9b lane bridge — lanes become single-clip tracks', () => {
  test('parity: render of the bridged track == original channels bit-exact', () => {
    const ch: Float32Array[] = [new Float32Array(8).fill(0.25), new Float32Array(8).fill(-0.25)];
    const lane = { id: 'laneX', channels: ch };
    const bridge = ensureLaneClips([lane], SR);
    const track = bridge.tracks.get(lane.id)!;
    expect(track.clips).toHaveLength(1);
    expect(track.clips[0]).toEqual({ id: `clip_${lane.id}`, assetId: `asset_${lane.id}`, start: 0, offset: 0, duration: 8 });
    const rendered = renderClipTrack(track, bridge.assets.view());
    expect(rendered[0]).toEqual(ch[0]);
    expect(rendered[1]).toEqual(ch[1]);
    // refcount 1 per lane asset
    expect(bridge.assets.refcount(`asset_${lane.id}`)).toBe(1);
  });
});

describe('M9b bounceRegion — copy-on-write', () => {
  test('identity process on a whole single-clip track == in-place edit (bit-exact)', () => {
    const lib = new AssetLibrary();
    lib.add(monoAsset('a', 100, 0.5));
    const t = trackOf(clip(0, 100, 0, 'a', 'only'));
    const before = renderClipTrack(t, lib.view()); // pre-bounce (source may GC)
    const result: AssetBounceResult = bounceRegion(lib, t, 0, 100, (ch) => ch, 'b1');
    const after = renderClipTrack(result.track, lib.view());
    expect(after[0]).toEqual(before[0]);
    expect(result.newAssetId).not.toBe('a'); // new asset, not mutation
  });

  test('gain process applies exactly to [from, from+len); outside untouched', () => {
    const lib = new AssetLibrary();
    lib.add(monoAsset('a', 100, 0.5));
    const t = trackOf(clip(0, 100, 0, 'a', 'only'));
    const result = bounceRegion(
      lib,
      t,
      20,
      50,
      (ch) => ch.map((c) => c.map((v) => v * 2)),
      'b2',
    );
    const out = renderClipTrack(result.track, lib.view());
    expect(out[0]![10]).toBe(Math.fround(0.5));
    expect(out[0]![20]).toBe(1); // 0.5 * 2
    expect(out[0]![69]).toBe(1);
    expect(out[0]![70]).toBe(Math.fround(0.5));
  });

  test('shared asset: sibling clip referencing the same asset is untouched', () => {
    const lib = new AssetLibrary();
    lib.add(monoAsset('a', 100, 0.5));
    lib.acquire('a'); // refcount discipline: two clips reference 'a'
    const t = trackOf(clip(0, 50, 0, 'a', 'c1'), clip(50, 50, 50, 'a', 'c2')); // c2 = "copy" via offset
    const result = bounceRegion(lib, t, 0, 50, (ch) => ch.map((c) => c.map(() => 0.9)), 'b3');
    // c2 still renders the ORIGINAL asset region
    const sib = renderRegion(result.track, lib.view(), 50, 50);
    expect(sib[0]![0]).toBe(Math.fround(0.5));
    // c1 region now renders the bounced asset
    const c1 = renderRegion(result.track, lib.view(), 0, 50);
    expect(c1[0]![0]).toBe(Math.fround(0.9));
  });

  test('bridged lane: identity bounce preserves render bit-exact vs original channels', () => {
    const ch: Float32Array[] = [new Float32Array(16).fill(0.3), new Float32Array(16).fill(-0.3)];
    const lane = { id: 'laneY', channels: ch };
    const bridge = ensureLaneClips([lane], SR);
    const t = bridge.tracks.get(lane.id)!;
    const result = bounceRegion(bridge.assets, t, 4, 8, (c) => c, 'bridge_b');
    const out = renderClipTrack(result.track, bridge.assets.view());
    expect(out[0]).toEqual(ch[0]);
    expect(out[1]).toEqual(ch[1]);
    // source asset still referenced by the two split-off edges
    expect(bridge.assets.refcount(`asset_${lane.id}`)).toBe(2);
    expect(bridge.assets.refcount('bridge_b')).toBe(1);
  });

  test('GC: full-clip replacement orphans the source asset', () => {
    const lib = new AssetLibrary();
    lib.add(monoAsset('a', 50, 0.5));
    const t = trackOf(clip(0, 50, 0, 'a', 'only'));
    const result = bounceRegion(lib, t, 0, 50, (ch) => ch.map((c) => c.map(() => 0.7)), 'b9');
    expect(lib.get('a')).toBeUndefined(); // GC'd
    expect(lib.refcount('b9')).toBe(1);
    expect(renderClipTrack(result.track, lib.view())[0]![0]).toBe(Math.fround(0.7));
  });

  test('region spanning a clip boundary auto-splits, then bounces exactly', () => {
    const lib = new AssetLibrary();
    lib.add(monoAsset('a', 200, 0.5));
    lib.acquire('a'); // two clips reference 'a'
    const t = trackOf(clip(0, 100, 0, 'a', 'c1'), clip(100, 100, 100, 'a', 'c2'));
    const result = bounceRegion(lib, t, 80, 40, (ch) => ch.map((c) => c.map(() => 0.1)), 'b4');
    const out = renderClipTrack(result.track, lib.view());
    expect(out[0]![79]).toBe(Math.fround(0.5)); // untouched before
    expect(out[0]![80]).toBe(Math.fround(0.1)); // bounce start
    expect(out[0]![119]).toBe(Math.fround(0.1)); // bounce end-1
    expect(out[0]![120]).toBe(Math.fround(0.5)); // untouched after
    expect(result.track.clips.map((c) => c.start)).toEqual([0, 80, 120]); // split edges
    expect(result.track.clips).toHaveLength(3);
  });
});
