/**
 * PF-05 / AM-12 — `.amss` portable session codec (byte-compatible with
 * the reference session format). Pure IO kernel: no app imports. Layout:
 * magic `01 'A' 'M' 'S' 0`; u16 LE counts (tracks, clips, audio, xfades
 * — each capped at 65534); u16 selected track/clip (65535 = none); f32
 * cursor/marker/px_per_sec/row_h/master_vol; per-track {u8 flags
 * (mute|solo|rec = 1|2|4), f32 vol, f32 pan, f32 height, str name};
 * per-audio {u8 ch, u32 rate (lo/hi u16), u32 len (lo/hi u16), str};
 * per-clip {u16 track, u16 audio, f32 start/in/out/fi/fo, str} (SECONDS
 * domain); u16 xfade index pairs; pad to 4; raw Float32 PCM per asset
 * channel; then 8-byte meta chunks: 'BPM\0'+f32, 'SIG\0'+2 bytes,
 * 'MRK\0'+u32 length + JSON + pad (marker JSON: {id, time, name, …}).
 * `str` = u8-length-prefixed UTF-8, truncated at 255 bytes.
 */

export const AMSS_MIME = 'application/x-audiomass-session';

export interface AmssTrack {
  name: string;
  vol: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  rec: boolean;
}

export interface AmssAsset {
  name: string;
  sampleRate: number;
  channels: Float32Array[];
}

export interface AmssClip {
  track: number;
  audio: number;
  start: number;
  in: number;
  out: number;
  fi: number;
  fo: number;
  name: string;
}

/** Reference marker JSON shape (subset that survives the round-trip). */
export interface AmssMarker {
  id: string;
  time: number;
  name: string;
}

export interface AmssState {
  tracks: AmssTrack[];
  audio: AmssAsset[];
  clips: AmssClip[];
  xfade: Array<[number, number]>;
  selectedTrack: number | null;
  selectedClip: number | null;
  cursor: number;
  marker: number;
  pxPerSec: number;
  rowH: number;
  masterVol: number;
  bpm: number;
  sig: [number, number];
  markers: AmssMarker[];
}

const MAX_COUNT = 65_534; // u16 minus the 65535 "none" sentinel
const NONE = 65_535;
const FLAGS_MUTE = 1;
const FLAGS_SOLO = 2;
const FLAGS_REC = 4;

export function isAmss(buf: ArrayBuffer): boolean {
  if (!buf || buf.byteLength < 4) return false;
  const u = new Uint8Array(buf, 0, 4);
  return u[0]! > 0 && u[1] === 65 && u[2] === 77 && u[3] === 83;
}

function utf8Len(s: string): number {
  return Math.min(255, new TextEncoder().encode(s || '').length);
}

/** `name.amss` (reference nameOf: trim, ensure the extension, default). */
export function amssNameOf(name: string | null | undefined): string {
  const clean = (name || '').trim().replace(/\.(wav|mp3|flac|amss)$/i, '');
  const base = clean || 'waveforge-session';
  return /\.amss$/i.test(base) ? base : `${base}.amss`;
}

export function encodeAmss(st: AmssState): Uint8Array {
  const { tracks, audio, clips, xfade } = st;
  if (tracks.length > MAX_COUNT || clips.length > MAX_COUNT || audio.length > MAX_COUNT || xfade.length > MAX_COUNT) {
    throw new Error(`amss: count exceeds the ${MAX_COUNT} format cap`);
  }
  const enc = new TextEncoder();
  const jsonMarkers = st.markers.length
    ? enc.encode(JSON.stringify(st.markers.map((m) => ({ ...m, color: '#ffcc00', loop: false }))))
    : null;

  // exact size pass
  let size = 5 + 8 + 4 + 20;
  for (const t of tracks) size += 14 + utf8Len(t.name); // flags+3·f32 + len-byte + name
  for (const a of audio) size += 10 + utf8Len(a.name); // ch+2·u32 + len-byte + name
  for (const c of clips) size += 25 + utf8Len(c.name); // 2·u16+5·f32 + len-byte + name
  size += xfade.length * 4; // each pair = 2 × u16
  size = (size + 3) & ~3;
  for (const a of audio) size += a.channels.length * (a.channels[0]?.length ?? 0) * 4;
  size += 8 + 8; // BPM + SIG
  if (jsonMarkers) size += 8 + jsonMarkers.length + ((4 - (jsonMarkers.length & 3)) & 3);

  const buf = new ArrayBuffer(size);
  const dv = new DataView(buf);
  let o = 0;
  const u8 = (n: number): void => {
    dv.setUint8(o, n & 255);
    o += 1;
  };
  const u16 = (n: number): void => {
    dv.setUint16(o, n & 65535, true);
    o += 2;
  };
  const u32 = (n: number): void => {
    dv.setUint32(o, n >>> 0, true);
    o += 4;
  };
  const f32 = (n: number): void => {
    dv.setFloat32(o, n || 0, true);
    o += 4;
  };
  const str = (s: string): void => {
    const b = enc.encode(s || '');
    const l = Math.min(255, b.length);
    u8(l);
    for (let i = 0; i < l; ++i) u8(b[i]!);
  };

  u8(1);
  u8(65);
  u8(77);
  u8(83);
  u8(0);
  u16(tracks.length);
  u16(clips.length);
  u16(audio.length);
  u16(xfade.length);
  u16(st.selectedTrack === null ? NONE : st.selectedTrack);
  u16(st.selectedClip === null ? NONE : st.selectedClip);
  f32(st.cursor);
  f32(st.marker);
  f32(st.pxPerSec);
  f32(st.rowH);
  f32(st.masterVol);
  for (const t of tracks) {
    u8((t.mute ? FLAGS_MUTE : 0) | (t.solo ? FLAGS_SOLO : 0) | (t.rec ? FLAGS_REC : 0));
    f32(t.vol === undefined ? 1 : t.vol);
    f32(t.pan || 0);
    f32(1);
    str(t.name);
  }
  for (const a of audio) {
    u8(a.channels.length);
    u16(a.sampleRate & 65535);
    u16(Math.floor(a.sampleRate / 65536));
    const len = a.channels[0]?.length ?? 0;
    u16(len & 65535);
    u16(Math.floor(len / 65536));
    str(a.name);
  }
  for (const c of clips) {
    u16(c.track);
    u16(c.audio);
    f32(c.start);
    f32(c.in);
    f32(c.out);
    f32(c.fi);
    f32(c.fo);
    str(c.name);
  }
  for (const [a, b] of xfade) {
    u16(a);
    u16(b);
  }
  while (o & 3) u8(0);
  for (const a of audio) {
    for (const ch of a.channels) {
      for (let i = 0; i < ch.length; ++i) f32(ch[i]!);
    }
  }
  // BPM chunk
  u8(66);
  u8(80);
  u8(77);
  u8(0);
  f32(st.bpm > 0 ? st.bpm : 120);
  // SIG chunk
  u8(83);
  u8(73);
  u8(71);
  u8(0);
  u8(st.sig?.[0] || 4);
  u8(st.sig?.[1] || 4);
  u8(0);
  u8(0);
  // MRK chunk
  if (jsonMarkers) {
    u8(77);
    u8(82);
    u8(75);
    u8(0);
    u32(jsonMarkers.length);
    for (const b of jsonMarkers) u8(b);
    while (o & 3) u8(0);
  }
  // exact-length view: over-allocation headroom (if any) is never exposed
  return new Uint8Array(buf, 0, o);
}

export function decodeAmss(buf: ArrayBuffer): AmssState | null {
  if (!isAmss(buf)) return null;
  try {
    const dv = new DataView(buf);
    let o = 4;
    const u8 = (): number => {
      const v = dv.getUint8(o);
      o += 1;
      return v;
    };
    const u16 = (): number => {
      const v = dv.getUint16(o, true);
      o += 2;
      return v;
    };
    const f32 = (): number => {
      const v = dv.getFloat32(o, true);
      o += 4;
      return v;
    };
    const str = (): string => {
      const l = u8();
      const s = new TextDecoder().decode(new Uint8Array(buf, o, l));
      o += l;
      return s;
    };
    const none = (v: number): number | null => (v === NONE ? null : v);

    if (dv.getUint8(0) !== 1) return null;
    u8(); // pad byte
    const nt = u16();
    const nc = u16();
    const na = u16();
    const nx = u16();
    const selT = none(u16());
    const selC = none(u16());
    const st: AmssState = {
      tracks: [],
      audio: [],
      clips: [],
      xfade: [],
      selectedTrack: selT,
      selectedClip: selC,
      cursor: f32(),
      marker: f32(),
      pxPerSec: f32(),
      rowH: f32(),
      masterVol: f32(),
      bpm: 120,
      sig: [4, 4],
      markers: [],
    };
    for (let i = 0; i < nt; ++i) {
      const fl = u8();
      const vol = f32();
      const pan = f32();
      f32(); // row height — view-only in the reference, not WF state
      const name = str();
      st.tracks.push({
        name,
        vol,
        pan,
        mute: !!(fl & FLAGS_MUTE),
        solo: !!(fl & FLAGS_SOLO),
        rec: !!(fl & FLAGS_REC),
      });
    }
    const audioMeta: Array<{ ch: number; rate: number; len: number; name: string }> = [];
    for (let i = 0; i < na; ++i) {
      audioMeta.push({ ch: u8(), rate: u16() + u16() * 65536, len: u16() + u16() * 65536, name: str() });
    }
    const rawClips: AmssClip[] = [];
    for (let i = 0; i < nc; ++i) {
      const track = u16();
      const audio = u16();
      rawClips.push({ track, audio, start: f32(), in: f32(), out: f32(), fi: f32(), fo: f32(), name: str() });
    }
    for (let i = 0; i < nx; ++i) st.xfade.push([u16(), u16()]);

    let need = (o + 3) & ~3;
    for (const a of audioMeta) {
      if (!a.ch || a.ch > 32 || !a.rate || !a.len) return null;
      need += a.ch * a.len * 4;
    }
    if (need > buf.byteLength) return null;

    o = (o + 3) & ~3;
    for (const a of audioMeta) {
      const channels: Float32Array[] = [];
      for (let ch = 0; ch < a.ch; ++ch) {
        channels.push(new Float32Array(buf, o, a.len));
        o += a.len * 4;
      }
      st.audio.push({ name: a.name, sampleRate: a.rate, channels });
    }
    while (buf.byteLength >= o + 8) {
      const mu = new Uint8Array(buf, o, 4);
      if (mu[0] === 66 && mu[1] === 80 && mu[2] === 77 && mu[3] === 0) {
        st.bpm = dv.getFloat32(o + 4, true) || 120;
      } else if (mu[0] === 83 && mu[1] === 73 && mu[2] === 71 && mu[3] === 0) {
        st.sig = [(dv.getUint8(o + 4) || 4) as number, (dv.getUint8(o + 5) || 4) as number];
      } else if (mu[0] === 77 && mu[1] === 82 && mu[2] === 75 && mu[3] === 0) {
        const ml = dv.getUint32(o + 4, true);
        if (ml > 65_536 || o + 8 + ml > buf.byteLength) break;
        try {
          const parsed: unknown = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, o + 8, ml)));
          if (Array.isArray(parsed)) {
            st.markers = parsed.map((m, i) => {
              const rec = m as { id?: unknown; time?: unknown; pos?: unknown; name?: unknown; label?: unknown };
              return {
                id: typeof rec.id === 'string' ? rec.id : `m${i + 1}`,
                time: typeof rec.time === 'number' ? rec.time : typeof rec.pos === 'number' ? rec.pos : 0,
                name: typeof rec.name === 'string' ? rec.name : typeof rec.label === 'string' ? rec.label : '',
              };
            });
          }
        } catch {
          st.markers = [];
        }
        o += 8 + ml;
        o = (o + 3) & ~3;
        continue;
      }
      o += 8;
    }
    for (const rc of rawClips) {
      if (!st.tracks[rc.track] || !st.audio[rc.audio]) return null;
      st.clips.push(rc);
    }
    return st;
  } catch {
    return null;
  }
}
