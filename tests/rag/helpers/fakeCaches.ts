/**
 * Byte-store fake Cache API mirroring real semantics: bodies persist as
 * ArrayBuffer and every match() returns a FRESH Response (single-use).
 */
export interface FakeCacheStore {
  match: (key: string | Request) => Promise<Response | undefined>;
  put: (key: string | Request, resp: Response) => Promise<void>;
  delete: (key: string | Request) => Promise<boolean>;
  keys: () => Promise<string[]>;
}

export function fakeCaches() {
  const stores = new Map<string, Map<string, ArrayBuffer>>();
  return {
    async open(name: string): Promise<FakeCacheStore> {
      let m = stores.get(name);
      if (!m) {
        m = new Map();
        stores.set(name, m);
      }
      const store = m;
      return {
        async match(key: string | Request): Promise<Response | undefined> {
          const body = store.get(String(key));
          return body ? new Response(body.slice(0)) : undefined;
        },
        async put(key: string | Request, resp: Response): Promise<void> {
          const body = await resp.arrayBuffer();
          store.set(String(key), body);
        },
        async delete(key: string | Request): Promise<boolean> {
          return store.delete(String(key));
        },
        async keys(): Promise<string[]> {
          return [...store.keys()];
        },
      };
    },
    _stores: stores,
  };
}
