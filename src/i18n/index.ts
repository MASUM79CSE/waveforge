/**
 * Locale access. English is the base catalog; partial catalogs (bn) merge
 * over it — untranslated keys fall back to English (no empty strings).
 * Components never import a catalog directly.
 */
import type { ErrorCode } from '../core/errors';
import { en, type Catalog } from './en';
import { bnPartial } from './bn';

const catalogs: Record<string, Catalog> = {
  en,
  bn: { ...en, ...bnPartial } as unknown as Catalog,
};
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
