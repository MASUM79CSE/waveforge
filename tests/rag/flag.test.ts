import { describe, expect, test } from 'vitest';
import { resolveRagFlag } from '../../src/rag/flag';

describe('rag feature flag (P0.8) — pure resolution', () => {
  test('default: every source off → disabled', () => {
    expect(resolveRagFlag({ env: '', urlParam: null, stored: null })).toBe(false);
  });

  test.each([
    ['env', { env: '1', urlParam: null, stored: null }],
    ['url param', { env: '', urlParam: '1', stored: null }],
    ['localStorage', { env: '', urlParam: null, stored: '1' }],
  ])('enabled via %s', (_name, sources) => {
    expect(resolveRagFlag(sources)).toBe(true);
  });

  test('any single source suffices (OR semantics)', () => {
    expect(
      resolveRagFlag({ env: '0', urlParam: '1', stored: '0' }),
    ).toBe(true);
  });

  test.each(['0', 'true', 'yes', 'on', ''])('non-"1" values are off (%s)', (v) => {
    expect(resolveRagFlag({ env: v, urlParam: v, stored: v })).toBe(false);
  });

  test('values are strict string "1" — no coercion', () => {
    expect(resolveRagFlag({ env: ' 1', urlParam: '1 ', stored: '01' })).toBe(false);
  });
});
