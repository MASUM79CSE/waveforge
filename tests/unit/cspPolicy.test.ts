import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * WF-004 guard (post-deploy defect, E-031): the shipped CSP must contain
 * only recognized directives. Chrome logs "Unrecognized
 * Content-Security-Policy directive" as a console error on EVERY page load
 * for anything else — `worklet-src` shipped in production exactly that way
 * (worklets are governed by `script-src`; there is no `worklet-src`
 * directive). Validates both header sources: vercel.json (production) and
 * the CSP_ENFORCE injection in vite.config.ts (dev/preview mirror).
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Directives valid per the CSP Level 3 spec (+ Report-Only-only ones). */
const VALID = new Set([
  'default-src', 'child-src', 'connect-src', 'font-src', 'frame-src', 'img-src',
  'manifest-src', 'media-src', 'object-src', 'prefetch-src', 'script-src',
  'script-src-attr', 'script-src-elem', 'style-src', 'style-src-attr',
  'style-src-elem', 'worker-src', 'base-uri', 'form-action', 'frame-ancestors',
  'navigate-to', 'report-to', 'report-uri', 'require-trusted-types-for',
  'trusted-types', 'sandbox', 'upgrade-insecure-requests',
  'block-all-mixed-content',
]);

function directivesOf(policy: string): string[] {
  return policy
    .split(';')
    .map((d) => d.trim().split(/\s+/)[0] ?? '')
    .filter(Boolean);
}

describe('shipped CSP contains only recognized directives', () => {
  test('vercel.json enforcing header', () => {
    const vercel = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8')) as {
      headers?: Array<{ headers: Array<{ key: string; value: string }> }>;
    };
    const policies = (vercel.headers ?? [])
      .flatMap((h) => h.headers)
      .filter((h) => /^content-security-policy(-report-only)?$/i.test(h.key))
      .map((h) => h.value);
    expect(policies.length).toBeGreaterThan(0);
    for (const p of policies) {
      const bad = directivesOf(p).filter((d) => !VALID.has(d));
      expect(bad, `unrecognized directives in vercel.json CSP: ${bad.join(', ')}`).toEqual([]);
    }
  });

  test('vite.config.ts CSP_ENFORCE injection', async () => {
    const src = readFileSync(join(ROOT, 'vite.config.ts'), 'utf8');
    const m = src.match(/CSP_ENFORCED\s*=\s*\[([\s\S]*?)\]/);
    expect(m).not.toBeNull();
    const body = m![1] ?? '';
    const directives = (body.match(/"([^"]+)"/g) ?? [])
      .map((s) => (s.slice(1, -1).trim().split(/\s+/)[0] ?? ''))
      .filter((d) => d !== ''); // entries like "default-src 'self'"
    expect(directives.length).toBeGreaterThan(5);
    const bad = directives.filter((d) => !VALID.has(d));
    expect(bad, `unrecognized directives in vite CSP_ENFORCED: ${bad.join(', ')}`).toEqual([]);
  });
});
