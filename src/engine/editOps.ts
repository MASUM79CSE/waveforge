/**
 * Pure edit kernels (ADR 002/004): every operation returns NEW channel
 * arrays plus the slice-op descriptors that undo/redo the change. Memory
 * cost is proportional to the *changed region*, not the file (ADR 002).
 */

export type SliceOp =
  | { kind: 'remove'; at: number; len: number; removed?: Float32Array[] }
  | { kind: 'insert'; at: number; data: Float32Array[] }
  | { kind: 'write'; at: number; data: Float32Array[] };

export interface EditOutcome {
  channels: Float32Array[];
  undoOps: SliceOp[];
  redoOps: SliceOp[];
  bytes: number;
}

export interface SampleRange {
  at: number;
  len: number;
}

export function cloneChannels(channels: Float32Array[]): Float32Array[] {
  return channels.map((c) => c.slice());
}

export function sliceRegion(channels: Float32Array[], start: number, len: number): Float32Array[] {
  return channels.map((data) => {
    const s = Math.max(0, Math.min(data.length, start));
    const e = Math.max(s, Math.min(data.length, start + len));
    return data.slice(s, e);
  });
}

export function removeRange(channels: Float32Array[], start: number, len: number): Float32Array[] {
  return channels.map((data) => {
    const s = Math.max(0, Math.min(data.length, start));
    const e = Math.max(s, Math.min(data.length, start + len));
    const out = new Float32Array(data.length - (e - s));
    out.set(data.subarray(0, s), 0);
    out.set(data.subarray(e), s);
    return out;
  });
}

export function insertRegion(
  channels: Float32Array[],
  at: number,
  insert: Float32Array[],
): Float32Array[] {
  return channels.map((data, ch) => {
    const pos = Math.max(0, Math.min(data.length, at));
    const block = insert[ch] ?? new Float32Array(0);
    const out = new Float32Array(data.length + block.length);
    out.set(data.subarray(0, pos), 0);
    out.set(block, pos);
    out.set(data.subarray(pos), pos + block.length);
    return out;
  });
}

export function writeRange(
  channels: Float32Array[],
  at: number,
  data: Float32Array[],
): Float32Array[] {
  return channels.map((channel, ch) => {
    const block = data[ch];
    if (!block) return channel;
    const out = channel.slice();
    out.set(block, Math.max(0, Math.min(channel.length - block.length, at)));
    return out;
  });
}

/** Maps fn over [start, start+len) of every channel, returning new arrays. */
function mapRange(
  channels: Float32Array[],
  start: number,
  len: number,
  fn: (region: Float32Array) => Float32Array,
): Float32Array[] {
  return channels.map((data) => {
    const s = Math.max(0, Math.min(data.length, start));
    const e = Math.max(s, Math.min(data.length, start + len));
    const out = data.slice();
    out.set(fn(data.subarray(s, e)), s);
    return out;
  });
}

export function gainRange(
  channels: Float32Array[],
  start: number,
  len: number,
  factor: number,
): Float32Array[] {
  return mapRange(channels, start, len, (region) => {
    const out = new Float32Array(region.length);
    for (let i = 0; i < region.length; ++i) out[i] = (region[i] ?? 0) * factor;
    return out;
  });
}

export function fadeInRange(channels: Float32Array[], start: number, len: number): Float32Array[] {
  return mapRange(channels, start, len, (region) => {
    const out = new Float32Array(region.length);
    const denom = Math.max(1, region.length - 1);
    for (let i = 0; i < region.length; ++i) out[i] = (region[i] ?? 0) * (i / denom);
    return out;
  });
}

export function fadeOutRange(channels: Float32Array[], start: number, len: number): Float32Array[] {
  return mapRange(channels, start, len, (region) => {
    const out = new Float32Array(region.length);
    const denom = Math.max(1, region.length - 1);
    for (let i = 0; i < region.length; ++i) out[i] = (region[i] ?? 0) * (1 - i / denom);
    return out;
  });
}

export function reverseRange(channels: Float32Array[], start: number, len: number): Float32Array[] {
  return mapRange(channels, start, len, (region) => {
    const out = new Float32Array(region.length);
    for (let i = 0; i < region.length; ++i) out[i] = region[region.length - 1 - i] ?? 0;
    return out;
  });
}

export function invertRange(channels: Float32Array[], start: number, len: number): Float32Array[] {
  return mapRange(channels, start, len, (region) => {
    const out = new Float32Array(region.length);
    for (let i = 0; i < region.length; ++i) out[i] = -(region[i] ?? 0);
    return out;
  });
}

export function peakOf(channels: Float32Array[], start: number, len: number): number {
  let peak = 0;
  for (const data of channels) {
    const s = Math.max(0, Math.min(data.length, start));
    const e = Math.max(s, Math.min(data.length, start + len));
    for (let i = s; i < e; ++i) {
      const v = Math.abs(data[i] ?? 0);
      if (v > peak) peak = v;
    }
  }
  return peak;
}

export function normalizeRange(
  channels: Float32Array[],
  start: number,
  len: number,
  targetPeak: number,
): { data: Float32Array[]; factor: number } {
  const peak = peakOf(channels, start, len);
  const factor = peak > 0 ? targetPeak / peak : 1;
  return { data: gainRange(channels, start, len, factor), factor };
}

/** Consecutive runs (across channels) quieter than `threshold`, ≥ minLen samples. */
export function silenceRanges(
  channels: Float32Array[],
  start: number,
  len: number,
  threshold: number,
  minLen: number,
): SampleRange[] {
  const first = channels[0];
  if (!first || channels.length === 0) return [];
  const s = Math.max(0, Math.min(first.length, start));
  const e = Math.max(s, Math.min(first.length, start + len));

  const ranges: SampleRange[] = [];
  let runStart = -1;
  for (let i = s; i < e; ++i) {
    let loud = false;
    for (const data of channels) {
      if (Math.abs(data[i] ?? 0) >= threshold) {
        loud = true;
        break;
      }
    }
    if (!loud) {
      if (runStart < 0) runStart = i;
    } else if (runStart >= 0) {
      if (i - runStart >= minLen) ranges.push({ at: runStart, len: i - runStart });
      runStart = -1;
    }
  }
  if (runStart >= 0 && e - runStart >= minLen) ranges.push({ at: runStart, len: e - runStart });
  return ranges;
}

export function removeSilenceRanges(
  channels: Float32Array[],
  ranges: SampleRange[],
): Float32Array[] {
  let out = channels;
  // descending removal keeps earlier offsets valid
  const desc = [...ranges].sort((a, b) => b.at - a.at);
  for (const range of desc) out = removeRange(out, range.at, range.len);
  return out;
}

/** Nearest zero-crossing index to `target` within `radius` (else `target`). */
export function findZeroCross(data: Float32Array, target: number, radius: number): number {
  const isCross = (k: number): boolean => {
    if (k < 1 || k >= data.length) return false;
    const a = data[k - 1] ?? 0;
    const b = data[k] ?? 0;
    return (a <= 0 && b > 0) || (a >= 0 && b < 0);
  };
  for (let d = 0; d <= radius; ++d) {
    if (isCross(target + d)) return target + d;
    if (d > 0 && isCross(target - d)) return target - d;
  }
  return target;
}

// ---- command outcomes ----

function bytesOf(arrays: Float32Array[]): number {
  let total = 0;
  for (const a of arrays) total += a.byteLength;
  return total;
}

export function makeCut(channels: Float32Array[], start: number, len: number): EditOutcome {
  const removed = sliceRegion(channels, start, len);
  const next = removeRange(channels, start, len);
  return {
    channels: next,
    undoOps: [{ kind: 'insert', at: start, data: removed }],
    redoOps: [{ kind: 'remove', at: start, len: removed[0]?.length ?? 0, removed }],
    bytes: bytesOf(removed),
  };
}

export function makeInsert(
  channels: Float32Array[],
  at: number,
  insert: Float32Array[],
): EditOutcome {
  return {
    channels: insertRegion(channels, at, insert),
    undoOps: [{ kind: 'remove', at, len: insert[0]?.length ?? 0 }],
    redoOps: [{ kind: 'insert', at, data: insert }],
    bytes: bytesOf(insert),
  };
}

/**
 * Overwrite-style paste: delete [start, start+len), then insert `insert`
 * at `start`. Composite of makeCut + makeInsert with ordered op lists.
 */
export function makeOverwritePaste(
  channels: Float32Array[],
  start: number,
  len: number,
  insert: Float32Array[],
): EditOutcome {
  const cut = makeCut(channels, start, len);
  const paste = makeInsert(cut.channels, start, insert);
  return {
    channels: paste.channels,
    undoOps: [...paste.undoOps, ...cut.undoOps],
    redoOps: [...cut.redoOps, ...paste.redoOps],
    bytes: cut.bytes + paste.bytes,
  };
}

/** Trim = keep only [start, start+len): cut the front, then the tail. */
export function makeTrim(channels: Float32Array[], start: number, len: number): EditOutcome {
  const front = makeCut(channels, 0, start);
  // after the front cut the selection starts at 0, so the tail sits at len
  const tail = makeCut(front.channels, len, (channels[0]?.length ?? 0) - (start + len));
  return {
    channels: tail.channels,
    undoOps: [...tail.undoOps, ...front.undoOps],
    redoOps: [...front.redoOps, ...tail.redoOps],
    bytes: front.bytes + tail.bytes,
  };
}

/**
 * Remove several non-overlapping ranges. Forward removes descending (later
 * offsets first so earlier offsets stay valid); undo restores ascending
 * (invert the last removal first). Ranges may arrive in any order.
 */
export function makeRemoveSilence(
  channels: Float32Array[],
  ranges: { at: number; len: number }[],
): EditOutcome {
  const desc = [...ranges].sort((a, b) => b.at - a.at);
  const removedByAt = new Map<number, Float32Array[]>();
  let current = channels;
  let bytes = 0;
  for (const range of desc) {
    const slices = sliceRegion(current, range.at, range.len);
    removedByAt.set(range.at, slices);
    for (const slice of slices) bytes += slice.byteLength;
    current = removeSilenceRanges(current, [range]);
  }
  return {
    channels: current,
    undoOps: [...ranges]
      .sort((a, b) => a.at - b.at)
      .map((range) => ({
        kind: 'insert',
        at: range.at,
        data: removedByAt.get(range.at) ?? [],
      })),
    redoOps: desc.map((range) => ({ kind: 'remove', at: range.at, len: range.len })),
    bytes,
  };
}

export function makeRangeWrite(
  channels: Float32Array[],
  at: number,
  before: Float32Array[],
  after: Float32Array[],
): EditOutcome {
  return {
    channels: writeRange(channels, at, after),
    undoOps: [{ kind: 'write', at, data: before }],
    redoOps: [{ kind: 'write', at, data: after }],
    bytes: bytesOf(before) + bytesOf(after),
  };
}

export function applyOps(channels: Float32Array[], ops: SliceOp[]): Float32Array[] {
  let out = channels;
  for (const op of ops) {
    if (op.kind === 'remove') out = removeRange(out, op.at, op.len);
    else if (op.kind === 'insert') out = insertRegion(out, op.at, op.data);
    else out = writeRange(out, op.at, op.data);
  }
  return out;
}

// ---- PF-06 / AM-11: seamless loop ----

export interface SeamlessLoopOptions {
  /** Crossfade length in milliseconds (folded from the tail into the head). */
  fadeMs: number;
  /** How many times the conditioned loop is tiled (1–64). */
  repeat: number;
  /** Shrink edges past near-silence before looping (1 ms pad kept). */
  trim: boolean;
  /** Snap both edges to matched-slope zero crossings first. */
  snap: boolean;
  sampleRate: number;
}

/** Backward/forward zero-crossing scan that prefers a matching slope. */
function scanZero(data: Float32Array, from: number, dir: 1 | -1, max: number, slope: number): number {
  let any = -1;
  let i = from;
  for (let n = 0; n < max; ++n, i += dir) {
    if (i < 1 || i >= data.length - 1) break;
    const prev = data[i - 1] ?? 0;
    const curr = data[i] ?? 0;
    if ((prev <= 0 && curr >= 0) || (prev >= 0 && curr <= 0)) {
      if (any < 0) any = i;
      if (!slope || ((data[i + 1] ?? 0) - prev) * slope > 0) return i;
    }
  }
  return any;
}

/**
 * Condition [start, start+len) so it loops without a click: the last
 * `fade` samples are equal-power folded into the head and consumed
 * (output length = regionLen − fade), with optional silence trim and
 * zero-crossing edge snap. The result REPLACES the region through
 * makeOverwritePaste, so undo restores the original audio (AM-11).
 */
/** Where the loop will actually sit after trim/snap, and its sizes. */
export interface SeamlessLoopGeometry {
  s: number;
  e: number;
  fade: number;
  loopLen: number;
  repeat: number;
}

/** Pure planner: edge trim + zero-cross snap + fade clamp, no synthesis. */
export function seamlessLoopGeometry(
  channels: Float32Array[],
  start: number,
  len: number,
  opts: SeamlessLoopOptions,
): SeamlessLoopGeometry {
  const analysis = channels[0] ?? new Float32Array(0);
  const docLen = analysis.length;
  const clampedStart = Math.max(0, Math.min(docLen, start));
  const clampedEnd = Math.max(clampedStart, Math.min(docLen, start + len));
  let s = clampedStart;
  let e = clampedEnd;

  if (opts.trim) {
    const pad = Math.trunc(opts.sampleRate / 1000);
    while (s < e - 8 && Math.abs(analysis[s] ?? 0) < 0.0007) ++s;
    while (e > s + 8 && Math.abs(analysis[e - 1] ?? 0) < 0.0007) --e;
    if (e > s + 8) {
      s = Math.max(clampedStart, s - pad);
      e = Math.min(clampedEnd, e + pad);
    } else {
      s = clampedStart;
      e = clampedEnd;
    }
  }

  if (opts.snap) {
    const max = Math.min(Math.trunc(opts.sampleRate / 100), (e - s) >> 3);
    const z1 = max > 2 ? scanZero(analysis, s + 1, 1, max, 0) : -1;
    const slope = z1 > 0 ? (analysis[z1 + 1] ?? 0) - (analysis[z1 - 1] ?? 0) : 0;
    const z2 = z1 > 0 ? scanZero(analysis, e - 2, -1, max, slope) : -1;
    if (z1 > 0 && z2 > z1 + 8) {
      s = z1;
      e = z2 + 1;
    }
  }

  const regionLen = e - s;
  const fade = Math.max(0, Math.min(Math.trunc((opts.fadeMs * opts.sampleRate) / 1000), regionLen >> 2));
  const loopLen = Math.max(1, regionLen - fade);
  const repeat = Math.max(1, Math.min(64, Math.trunc(opts.repeat) || 1));
  return { s, e, fade, loopLen, repeat };
}

export function seamlessLoopRange(
  channels: Float32Array[],
  start: number,
  len: number,
  opts: SeamlessLoopOptions,
): EditOutcome {
  const { s, e, fade, loopLen, repeat } = seamlessLoopGeometry(channels, start, len, opts);

  const loop: Float32Array[] = channels.map((channel) => {
    const out = new Float32Array(loopLen);
    const halfPi = Math.PI / 2;
    for (let i = 0; i < fade; ++i) {
      const p = i / (fade - 1 || 1);
      out[i] =
        (channel[s + i] ?? 0) * Math.sin(p * halfPi) +
        (channel[e - fade + i] ?? 0) * Math.cos(p * halfPi);
    }
    for (let i = fade; i < loopLen; ++i) out[i] = channel[s + i] ?? 0;
    return out;
  });

  if (repeat === 1) return makeOverwritePaste(channels, s, e - s, loop);

  const tiled: Float32Array[] = loop.map((channel) => {
    const out = new Float32Array(channel.length * repeat);
    for (let n = 0; n < repeat; ++n) out.set(channel, n * channel.length);
    return out;
  });
  return makeOverwritePaste(channels, s, e - s, tiled);
}
