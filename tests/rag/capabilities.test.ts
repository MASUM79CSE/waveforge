import { describe, expect, test } from 'vitest';
import { detectCapabilities, recommendProfile, type RagEnv } from '../../src/rag/capabilities';

/** Minimal fake env builder — every API absent unless provided. */
function env(over: Partial<RagEnv> = {}): RagEnv {
  return {
    deviceMemoryGB: null,
    hardwareConcurrency: 4,
    crossOriginIsolated: false,
    hasWebGPU: false,
    requestAdapter: async () => null,
    wasmSimdSupported: false,
    storageEstimate: async () => ({ quota: null, usage: null }),
    storagePersisted: async () => null,
    ...over,
  };
}

describe('recommendProfile (pure, documented thresholds)', () => {
  const base = {
    webgpu: false,
    wasmSimd: true,
    wasmThreads: false,
    crossOriginIsolated: false,
    deviceMemoryGB: null as number | null,
    hardwareConcurrency: 4,
    storageQuotaBytes: null as number | null,
    storageUsageBytes: null as number | null,
    persisted: null as boolean | null,
  };

  test('unsupported when WASM SIMD is missing (inference infeasible)', () => {
    expect(recommendProfile({ ...base, wasmSimd: false })).toBe('unsupported');
  });

  test('high: WebGPU + >= 8 GB', () => {
    expect(recommendProfile({ ...base, webgpu: true, deviceMemoryGB: 8 })).toBe('high');
  });

  test('high: WebGPU + 16 GB', () => {
    expect(recommendProfile({ ...base, webgpu: true, deviceMemoryGB: 16 })).toBe('high');
  });

  test('standard: WebGPU + unknown memory (optimistic but honest)', () => {
    expect(recommendProfile({ ...base, webgpu: true, deviceMemoryGB: null })).toBe('standard');
  });

  test('standard: WebGPU + 4 GB (not high)', () => {
    expect(recommendProfile({ ...base, webgpu: true, deviceMemoryGB: 4 })).toBe('standard');
  });

  test('low: no WebGPU + < 4 GB', () => {
    expect(recommendProfile({ ...base, deviceMemoryGB: 2 })).toBe('low');
  });

  test('standard: no WebGPU + >= 4 GB', () => {
    expect(recommendProfile({ ...base, deviceMemoryGB: 4 })).toBe('standard');
  });

  test('standard: no WebGPU + unknown memory + many cores', () => {
    expect(recommendProfile({ ...base, deviceMemoryGB: null, hardwareConcurrency: 12 })).toBe('standard');
  });

  test('low overrides standard when quota is tiny (< 512 MB free)', () => {
    expect(
      recommendProfile({
        ...base,
        deviceMemoryGB: 8,
        storageQuotaBytes: 300 * 1024 * 1024,
        storageUsageBytes: 50 * 1024 * 1024,
      }),
    ).toBe('low');
  });

  test('low when cores are scarce (<= 2) regardless of memory', () => {
    expect(recommendProfile({ ...base, deviceMemoryGB: 16, hardwareConcurrency: 2 })).toBe('low');
  });

  test('threads do not influence the profile yet (documented)', () => {
    expect(recommendProfile({ ...base, wasmThreads: true, crossOriginIsolated: true })).toBe('standard');
  });

  test('tiny quota with unknown memory is low', () => {
    expect(
      recommendProfile({
        ...base,
        deviceMemoryGB: null,
        storageQuotaBytes: 200 * 1024 * 1024,
        storageUsageBytes: null,
      }),
    ).toBe('low');
  });
});

describe('detectCapabilities (injectable env)', () => {
  test('all-absent env → conservative capabilities', async () => {
    const c = await detectCapabilities(env());
    expect(c.webgpu).toBe(false);
    expect(c.wasmSimd).toBe(false);
    expect(c.wasmThreads).toBe(false);
    expect(c.crossOriginIsolated).toBe(false);
    expect(c.deviceMemoryGB).toBeNull();
    expect(c.hardwareConcurrency).toBe(4);
    expect(c.storageQuotaBytes).toBeNull();
    expect(c.storageUsageBytes).toBeNull();
    expect(c.persisted).toBeNull();
    expect(recommendProfile(c)).toBe('unsupported');
  });

  test('reads adapter, flags, memory, and storage from the env', async () => {
    const c = await detectCapabilities(
      env({
        hasWebGPU: true,
        requestAdapter: async () => ({}),
        wasmSimdSupported: true,
        crossOriginIsolated: true,
        deviceMemoryGB: 8,
        hardwareConcurrency: 8,
        storageEstimate: async () => ({ quota: 120_000_000_000, usage: 1_000 }),
        storagePersisted: async () => true,
      }),
    );
    expect(c.webgpu).toBe(true);
    expect(c.wasmSimd).toBe(true);
    expect(c.crossOriginIsolated).toBe(true);
    expect(c.wasmThreads).toBe(true); // isolated + simd implies thread probes allowed
    expect(c.deviceMemoryGB).toBe(8);
    expect(c.storageQuotaBytes).toBe(120_000_000_000);
    expect(c.storageUsageBytes).toBe(1_000);
    expect(c.persisted).toBe(true);
    expect(recommendProfile(c)).toBe('high');
  });

  test('adapter rejection (WebGPU request throws) degrades to false, not a crash', async () => {
    const c = await detectCapabilities(
      env({ hasWebGPU: true, requestAdapter: async () => { throw new Error('gpu boom'); } }),
    );
    expect(c.webgpu).toBe(false);
  });

  test('storage estimate rejection degrades to nulls', async () => {
    const c = await detectCapabilities(
      env({ storageEstimate: async () => { throw new Error('quota boom'); } }),
    );
    expect(c.storageQuotaBytes).toBeNull();
    expect(c.storageUsageBytes).toBeNull();
  });
});
