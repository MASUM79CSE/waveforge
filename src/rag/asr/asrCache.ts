/**
 * P2.5 — Cache-API adapter bridging transformers.js to P1.3 model
 * storage. transformers.js consults `env.customCache` with TWO key
 * shapes (see its hub.js): a local path (`{localModelPath}/{model}/
 * {file}`) and the remote URL (`https://huggingface.co/{model}/resolve/
 * {rev}/{file}` — its default `proposedCacheKey` for custom caches).
 * Both are resolved to `(modelId, path)` here and served from storage;
 * a miss returns `undefined` and — because the worker also sets
 * `env.allowRemoteModels = false` — fails the load instead of silently
 * downloading. **The pipeline never touches the network**: files enter
 * storage only through the consented downloader (P1.4/P1.5).
 * `put` is a deliberate no-op for the same reason.
 */
import type { ModelStorage } from '../models/storage';

/** transformers.js CacheInterface (subset it uses). */
export interface TransformersCache {
  match(request: string): Promise<Response | undefined>;
  put(
    request: string,
    response: Response,
    progress_callback?: (data: { progress: number; loaded: number; total: number }) => void,
  ): Promise<void>;
}

/**
 * Extract the storage path from a transformers.js cache key.
 * Handles: `https://{host}/{model}/resolve/{rev}/{path}`,
 * `{localModelPath}/{model}/{path}`, and bare `{model}/{path}`.
 * Returns null when the key does not reference `modelId`.
 */
export function modelPathFromCacheKey(request: string, modelId: string): string | null {
  const marker = `/${modelId}/`;
  const i = request.indexOf(marker);
  if (i < 0) return null;
  let rest = request.slice(i + marker.length);
  // strip "resolve/{revision}/" when the key is a remote URL
  rest = rest.replace(/^resolve\/[^/]+\//, '');
  return rest.length > 0 ? decodeURIComponent(rest) : null;
}

// `version` is part of the adapter's identity for future multi-version
// caches; storage keys files per installed version already.
export function createStorageCache(storage: ModelStorage, modelId: string, _version: string): TransformersCache {
  return {
    async match(request) {
      const path = modelPathFromCacheKey(request, modelId);
      if (path === null) return undefined;
      const bytes = await storage.open(modelId, path);
      if (bytes === null) return undefined;
      return new Response(bytes);
    },
    // Intentional: nothing reaches storage outside the consented
    // downloader. A `put` call means a remote fetch happened, which the
    // worker's allowRemoteModels=false prevents in the first place.
    async put() {},
  };
}
