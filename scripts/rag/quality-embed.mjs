/**
 * MAINTAINER TOOL — OPT-IN REAL-MODEL CHECK. NEVER run by CI.
 *
 * Measures REAL embedding-model retrieval quality over the golden
 * corpus (src/rag/eval/corpus.ts) and prints hit@1/hit@3/MRR next to
 * the deterministic-fake baseline. Run from the repo root:
 *
 *   npx vite-node scripts/rag/quality-embed.mjs \
 *     --model=Xenova/all-MiniLM-L6-v2
 *
 * The first run downloads the model from huggingface.co into the local
 * HF cache (~23 MB for MiniLM-L6); later runs are offline. Nothing here
 * runs unless a maintainer types the command.
 */
const args = process.argv.slice(2);
const modelId = (args.find((a) => a.startsWith('--model=')) ?? '--model=Xenova/all-MiniLM-L6-v2')
  .replace('--model=', '');

import { pipeline } from '@huggingface/transformers';
import { chunkTranscript } from '../../src/rag/retrieval/chunk';
import { Bm25Index } from '../../src/rag/retrieval/bm25';
import { cosine } from '../../src/rag/retrieval/embedFake';
import { CORPUS_SEGMENTS, GOLDEN_QUERIES, MARKERS } from '../../src/rag/eval/corpus';

const TID = 'eval@1/corpus';

function normalize(v) {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  const n = Math.sqrt(sum) || 1;
  return v.map((x) => x / n);
}

async function main() {
  console.log(`[quality-embed] model: ${modelId}`);
  const extractor = await pipeline('feature-extraction', modelId, { dtype: 'q8' });

  const raw = chunkTranscript(
    TID,
    CORPUS_SEGMENTS.map((s) => ({ start: s.start, end: s.end, text: s.text })),
  );
  const texts = raw.map((c) => c.text);
  const out = await extractor(texts, { pooling: 'mean', normalize: true });
  const d = out.dims[1];
  const vectors = [];
  for (let row = 0; row < out.dims[0]; row++) {
    vectors.push(normalize(Array.from(out.data.slice(row * d, (row + 1) * d))));
  }
  const chunks = raw.map((c, i) => ({ ...c, vector: vectors[i] }));

  // semantic ranking (cosine)
  const goldOf = (topic) => chunks.filter((c) => c.text.includes(MARKERS[topic])).map((c) => c.id);
  const rank = (rankedIds, gold) => {
    const idx = rankedIds.findIndex((id) => gold.includes(id));
    return idx < 0 ? null : idx + 1;
  };

  const semantic = [];
  for (const { topic, query } of GOLDEN_QUERIES) {
    const q = normalize(Array.from((await extractor([query], { pooling: 'mean', normalize: true })).data));
    const ranked = chunks
      .map((c) => ({ id: c.id, score: cosine(Float32Array.from(q), Float32Array.from(c.vector)) }))
      .sort((a, b) => b.score - a.score)
      .map((r) => r.id);
    semantic.push({ topic, ranks: rank(ranked, goldOf(topic)) });
  }

  // lexical ranking (BM25) for comparison
  const bm25 = new Bm25Index();
  for (const c of chunks) bm25.add(c.id, c.text, { stopwords: [] });
  const lexical = GOLDEN_QUERIES.map(({ topic, query }) => ({
    topic,
    ranks: rank(bm25.search(query, { topK: 10 }).map((h) => h.id), goldOf(topic)),
  }));

  const report = (name, rows) => {
    const rs = rows.map((r) => r.ranks);
    const hit1 = rs.filter((r) => r === 1).length / rs.length;
    const hit3 = rs.filter((r) => r !== null && r <= 3).length / rs.length;
    const mrr = rs.reduce((s, r) => s + (r ? 1 / r : 0), 0) / rs.length;
    console.log(`${name}: hit@1=${hit1.toFixed(3)} hit@3=${hit3.toFixed(3)} MRR=${mrr.toFixed(3)}`);
    for (const r of rows) console.log(`  ${r.topic.padEnd(10)} rank=${r.ranks ?? '-'}`);
  };
  console.log(`\nchunks: ${chunks.length} (dim ${d})\n`);
  report('REAL (semantic)', semantic);
  report('lexical (BM25)', lexical);
}

main().catch((err) => {
  console.error('[quality-embed] FAILED:', err.message);
  process.exit(1);
});
