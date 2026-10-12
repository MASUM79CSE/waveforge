/**
 * Locale access. v1 ships English; `setLocale` is the seam for future
 * catalogs (components never import a catalog directly).
 */
import type { ErrorCode } from '../core/errors';
import { bn } from './bn';
import { en, type Catalog } from './en';

// Bangla is a FULL catalog since P6.4 (parity-tested in
// tests/unit/i18n/completeness.test.ts); missing keys would degrade to
// English, but none remain.
/** Widened catalog (literal string types → string) for merged partials. */
type CatalogLoose = { [K in keyof Catalog]: Catalog[K] extends string ? string : Catalog[K] };

const catalogs: Record<string, CatalogLoose> = { en, bn: { ...en, ...bn } };
let currentLocale = 'en';
let active: CatalogLoose = catalogs['en'] ?? en;

/** Current locale tag — lets lazy chunks keep their own string tables. */
export function locale(): string {
  return currentLocale;
}

export function t(): Catalog {
  return active as Catalog;
}

export function tError(code: ErrorCode): string {
  return active.errors[code] ?? code;
}

export function setLocale(l: string): void {
  currentLocale = l;
  active = catalogs[l] ?? en;
}
