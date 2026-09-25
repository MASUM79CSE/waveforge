/**
 * Asset store + lane bridge + copy-on-write bounce (M9b
).
 * Assets are immutable takes; clips reference them. Destructive ops bounce
 * the affected region into a NEW asset so sibling clips sharing the source
 * are never touched. Zero-copy lane bridge: an M8 lane's channels BECOME
 * the asset (by reference) with one full-length clip.
 */
import {
  insertClip,
  renderRegion,
  splitClip,
  type AudioAsset,
  type AudioClip,
  type ClipTrack,
} from './clips';
import type { ProjectState } from './project';


export class AssetLibrary {
  private entries = new Map<string, { asset: AudioAsset; refcount: number }>();

  /** Register an asset with refcount 1 (one referencing clip). */
  add(asset: AudioAsset): void {
    if (this.entries.has(asset.id)) throw new Error(`AssetLibrary: duplicate asset ${asset.id}`);
    this.entries.set(asset.id, { asset, refcount: 1 });
  }

  acquire(id: string): AudioAsset {
    const entry = this.entries.get(id);
    if (!entry) throw new Error(`AssetLibrary: unknown asset ${id}`);
    entry.refcount += 1;
    return entry.asset;
  }

  /** Decrement; returns true when the asset was garbage-collected. */
  release(id: string): boolean {
    const entry = this.entries.get(id);
    if (!entry) return false;
    entry.refcount -= 1;
    if (entry.refcount <= 0) {
      this.entries.delete(id);
      return true;
    }
    return false;
  }

  get(id: string): AudioAsset | undefined {
    return this.entries.get(id)?.asset;
  }

  refcount(id: string): number {
    return this.entries.get(id)?.refcount ?? 0;
  }

  /** Read-only view for the pure render kernels. */
  view(): Map<string, AudioAsset> {
    const view = new Map<string, AudioAsset>();
    for (const [id, entry] of this.entries) view.set(id, entry.asset);
    return view;
  }

  size(): number {
    return this.entries.size;
  }
}

export interface LaneBridge {
  assets: AssetLibrary;
  /** One ClipTrack per lane id (single full-length clip). */
  tracks: Map<string, ClipTrack>;
}

/** Structural lane view (pre-flip lanes; TrackState satisfied this in M8). */
export interface BridgeLane {
  id: string;
  channels: Float32Array[];
}

/**
 * Bridge raw lanes into the clip world: each lane's channels become an
 * immutable asset (by reference — no PCM copy) backing one clip at 0.
 * (M9d1: project.createTrack does the same at the doc layer.)
 */
export function ensureLaneClips(lanes: BridgeLane[], sampleRate: number): LaneBridge {
  const assets = new AssetLibrary();
  const tracks = new Map<string, ClipTrack>();
  for (const lane of lanes) {
    const assetId = `asset_${lane.id}`;
    assets.add({ id: assetId, sampleRate, channels: lane.channels });
    const clip: AudioClip = {
      id: `clip_${lane.id}`,
      assetId,
      start: 0,
      offset: 0,
      duration: lane.channels[0]?.length ?? 0,
    };
    tracks.set(lane.id, insertClip({ clips: [] }, clip));
  }
  return { assets, tracks };
}

export interface AssetBounceResult {
  track: ClipTrack;
  newAssetId: string;
}

/**
 * Copy-on-write bounce: render [from, from+len) from the clip timeline,
 * run `process`, store the result as a NEW asset, and replace the covered
 * span with a single clip over it. Region edges that land inside a clip
 * auto-split first, so the replacement tiles exactly.
 */
export function bounceRegion(
  assets: AssetLibrary,
  track: ClipTrack,
  from: number,
  len: number,
  process: (channels: Float32Array[]) => Float32Array[],
  newAssetId: string,
): AssetBounceResult {
  const to = from + len;

  // 1. align edges: split any clip whose interior contains an edge.
  //    Each split adds one clip reference — acquire so the library's
  //    refcount stays in step (splits don't know about the library).
  let working = track;
  for (const edge of [from, to]) {
    for (;;) {
      const hit = working.clips.find((c) => c.start < edge && edge < c.start + c.duration);
      if (!hit) break;
      const result = splitClip(working, hit.id, edge);
      assets.acquire(result.right.assetId);
      working = result.track;
    }
  }

  // 2. bounce: render the region, process, store as a new asset
  const region = renderRegion(working, assets.view(), from, len);
  const processed = process(region);
  const asset: AudioAsset = {
    id: newAssetId,
    sampleRate: assets.view().values().next().value?.sampleRate ?? SR_FALLBACK,
    channels: processed,
  };
  assets.add(asset);

  // 3. replace the covered clips with one clip over the new asset.
  //    Refcounts: covered clips release their assets (GC when orphaned).
  const before: AudioClip[] = [];
  const after: AudioClip[] = [];
  for (const clip of working.clips) {
    const covered = clip.start < to && from < clip.start + clip.duration;
    if (covered) {
      assets.release(clip.assetId);
      continue; // covered clips are REPLACED by the bounce clip (dropped here)
    }
    (clip.start >= to ? after : before).push(clip);
  }
  const replacement: AudioClip = {
    id: `bounce_${newAssetId}`,
    assetId: newAssetId,
    start: from,
    offset: 0,
    duration: len,
  };
  return { track: { clips: [...before, replacement, ...after] }, newAssetId };
}

const SR_FALLBACK = 44100;

export interface ProjectBounce {
  trackId: string;
  before: AudioClip[];
  after: AudioClip[];
  asset: AudioAsset;
}

/**
 * Project-level COW bounce (M9d1): destructive region edit on one lane.
 * Returns the pieces for `AudioProjectEditor.executeClipEdit` — the app
 * applies + sweeps; this adapter stays pure (no project mutation).
 * Returns null for an unknown lane or a zero-length region.
 */
export function bounceLaneRegion(
  project: ProjectState,
  trackId: string,
  from: number,
  len: number,
  process: (channels: Float32Array[]) => Float32Array[],
  newAssetId: string,
): ProjectBounce | null {
  const track = project.tracks.find((t) => t.id === trackId);
  if (!track || len <= 0) return null;
  const lib = new AssetLibrary();
  for (const a of Object.values(project.assets)) lib.add(a);
  // refcounts in this temp view only support the bounce math (render/split
  // GC safety); project-level ownership is derived from clip lists instead
  for (const c of track.clips) if (lib.refcount(c.assetId) === 0) lib.acquire(c.assetId);
  const result = bounceRegion(lib, { clips: track.clips }, Math.round(from), Math.round(len), process, newAssetId);
  const asset = lib.get(newAssetId);
  if (!asset) throw new Error(`bounceLaneRegion: bounce asset ${newAssetId} missing`);
  return { trackId, before: track.clips, after: result.track.clips, asset };
}
