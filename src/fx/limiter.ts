/**
 * Hard limiter kernel (ADR 005 §5): standard feed-forward lookahead
 * limiter. Per-sample target gain = min(1, ceiling/|x|), lowered ahead of
 * peaks with a sliding-min over the lookahead window, then released back
 * toward unity with a one-pole. Stereo gain is linked (image preserved).
 * Replaces the reference editor's block-normalize limiter, which produced
 * block-boundary artifacts.
 */

export interface LimiterParams {
  ceilingDb: number;
  lookaheadMs: number;
  releaseMs: number;
}

/** O(n) sliding minimum over a forward window via a monotonic deque. */
function slidingMin(data: Float32Array, window: number): Float32Array {
  const n = data.length;
  const out = new Float32Array(n);
  const deque: number[] = []; // indices, values increasing from head
  let head = 0;
  const at = (i: number): number => data[i] ?? 0;
  for (let j = 0; j < n; ++j) {
    // push j, keeping values increasing toward the tail
    while (deque.length > head && at(deque[deque.length - 1] ?? 0) >= at(j)) deque.pop();
    deque.push(j);
    // position i's forward window [i, i+window) ends at j = i + window - 1
    const i = j - window + 1;
    if (i >= 0) {
      while (deque.length > head && (deque[head] ?? 0) < i) head += 1;
      out[i] = at(deque[head] ?? 0);
    }
  }
  // tail: clamped windows [i, n) — the deque still holds the suffix
  for (let i = Math.max(0, n - window + 1); i < n; ++i) {
    while (deque.length > head && (deque[head] ?? 0) < i) head += 1;
    out[i] = at(deque[head] ?? 0);
  }
  return out;
}

export function hardLimit(
  channels: Float32Array[],
  sampleRate: number,
  params: LimiterParams,
): Float32Array[] {
  const len = channels[0]?.length ?? 0;
  if (len === 0) return channels.map(() => new Float32Array(0));

  const ceiling = Math.pow(10, params.ceilingDb / 20);
  const lookahead = Math.max(1, Math.round((sampleRate * params.lookaheadMs) / 1000));
  const releaseCoef = 1 - Math.exp(-1 / Math.max(1e-4, (sampleRate * params.releaseMs) / 1000));

  // linked target gain: min across channels, per sample
  const target = new Float32Array(len);
  for (let i = 0; i < len; ++i) {
    let needed = 1;
    for (const ch of channels) {
      const abs = Math.abs(ch[i] ?? 0);
      if (abs > ceiling) {
        const g = ceiling / abs;
        if (g < needed) needed = g;
      }
    }
    target[i] = needed;
  }

  // lookahead: gain must be low *before* each peak (sliding min forward)
  const ahead = slidingMin(target, lookahead);

  // release: fall instantly to what's needed, rise back toward 1 smoothly
  const gain = new Float32Array(len);
  let current = 1;
  for (let i = 0; i < len; ++i) {
    const m = ahead[i] ?? 1;
    current = m < current ? m : Math.min(m, current + (1 - current) * releaseCoef);
    gain[i] = current;
  }

  return channels.map((ch) => {
    const out = new Float32Array(len);
    for (let i = 0; i < len; ++i) out[i] = (ch[i] ?? 0) * (gain[i] ?? 0);
    return out;
  });
}
