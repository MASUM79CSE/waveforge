/**
 * frame2 vertical scale (UX-4.2) — re-exports the pure core (consumed also
 * by the engine painter) and provides the DOM panel's anchor label set.
 */
import { FLOOR_DB, yForAmp } from '../../core/dbScale';

export { FLOOR_DB, ampToDb, dbFraction, yForAmp, dBValueMapper } from '../../core/dbScale';

export interface ScaleAnchor {
  amp: number;
  label: string;
  /** resolved y for a lane (edge, mid) pair */
  yFor(edge: number, mid: number): number;
}

/** Panel labels: 0 dB at the edge; −6, −20, floor(−60) toward the center. */
export function dbAnchors(floorDb: number = FLOOR_DB): ScaleAnchor[] {
  const floorAmp = Math.pow(10, -floorDb / 20);
  return [
    { amp: 1, label: '0', yFor: (edge) => edge },
    { amp: 0.5, label: '-6', yFor: (edge, mid) => yForAmp(0.5, edge, mid, floorDb) },
    { amp: 0.1, label: '-20', yFor: (edge, mid) => yForAmp(0.1, edge, mid, floorDb) },
    { amp: floorAmp, label: `-${floorDb}`, yFor: (_edge, mid) => mid },
  ];
}
