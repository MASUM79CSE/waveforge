import { z } from 'zod';

/**
 * Force zod's interpreted (jitless) validator path — CSP requirement.
 *
 * zod v4 JIT-compiles object parsers and probes `new Function("")` on
 * first parse to decide whether compilation is possible. Under the
 * enforcing Content-Security-Policy (`script-src 'self'
 * 'wasm-unsafe-eval'`, see vite.config.ts / vercel.json) that probe is
 * blocked as eval: zod catches the refusal and falls back to the
 * interpreted path, but the browser still fires a
 * `securitypolicyviolation` on every load and Lighthouse Best Practices
 * is docked. Configuring jitless skips compilation entirely, so the
 * strict policy stays clean and the CSP is never relaxed.
 *
 * `z.config` is global per copy of zod (per JS realm): every realm that
 * imports zod must import this module FIRST — main.tsx and each worker
 * entry (analysis, mp3Export, wavExport).
 */
z.config({ jitless: true });
