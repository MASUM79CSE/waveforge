import { describe, expect, test } from 'vitest';
import { useFakeIdb } from '../helpers/fakeIdb';
import {
  deleteUserPreset,
  listUserPresets,
  loadUserPreset,
  saveUserPreset,
} from '../../src/storage/presetStore';

/** C3 — user chain presets (docs/fxchains-plan.md): tiny idb store, drafts
 * precedent. RED over the missing module; repository-surface gates. */

describe('C3 — user preset store', () => {
  test('save → list (sorted) → load round-trips the chain JSON', async () => {
    useFakeIdb();
    await saveUserPreset('zed chain', '{"chain":1}');
    await saveUserPreset('alpha chain', '{"chain":2}');
    expect(await listUserPresets()).toEqual(['alpha chain', 'zed chain']);
    expect(await loadUserPreset('zed chain')).toBe('{"chain":1}');
  });

  test('re-saving a name overwrites; delete removes; missing load is undefined', async () => {
    useFakeIdb();
    await saveUserPreset('mine', 'v1');
    await saveUserPreset('mine', 'v2');
    expect(await loadUserPreset('mine')).toBe('v2');
    expect(await listUserPresets()).toEqual(['mine']);
    await deleteUserPreset('mine');
    expect(await listUserPresets()).toEqual([]);
    expect(await loadUserPreset('mine')).toBeUndefined();
  });
});
