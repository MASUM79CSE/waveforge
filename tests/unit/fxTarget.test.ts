import { describe, expect, test } from 'vitest';
import { resolveFxTarget, type FxTarget } from '../../src/app/fxTarget';

describe('M8f fx target routing', () => {
  const docId = 't1_doc';

  test('no project / no active → doc path', () => {
    expect(resolveFxTarget(null, null, docId)).toBe('doc');
    expect(resolveFxTarget([{ id: docId }, { id: 't2' }], null, docId)).toBe('doc');
  });

  test('active = track 1 → doc path (doc owns lane 1 channels)', () => {
    expect(resolveFxTarget([{ id: docId }, { id: 't2' }], docId, docId)).toBe('doc');
  });

  test('active = lane N → that track', () => {
    const t: FxTarget = resolveFxTarget([{ id: docId }, { id: 't2' }], 't2', docId);
    expect(t).toBe('t2');
    expect(resolveFxTarget([{ id: docId }, { id: 't3' }], 't2', docId)).toBeNull(); // stale id
  });

  test('active id missing from the project (removed) → null, never the doc', () => {
    expect(resolveFxTarget([{ id: docId }], 't9', docId)).toBeNull();
  });
});
