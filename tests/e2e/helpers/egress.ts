/**
 * Network-egress guard (P1.7): records every request a page makes and
 * reports violations — any destination outside the allow-list (self +
 * documented model hosts). Reused by every later RAG phase.
 */
export const EGRESS_ALLOW_HOSTS = [
  'huggingface.co',
  'cdn-lfs.huggingface.co',
  'models.example', // local/e2e mock model host
];

export interface EgressRecord {
  violations(): string[];
  requests(): string[];
  bodiesWithContentSize(): number;
}

export function attachEgressGuard(page: import('@playwright/test').Page): EgressRecord {
  const urls: string[] = [];
  let bodies = 0;
  page.on('request', (req) => {
    urls.push(req.url());
    try {
      const body = req.postDataBuffer();
      if (body && body.byteLength > 0) bodies += 1;
    } catch {
      /* navigation requests have no body */
    }
  });
  return {
    requests: () => urls.slice(),
    bodiesWithContentSize: () => bodies,
    violations: () => {
      const bad: string[] = [];
      for (const u of urls) {
        let host: string;
        try {
          // hostname (no port) — same-origin requests carry :port
          host = new URL(u).hostname;
        } catch {
          continue;
        }
        const local =
          host === 'localhost' ||
          host.startsWith('127.0.0.1') ||
          host.endsWith('.e2b.app') ||
          host === '0.0.0.0';
        const allowed = local || EGRESS_ALLOW_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
        if (!allowed) bad.push(u);
      }
      return bad;
    },
  };
}
