/**
 * Network-egress guard (WF-011, audit): records every request a page
 * makes and reports violations — any destination that is not the app's
 * own origin (localhost/127.0.0.1 in tests). WaveForge is fully local:
 * audio, projects and transcripts never touch the network, and there is
 * no third-party origin of any kind.
 */
export interface EgressRecord {
  requests(): string[];
  /** URLs outside the app origin (empty = pass). */
  violations(): string[];
  /** Requests that carried a non-empty body (empty = pass). */
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
      /* some requests expose no body */
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
          host = new URL(u).hostname;
        } catch {
          continue;
        }
        const local =
          host === 'localhost' ||
          host.startsWith('127.0.0.1') ||
          host === '0.0.0.0';
        if (!local) bad.push(u);
      }
      return bad;
    },
  };
}
