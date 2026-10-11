/**
 * Smart RAG capability detection (P1.1). Pure, injectable, dependency-free:
 * every browser API is reached through a `RagEnv` the caller (or a test)
 * supplies. No model/library imports here.
 *
 * Profile thresholds (documented, tested):
 *  - `unsupported`: WASM SIMD unavailable → local inference infeasible.
 *  - `high`:        WebGPU adapter AND deviceMemory >= 8 GB.
 *  - `low`:         tiny free storage (< 512 MB) OR <= 2 cores OR
 *                   (no WebGPU AND deviceMemory < 4 GB).
 *  - `standard`:    everything else.
 * Threads/crossOriginIsolation do NOT influence the profile yet (P1.6
 * experiment pending); they are reported for scheduling decisions.
 */

export interface Capabilities {
  webgpu: boolean;
  wasmSimd: boolean;
  /** WASM threads need crossOriginIsolated (SharedArrayBuffer). */
  wasmThreads: boolean;
  crossOriginIsolated: boolean;
  /** `navigator.deviceMemory` in GB, null when unavailable. */
  deviceMemoryGB: number | null;
  hardwareConcurrency: number;
  storageQuotaBytes: number | null;
  storageUsageBytes: number | null;
  persisted: boolean | null;
}

export type RagProfile = 'unsupported' | 'low' | 'standard' | 'high';

/** Injectable browser surface — tests pass a partial fake. */
export interface RagEnv {
  deviceMemoryGB: number | null;
  hardwareConcurrency: number;
  crossOriginIsolated: boolean;
  hasWebGPU: boolean;
  requestAdapter: () => Promise<unknown>;
  wasmSimdSupported: boolean;
  storageEstimate: () => Promise<{ quota: number | null; usage: number | null }>;
  storagePersisted: () => Promise<boolean | null>;
}

const LOW_QUOTA_FREE_BYTES = 512 * 1024 * 1024;

export function recommendProfile(c: Capabilities): RagProfile {
  if (!c.wasmSimd) return 'unsupported';
  const freeBytes =
    c.storageQuotaBytes !== null
      ? c.storageQuotaBytes - (c.storageUsageBytes ?? 0)
      : null;
  const tinyQuota = freeBytes !== null && freeBytes < LOW_QUOTA_FREE_BYTES;
  if (tinyQuota || c.hardwareConcurrency <= 2) return 'low';
  if (c.webgpu && c.deviceMemoryGB !== null && c.deviceMemoryGB >= 8) return 'high';
  if (!c.webgpu && c.deviceMemoryGB !== null && c.deviceMemoryGB < 4) return 'low';
  return 'standard';
}

/** WASM SIMD feature-detection probe (standard 47-byte v128 module). */
const SIMD_PROBE = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65,
  0, 253, 15, 253, 98, 11,
]);

function browserEnv(): RagEnv {
  const nav = (typeof navigator !== 'undefined' ? navigator : {}) as {
    deviceMemory?: number;
    hardwareConcurrency?: number;
    gpu?: { requestAdapter: () => Promise<unknown> };
  };
  const gpu = nav.gpu;
  return {
    deviceMemoryGB: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
    hardwareConcurrency: typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : 4,
    crossOriginIsolated: typeof crossOriginIsolated !== 'undefined' ? crossOriginIsolated : false,
    hasWebGPU: !!gpu && typeof gpu.requestAdapter === 'function',
    requestAdapter: () => (gpu ? gpu.requestAdapter() : Promise.resolve(null)),
    wasmSimdSupported: (() => {
      try {
        return typeof WebAssembly !== 'undefined' && WebAssembly.validate(SIMD_PROBE);
      } catch {
        return false;
      }
    })(),
    storageEstimate: async () => {
      try {
        const est = await navigator.storage.estimate();
        return { quota: est.quota ?? null, usage: est.usage ?? null };
      } catch {
        return { quota: null, usage: null };
      }
    },
    storagePersisted: async () => {
      try {
        return await navigator.storage.persisted();
      } catch {
        return null;
      }
    },
  };
}

export async function detectCapabilities(source?: RagEnv): Promise<Capabilities> {
  const e = source ?? browserEnv();
  let webgpu = false;
  if (e.hasWebGPU) {
    try {
      const adapter = await e.requestAdapter();
      webgpu = adapter !== null && adapter !== undefined;
    } catch {
      webgpu = false;
    }
  }
  let quota: number | null = null;
  let usage: number | null = null;
  try {
    const est = await e.storageEstimate();
    quota = est.quota;
    usage = est.usage;
  } catch {
    quota = null;
    usage = null;
  }
  let persisted: boolean | null = null;
  try {
    persisted = await e.storagePersisted();
  } catch {
    persisted = null;
  }
  const isolated = e.crossOriginIsolated;
  return {
    webgpu,
    wasmSimd: e.wasmSimdSupported,
    // Threads require crossOriginIsolation (SharedArrayBuffer availability);
    // SIMD alone is not proof, so gate threads on isolation.
    wasmThreads: isolated && e.wasmSimdSupported,
    crossOriginIsolated: isolated,
    deviceMemoryGB: e.deviceMemoryGB,
    hardwareConcurrency: e.hardwareConcurrency,
    storageQuotaBytes: quota,
    storageUsageBytes: usage,
    persisted,
  };
}
