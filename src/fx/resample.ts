/**
 * Varispeed resample kernel (`rate` effect): linear-interpolation resample
 * by a constant factor. factor > 1 shortens (speed up, pitch up);
 * factor < 1 lengthens. factor 1 is bit-exact identity.
 */
export function resample(channels: Float32Array[], factor: number): Float32Array[] {
  const len = channels[0]?.length ?? 0;
  if (len === 0 || factor === 1) return channels.map((ch) => ch.slice());
  const outLen = Math.max(2, Math.round(len / factor));

  return channels.map((ch) => {
    const out = new Float32Array(outLen);
    for (let i = 0; i < outLen; ++i) {
      const pos = i * factor;
      const i0 = Math.min(Math.floor(pos), len - 1);
      const i1 = Math.min(i0 + 1, len - 1);
      const frac = pos - i0;
      out[i] = (ch[i0] ?? 0) * (1 - frac) + (ch[i1] ?? 0) * frac;
    }
    return out;
  });
}
