/**
 * Locale access. v1 ships English; `setLocale` is the seam for future
 * catalogs (components never import a catalog directly).
 */
import type { ErrorCode } from '../core/errors';
import { en, type Catalog } from './en';

const catalogs: Record<string, Catalog> = { en };
let active: Catalog = catalogs['en'] ?? en;

export function t(): Catalog {
  return active;
}

export function tError(code: ErrorCode): string {
  return active.errors[code] ?? code;
}

export function setLocale(locale: string): void {
  active = catalogs[locale] ?? en;
}
