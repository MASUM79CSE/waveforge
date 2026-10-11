declare module '*/check-bundle-size.mjs' {
  export interface SizeVerdict {
    ok: boolean;
    delta: number;
    limit: number;
    overshoot: number;
  }
  export function evaluateSize(
    mainGzipBytes: number,
    baselineBytes: number,
    toleranceBytes: number,
  ): SizeVerdict;
}
