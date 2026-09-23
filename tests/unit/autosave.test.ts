/**
 * M6 RED: settings boundary + autosave ring controller.
 * Autosave fires on a 30 s debounce OR every AUTOSAVE_OPS edit operations
 * (1 s micro-debounce); clock and persistence are injected for tests.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  AutosaveController,
  AUTOSAVE_DEBOUNCE_MS,
  AUTOSAVE_MICRO_DEBOUNCE_MS,
  AUTOSAVE_OPS,
} from '../../src/storage/autosave';
import {
  clearSetting,
  installStorageOverride,
  readSetting,
  writeSetting,
} from '../../src/storage/settings';

function memoryStore(): Map<string, string> {
  return new Map<string, string>();
}

describe('settings boundary', () => {
  beforeEach(() => {
    const map = memoryStore();
    installStorageOverride({
      getItem: (key) => map.get(key) ?? null,
      setItem: (key, value) => void map.set(key, value),
      removeItem: (key) => void map.delete(key),
    });
  });

  afterEach(() => {
    installStorageOverride(null);
  });

  test('write/read round-trip and validation fallback', () => {
    writeSetting('autosaveEnabled', true);
    expect(readSetting('autosaveEnabled', true)).toBe(true);
    writeSetting('autosaveEnabled', false);
    expect(readSetting('autosaveEnabled', true)).toBe(false);
    // corrupt value → schema-invalid → fallback, never a throw
    writeSetting('autosaveEnabled', 'not-a-bool' as unknown as boolean);
    expect(readSetting('autosaveEnabled', true)).toBe(true);
  });

  test('unknown keys are namespaced and cleared', () => {
    writeSetting('testKey', 'hello');
    expect(readSetting('testKey', 'x')).toBe('hello');
    clearSetting('testKey');
    expect(readSetting('testKey', 'fallback')).toBe('fallback');
  });

  test('no store at all reads the fallback', () => {
    installStorageOverride(null);
    expect(readSetting('anything', 42)).toBe(42);
  });
});

describe('AutosaveController', () => {
  interface Harness {
    writes: number;
    clears: number;
    controller: AutosaveController;
    advance: (ms: number) => Promise<void>;
  }

  /**
   * Fake-indexeddb-backed snapshot sink + fake timers. `advance` runs the
   * timer queue; the micro-debounce promise resolution needs one more tick,
   * which `flushMicrotasks` forces via the async hop in the sink.
   */
  function makeHarness(snapshot: Uint8Array): Harness {
    const h = {} as Harness;
    let lastWrite = Promise.resolve();
    h.writes = 0;
    h.clears = 0;
    const sink = {
      write: (): Promise<void> => {
        h.writes += 1;
        lastWrite = Promise.resolve();
        return lastWrite;
      },
      clear: (): Promise<void> => {
        h.clears += 1;
        return Promise.resolve();
      },
      read: (): Promise<Uint8Array | null> => Promise.resolve(snapshot),
    };
    vi.useFakeTimers();
    h.controller = new AutosaveController(sink);
    h.advance = async (ms: number): Promise<void> => {
      await vi.advanceTimersByTimeAsync(ms);
    };
    return h;
  }

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test('a single edit schedules nothing before the debounce window', async () => {
    const h = makeHarness(new Uint8Array([1]));
    h.controller.notifyEdit();
    await h.advance(AUTOSAVE_MICRO_DEBOUNCE_MS - 1);
    expect(h.writes).toBe(0);
  });

  test('fires after the operation threshold micro-debounce', async () => {
    const h = makeHarness(new Uint8Array([1]));
    for (let i = 0; i < AUTOSAVE_OPS; ++i) h.controller.notifyEdit();
    await h.advance(AUTOSAVE_MICRO_DEBOUNCE_MS + 1);
    expect(h.writes).toBe(1);
  });

  test('fires on the 30 s time debounce with sparse edits', async () => {
    const h = makeHarness(new Uint8Array([1]));
    h.controller.notifyEdit();
    h.controller.notifyEdit();
    await h.advance(1000);
    expect(h.writes).toBe(0); // below op threshold, inside window
    await h.advance(AUTOSAVE_DEBOUNCE_MS);
    expect(h.writes).toBe(1);
  });

  test('bursts collapse into one write (ring semantics)', async () => {
    const h = makeHarness(new Uint8Array([1]));
    for (let i = 0; i < AUTOSAVE_OPS * 3; ++i) h.controller.notifyEdit();
    await h.advance(AUTOSAVE_MICRO_DEBOUNCE_MS + 1);
    expect(h.writes).toBe(1);
  });

  test('disabled setting suppresses writes', async () => {
    const map = new Map<string, string>();
    installStorageOverride({
      getItem: (key) => map.get(key) ?? null,
      setItem: (key, value) => void map.set(key, value),
      removeItem: (key) => void map.delete(key),
    });
    writeSetting('autosaveEnabled', false);
    const h = makeHarness(new Uint8Array([1]));
    for (let i = 0; i < AUTOSAVE_OPS * 2; ++i) h.controller.notifyEdit();
    await h.advance(AUTOSAVE_DEBOUNCE_MS * 2);
    expect(h.writes).toBe(0);
  });

  test('readLatest exposes the stored snapshot; discard clears', async () => {
    const h = makeHarness(new Uint8Array([7]));
    expect(await h.controller.readLatest()).toEqual(new Uint8Array([7]));
    await h.controller.discard();
    expect(h.clears).toBe(1);
  });

  test('write failures do not throw into the edit path', async () => {
    vi.useFakeTimers();
    const controller = new AutosaveController({
      write: () => Promise.reject(new Error('quota')),
      clear: () => Promise.resolve(),
      read: () => Promise.resolve(null),
    });
    for (let i = 0; i < AUTOSAVE_OPS; ++i) controller.notifyEdit();
    // a rejecting sink must not escape into the edit path
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MICRO_DEBOUNCE_MS + 1);
  });
});
