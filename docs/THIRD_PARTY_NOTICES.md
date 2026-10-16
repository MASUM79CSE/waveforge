# Third-Party Notices

WaveForge builds on the ideas and generosity of the open-source community.
The following attributions cover the runtime dependencies and vendored
runtimes that ship with the app (verified by
`tests/unit/depsHygiene.test.ts` — this file must credit only real
dependencies).

## npm runtime dependencies

| Package | What we take | License | Version shipped |
| --- | --- | --- | --- |
| [@breezystack/lamejs](https://github.com/breezystack/lamejs) | MP3 export encoder (worker) | LGPL-3.0 | 1.2.7 |
| [zod](https://zod.dev) | Schema validation at trust boundaries | MIT | 4.6.5 |
| [preact](https://preactjs.com) | UI runtime | MIT | 10.29.8 |
| [@preact/signals](https://github.com/preactjs/signals) | Reactive state | MIT | 2.11.2 |
| [idb](https://github.com/jakearchibald/idb) | IndexedDB promise wrapper (drafts) | ISC | 8.0.3 |

## Vendored runtimes (files in this repository, not npm packages)

| Upstream project | What we take | License | Where |
| --- | --- | --- | --- |
| [libFLAC](https://xiph.org/flac/) (Xiph.Org) | FLAC export — emscripten build loaded by the classic export worker | Xiph/New BSD, see upstream COPYING | `public/vendor/libflac.min.wasm.js` + `public/workers/libflac.min.wasm.wasm` |
| [RNNoise](https://github.com/xiph/rnnoise) (Xiph/Mozilla, J.-M. Valin) | "AI Voice Clarity" denoise — emscripten build | BSD, licence text shipped alongside | `src/vendor/rnnoise/` (incl. `COPYING`) |

Notes:
- LGPL compliance: the MP3 encoder is a separate library loaded as an
  npm dependency; this notice fulfills the attribution requirement.
  The encoder runs entirely client-side in a Web Worker.
- The vendored builds carry no version markers; they are tracked as
  repository files and any upstream update is a reviewed commit.
