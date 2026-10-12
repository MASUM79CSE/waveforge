/**
 * P3.3 — deterministic fake embeddings (pure). CI/CI-e2e stand-in for a
 * real encoder: a signed bag-of-hashed-tokens vector. Deterministic and
 * overlap-sensitive — texts sharing more (hashed) tokens score higher
 * cosine — but NOT semantic. Never imported by the real worker.
 *
 * Scheme: dim 256; per token h = hash32(token); index h % 256 gets
 * += (h bit 9 ? +1 : −1) (signed collisions partially cancel); result
 * L2-normalized (zero vector when no tokens).
 */
import { tokenize } from './bm25';

export const FAKE_EMBED_DIM = 256;

/** FNV-1a 32-bit, numeric (module-local — model.ts has the hex variant). */
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function embedText(text: string): Float32Array {
  const vec = new Float32Array(FAKE_EMBED_DIM);
  for (const tok of tokenize(text)) {
    const h = hash32(tok);
    const idx = h % FAKE_EMBED_DIM;
    const sign = (h >>> 9) & 1 ? 1 : -1;
    vec[idx] = (vec[idx] ?? 0) + sign;
  }
  let sum = 0;
  for (const v of vec) sum += v * v;
  const norm = Math.sqrt(sum);
  if (norm === 0) return vec;
  for (let i = 0; i < vec.length; i++) vec[i] = (vec[i] ?? 0) / norm;
  return vec;
}

export function embedTexts(texts: readonly string[]): Float32Array[] {
  return texts.map(embedText);
}

/** Cosine similarity (inputs expected L2-normalized — dot is enough). */
export function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) dot += (a[i] ?? 0) * (b[i] ?? 0);
  return dot;
}
