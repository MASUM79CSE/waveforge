/**
 * MAINTAINER TOOL — OPT-IN. NEVER run by CI (it downloads model bytes).
 *
 * Measures the REAL byte size + SHA-256 of each model file URL and
 * prints ready-to-paste ModelEntry JSON for src/rag/models/manifest.ts
 * (the registry stays empty in-tree until a maintainer runs this and
 * appends the measured entry — sizes are never guessed).
 *
 *   node scripts/rag/measure-model.mjs \
 *     --id=Xenova/all-MiniLM-L6-v2 --kind=embed --version=1 \
 *     --licence=Apache-2.0 --min=low \
 *     --url=https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/onnx/model_quantized.onnx
 */
import { createHash } from 'node:crypto';
import { argv, exit } from 'node:process';

const get = (k) => (argv.find((a) => a.startsWith(`--${k}=`)) ?? '').replace(`--${k}=`, '');
const id = get('id');
const kind = get('kind');
const version = get('version');
const licence = get('licence');
const min = get('min') || 'low';
const urls = argv.filter((a) => a.startsWith('--url=')).map((a) => a.replace('--url=', ''));

if (!id || !kind || !version || !licence || urls.length === 0) {
  console.error('usage: node scripts/rag/measure-model.mjs --id=... --kind=asr|embed|llm --version=... --licence=... [--min=low] --url=... [--url=...]');
  exit(1);
}

const files = [];
for (const url of urls) {
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`[measure-model] ${url} → HTTP ${res.status}`);
    exit(1);
  }
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of res.body) {
    hash.update(chunk);
    bytes += chunk.length;
  }
  const path = new URL(url).pathname.split('/').pop() || 'model.onnx';
  files.push({ path, url, bytes, sha256: hash.digest('hex') });
  console.error(`[measure-model] ${path}: ${bytes} bytes`);
}

const entry = {
  id,
  kind,
  version,
  files,
  licence,
  sourceUrl: `https://huggingface.co/${id}`,
  minProfile: min,
};
console.log('\n// append to MODEL_REGISTRY in src/rag/models/manifest.ts:');
console.log(JSON.stringify(entry, null, 2).replace(/"(\w+)":/g, '$1:') + ',');
