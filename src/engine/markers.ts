/**
 * PF-01 / AM-07 — user markers (pure kernel).
 *
 * Markers are document-anchored annotations: sorted by position, unique
 * ids, short user labels. Pure and deterministic — no WebAudio, no DOM.
 * Sample-domain positions match the rest of the engine.
 */
export interface Marker {
  id: string;
  /** Position in samples (document sample rate). */
  t: number;
  label: string;
}

export const MARKER_MAX = 1024;
export const LABEL_MAX = 200;

/** Insert keeping sort order by `t`; throws on duplicate id or bad input. */
export function insertMarker(list: Marker[], m: Marker): Marker[] {
  if (!Number.isFinite(m.t) || m.t < 0) throw new Error('insertMarker: bad position');
  if (!m.id) throw new Error('insertMarker: missing id');
  if (list.some((x) => x.id === m.id)) throw new Error(`insertMarker: duplicate id ${m.id}`);
  const label = m.label.slice(0, LABEL_MAX);
  const out = list.slice();
  let index = out.length;
  for (let i = 0; i < out.length; ++i) {
    if (out[i]!.t > m.t) {
      index = i;
      break;
    }
  }
  out.splice(index, 0, { ...m, label });
  return out;
}

export function removeMarker(list: Marker[], id: string): Marker[] {
  const out = list.filter((m) => m.id !== id);
  return out.length === list.length ? list : out;
}

export function renameMarker(list: Marker[], id: string, label: string): Marker[] {
  return list.map((m) => (m.id === id ? { ...m, label: label.slice(0, LABEL_MAX) } : m));
}

export function moveMarker(list: Marker[], id: string, t: number): Marker[] {
  const m = list.find((x) => x.id === id);
  if (!m) return list;
  return insertMarker(removeMarker(list, id), { ...m, t });
}

/** Nearest marker strictly before `t`, else null. */
export function prevMarker(list: Marker[], t: number): Marker | null {
  let best: Marker | null = null;
  for (const m of list) {
    if (m.t < t && (best === null || m.t > best.t)) best = m;
  }
  return best;
}

/** Nearest marker strictly after `t`, else null. */
export function nextMarker(list: Marker[], t: number): Marker | null {
  let best: Marker | null = null;
  for (const m of list) {
    if (m.t > t && (best === null || m.t < best.t)) best = m;
  }
  return best;
}

/** Nearest marker within `radius` samples of `t`, else null. */
export function nearestMarker(list: Marker[], t: number, radius: number): Marker | null {
  let best: Marker | null = null;
  let bestD = Infinity;
  for (const m of list) {
    const d = Math.abs(m.t - t);
    if (d <= radius && d < bestD) {
      best = m;
      bestD = d;
    }
  }
  return best;
}

/** "Marker N" — first free index (1-based) among default-named markers. */
export function defaultMarkerName(list: Marker[]): string {
  const used = new Set(list.map((m) => m.label).filter((l) => /^Marker \d+$/.test(l)));
  let n = 1;
  while (used.has(`Marker ${n}`)) n += 1;
  return `Marker ${n}`;
}
