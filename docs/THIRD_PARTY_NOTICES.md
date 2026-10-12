# Third-Party Notices

WaveForge builds on the ideas and generosity of the open-source community.
The following attributions are required by the respective licenses.

| Project | What we take | License | Since |
| --- | --- | --- | --- |
| [@breezystack/lamejs](https://github.com/breezystack/lamejs) / LAME | MP3 export worker | LGPL-2.0 | M4 |
| [libflacjs](https://github.com/mmig/libflac.js) / libFLAC | FLAC export worker (vendored WASM) | Xiph.New / LGPL | M4 |
| [RNNoise](https://github.com/xiph/rnnoise) — vendored WASM build of the @echogarden/rnnoise-wasm package at `src/vendor/rnnoise/` (licence file in-tree: `src/vendor/rnnoise/COPYING`) | "AI Voice Clarity" denoise (WASM) | BSD-3-Clause | E7b |
| [@huggingface/transformers](https://github.com/huggingface/transformers.js) | On-device ML runtimes (ASR + embeddings + optional local LLM), worker chunks only; model files load exclusively from user-consented local storage | Apache-2.0 | Smart RAG v2 (P2/P3/P4) |
| [zod](https://github.com/colinhacks/zod) | Schema validation at protocol/plan boundaries | MIT | M11, extended in Smart RAG v2 |
| [preact](https://preactjs.com) / [@preact/signals](https://github.com/preactjs/signals) | UI runtime + reactive signals (shipped since v1) | MIT | v1 |
| [idb](https://github.com/jakearchibald/idb) | IndexedDB promise wrapper for transcript/index stores | ISC | Smart RAG v2 (P2/P3) |

Smart RAG v2 downloads model files ONLY from the hosts documented in the
model registry (`src/rag/models/manifest.ts`), only after the user
explicitly consents in-app, and stores them in the browser's Cache
Storage. Audio, transcripts, embeddings, and queries never leave the
device. CI never downloads ML models (deterministic fakes).

Update this file whenever a new third-party dependency is adopted
(see `docs/adr/000` — dependency governance).
