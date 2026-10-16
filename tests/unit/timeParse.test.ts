// UX-5.1 — time-field parser (INTERACTIONS.md §1): four display formats,
// freestyle input, Enter commits / Escape reverts (component-level), strict
// validation (`1:99` invalid in MS/HMS; garbage invalid; negatives invalid;
// samples = integers only, document-rate dependent).
import { describe, expect, test } from 'vitest';
import { formatTimeField, parseTimeField, type TimeFieldMode } from '../../src/core/timeParse';

const SR = 44100;

describe('timeParse — formatting', () => {
  test.each([
    [83.456, 'S', '83.456'],
    [83.456, 'MS', '1:23.456'],
    [3723.456, 'HMS', '1:02:03.456'],
    [83.456, 'HMS', '0:01:23.456'],
    [(4096 / SR), 'SMP', '4096'],
  ] as Array<[number, TimeFieldMode, string]>)('formatTimeField %p %p → %p', (t, mode, want) => {
    expect(formatTimeField(t, mode, SR)).toBe(want);
  });
});

describe('timeParse — parsing', () => {
  test('S mode: bare decimal seconds', () => {
    expect(parseTimeField('83.456', 'S', SR)).toEqual({ ok: true, seconds: 83.456 });
    expect(parseTimeField('0', 'S', SR)).toEqual({ ok: true, seconds: 0 });
  });

  test('MS mode: m:ss.mmm and bare seconds both accepted', () => {
    expect(parseTimeField('1:23.456', 'MS', SR)).toEqual({ ok: true, seconds: 83.456 });
    expect(parseTimeField('83.456', 'MS', SR)).toEqual({ ok: true, seconds: 83.456 });
  });

  test('HMS mode: h:mm:ss.mmm', () => {
    expect(parseTimeField('1:02:03.456', 'HMS', SR)).toEqual({ ok: true, seconds: 3723.456 });
    expect(parseTimeField('0:01:23.456', 'HMS', SR)).toEqual({ ok: true, seconds: 83.456 });
  });

  test('SMP mode: integer samples at the document rate', () => {
    expect(parseTimeField('4096', 'SMP', SR)).toEqual({ ok: true, seconds: 4096 / SR });
    expect(parseTimeField('4096.5', 'SMP', SR).ok).toBe(false);
  });

  test('INVALID: garbage, 1:99 (MS/HMS), negatives, trailing colon', () => {
    expect(parseTimeField('garbage', 'MS', SR).ok).toBe(false);
    expect(parseTimeField('1:99', 'MS', SR).ok).toBe(false);
    expect(parseTimeField('1:99', 'HMS', SR).ok).toBe(false);
    expect(parseTimeField('1:02:99', 'HMS', SR).ok).toBe(false);
    expect(parseTimeField('-5', 'S', SR).ok).toBe(false);
    expect(parseTimeField('1:', 'MS', SR).ok).toBe(false);
  });

  test('empty input maps to "clear" (ok, null seconds)', () => {
    expect(parseTimeField('', 'MS', SR)).toEqual({ ok: true, seconds: null });
    expect(parseTimeField('   ', 'MS', SR)).toEqual({ ok: true, seconds: null });
  });

  test('millisecond precision is exact for typical values (no float drift)', () => {
    expect(parseTimeField('0:09.272', 'MS', SR)).toEqual({ ok: true, seconds: 9.272 });
  });
});
