/**
 * FX/edits target routing (M8f): which channel set an effect or edit
 * applies to. Lane 1 IS the document — effects there ride the doc path
 * (swapDoc keeps the doc, peaks and status bar in sync). Lanes ≥ 2 own
 * their channels inside the project; edits commit through the project
 * history. A stale active id (lane just removed) routes to null — the
 * caller must not silently hit the document.
 */
export type FxTarget = 'doc' | string | null;

export function resolveFxTarget(
  trackIds: Array<{ id: string }> | null,
  activeTrackId: string | null,
  docTrackId: string,
): FxTarget {
  if (!trackIds || !activeTrackId) return 'doc';
  if (activeTrackId === docTrackId) return 'doc';
  return trackIds.some((t) => t.id === activeTrackId) ? activeTrackId : null;
}
