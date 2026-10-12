import { describe, expect, it } from 'vitest';
import { locale, resolveLocale, setLocale } from '../../../src/i18n';

describe('P6.4 locale activation', () => {
  it('resolveLocale picks bn for bn* languages, en otherwise', () => {
    expect(resolveLocale('bn-BD')).toBe('bn');
    expect(resolveLocale('bn')).toBe('bn');
    expect(resolveLocale('BN-in')).toBe('bn'); // case-insensitive prefix
    expect(resolveLocale('en')).toBe('en');
    expect(resolveLocale('en-US')).toBe('en');
    expect(resolveLocale('fr')).toBe('en');
    expect(resolveLocale(null)).toBe('en');
    expect(resolveLocale(undefined)).toBe('en');
  });

  it('setLocale switches the active catalog (bn menu title)', () => {
    setLocale('bn');
    expect(locale()).toBe('bn');
    setLocale('en');
    expect(locale()).toBe('en');
  });
});
