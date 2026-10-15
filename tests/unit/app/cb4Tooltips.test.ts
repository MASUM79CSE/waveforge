// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';

/**
 * CB-4.3/CB-4.4 — registry-derived tooltip helper + the bn catalog.
 * Written BEFORE the implementations (RED→green per protocol).
 */
import { commands } from '../../../src/app/commands';
import { cmdTitle, kbdOf } from '../../../src/app/cb2/tooltips';
import { en } from '../../../src/i18n/en';
import { bn } from '../../../src/i18n/bn';
import { setLocale, t } from '../../../src/i18n';

describe('CB-4.3 tooltip helper (registry-derived)', () => {
  test('name + shortcut come from the registry, never hardcoded', () => {
    expect(cmdTitle('edit.deselect')).toBe(`${en.editDeselect} (Q)`);
    expect(cmdTitle('transport.playPause')).toBe(`${en.play} (Space)`);
    // R/P/M ARE real bindings (shortcuts.ts resolveShortcut — the Phase-4
    // purge mis-audited them; corrected in E-CB-021). Monitor has none
    // (M belongs to the metronome).
    expect(cmdTitle('record.metronome')).toBe(`${en.studioMetronome} (M)`);
    expect(cmdTitle('record.punch')).toBe(`${en.punchIn} (P)`);
    expect(kbdOf('record.monitor')).toBe('');
    expect(kbdOf('edit.deselect')).toBe(' (Q)');
    expect(cmdTitle('no.such.command')).toBe('');
  });

  test('every registry command renders label + (kbd) exactly when kbd exists', () => {
    for (const c of commands) {
      const kbd = c.kbd?.();
      if (kbd) expect(cmdTitle(c.id)).toBe(`${c.label()} (${kbd})`);
      else expect(cmdTitle(c.id)).toBe(c.label());
    }
  });
});

describe('CB-4.4 bn catalog', () => {
  test('bn has the exact en key shape (all keys, incl. errors)', () => {
    expect(Object.keys(bn).sort()).toEqual(Object.keys(en).sort());
    const v2Keys = [
      'zoneTransport',
      'selZone',
      'play',
      'cursorPosition',
      'studioMetronome',
      'clipReset',
      'menuBarLabel',
    ] as const;
    for (const k of v2Keys) {
      const v = bn[k];
      expect(typeof v).toBe('string');
      expect((v as string).length).toBeGreaterThan(0);
    }
  });

  test('bn function keys keep their signatures', () => {
    expect(bn.statusBar('9')).toContain('9'); // translated copy, same slot
    expect(bn.toastLoaded('x.wav')).toContain('x.wav');
    expect(bn.draftsUsage(2, 10)).toContain('10');
  });

  test('setLocale(bn) switches t(); unknown locale falls back to en', () => {
    setLocale('bn');
    expect(t().play).toBe(bn.play);
    expect(t().play).not.toBe(en.play);
    setLocale('de');
    expect(t().play).toBe(en.play);
    setLocale('en');
    expect(t().play).toBe(en.play);
  });

  test('credit-contract strings stay EXACT in bn (Welcome/About locked texts)', () => {
    expect(bn.welcomeLead).toBe(en.welcomeLead);
    expect(bn.welcomeDevBy).toBe(en.welcomeDevBy);
    expect(bn.welcomeDevRole).toBe(en.welcomeDevRole);
    expect(bn.devCreditNote).toBe(en.devCreditNote);
    expect(bn.aboutTitle).toBe(en.aboutTitle);
    expect(bn.welcomeTitle).toBe(en.welcomeTitle);
  });
});
