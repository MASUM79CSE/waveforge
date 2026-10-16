/**
 * PF-05 / AM-12 — the `.amss` portable session codec. Byte layout is the
 * REFERENCE contract (amss-format.js): magic `01 'A''M''S' 0`, u16 LE
 * counts (capped 65534), str = u8-length-prefixed UTF-8, f32 LE fields,
 * 4-byte alignment before the raw Float32 PCM and between meta chunks
 * (8-byte headers 'BPM\0' f32, 'SIG\0' 2 bytes, 'MRK\0' u32 length +
 * JSON). The hand-assembled vector below mirrors the reference writer
 * byte-for-byte, so decode is proven against the real layout — not
 * against our own encoder's echo.
 */
import { describe, expect, test } from 'vitest';
import { AMSS_MIME, decodeAmss, encodeAmss, isAmss, type AmssState } from '../../src/io/amss';

/** Reference-layout writer for the hand-built interop vector. */
class Ref {
  private readonly dv: DataView;
  private o = 0;
  constructor(len: number) {
    this.dv = new DataView(new ArrayBuffer(len));
  }
  u8(n: number): void {
    this.dv.setUint8(this.o, n & 255);
    this.o += 1;
  }
  u16(n: number): void {
    this.dv.setUint16(this.o, n & 65535, true);
    this.o += 2;
  }
  f32(n: number): void {
    this.dv.setFloat32(this.o, n, true);
    this.o += 4;
  }
  u32(n: number): void {
    this.dv.setUint32(this.o, n, true);
    this.o += 4;
  }
  str(s: string): void {
    const b = new TextEncoder().encode(s);
    this.u8(b.length);
    for (const byte of b) this.u8(byte);
  }
  chunk(tag: string, fn: () => void, pad = true): void {
    const start = this.o;
    this.u8(tag.charCodeAt(0));
    this.u8(tag.charCodeAt(1));
    this.u8(tag.charCodeAt(2));
    this.u8(0);
    fn();
    if (pad) while (this.o & 3) this.u8(0);
    void start;
  }
  pad4(): void {
    while (this.o & 3) this.u8(0);
  }
  f32s(values: number[]): void {
    for (const v of values) this.f32(v);
  }
  get bytes(): ArrayBuffer {
    return this.dv.buffer.slice(0, this.o) as ArrayBuffer; // used region only
  }
  get offset(): number {
    return this.o;
  }
}

function referenceVector(): ArrayBuffer {
  const mrk = JSON.stringify([{ id: 'm1', time: 1.25, name: 'M1', color: '#ffcc00', loop: false }]);
  const mrkBytes = new TextEncoder().encode(mrk).length;
  const w = new Ref(256 + mrkBytes);
  w.u8(1);
  w.u8(65);
  w.u8(77);
  w.u8(83);
  w.u8(0);
  w.u16(1); // tracks
  w.u16(1); // clips
  w.u16(1); // audio
  w.u16(0); // xfades
  w.u16(0); // selected track
  w.u16(65535); // selected clip (none)
  w.f32(0.5); // cursor
  w.f32(0); // marker
  w.f32(100); // px_per_sec
  w.f32(90); // row_h
  w.f32(1); // master vol
  // track: flags 0 (no mute/solo/rec), vol .75, pan -.5, height 1, name 'A'
  w.u8(0);
  w.f32(0.75);
  w.f32(-0.5);
  w.f32(1);
  w.str('A');
  // audio: 1 ch, 44100 Hz, 4 samples, name 'x'
  w.u8(1);
  w.u16(44100);
  w.u16(0);
  w.u16(4);
  w.u16(0);
  w.str('x');
  // clip: track 0, audio 0, start 0, in 0, out 1, fi 0, fo 0, name 'x'
  w.u16(0);
  w.u16(0);
  w.f32(0);
  w.f32(0);
  w.f32(1);
  w.f32(0);
  w.f32(0);
  w.str('x');
  w.pad4(); // align before PCM
  w.f32s([0.1, 0.2, 0.3, 0.4]);
  w.chunk('BPM', () => w.f32(120));
  w.chunk('SIG', () => {
    w.u8(4);
    w.u8(4);
  });
  w.chunk('MRK', () => {
    w.u32(mrkBytes);
    for (const b of new TextEncoder().encode(mrk)) w.u8(b);
  });
  return w.bytes;
}

const SAMPLE: AmssState = {
  tracks: [
    { name: 'Drums', vol: 0.8, pan: -0.5, mute: true, solo: false, rec: false },
    { name: 'Bass', vol: 1, pan: 0.25, mute: false, solo: true, rec: false },
  ],
  audio: [
    { name: 'take1', sampleRate: 44100, channels: [Float32Array.from([0.1, -0.2, 0.3, -0.4])] },
    {
      name: 'take2',
      sampleRate: 48000,
      channels: [Float32Array.from([0.5, 0.5]), Float32Array.from([-0.5, 0.25])],
    },
  ],
  clips: [
    { track: 0, audio: 0, start: 0, in: 0, out: 0.5, fi: 0.01, fo: 0, name: 'take1' },
    { track: 1, audio: 1, start: 0.5, in: 0.125, out: 0.625, fi: 0, fo: 0.02, name: 'take2' },
  ],
  xfade: [[0, 1]],
  selectedTrack: 1,
  selectedClip: null,
  cursor: 1.5,
  marker: 0,
  pxPerSec: 100,
  rowH: 90,
  masterVol: 1,
  bpm: 90,
  sig: [3, 4],
  markers: [{ id: 'm1', time: 0.75, name: 'Drop' }],
};

describe('amss magic', () => {
  test('isAmss accepts the encoded magic and rejects foreign buffers', () => {
    const buf = encodeAmss(SAMPLE).buffer as ArrayBuffer;
    expect(isAmss(buf)).toBe(true);
    expect(isAmss(new TextEncoder().encode('RIFF....WAVE').buffer as ArrayBuffer)).toBe(false);
    expect(isAmss(new ArrayBuffer(3))).toBe(false);
    expect(AMSS_MIME).toBe('application/x-audiomass-session');
  });
});

describe('reference-layout interop', () => {
  test('decode reads a hand-built reference-writer vector exactly', () => {
    const st = decodeAmss(referenceVector());
    expect(st).not.toBeNull();
    expect(st!.tracks).toHaveLength(1);
    expect(st!.tracks[0]).toEqual({
      name: 'A',
      vol: 0.75,
      pan: -0.5,
      mute: false,
      solo: false,
      rec: false,
    });
    expect(st!.audio).toHaveLength(1);
    expect(st!.audio[0]!.sampleRate).toBe(44100);
    expect([...st!.audio[0]!.channels[0]!].map((v) => Number(v.toPrecision(6)))).toEqual([
      0.1, 0.2, 0.3, 0.4,
    ]); // f32 storage — 6 significant digits round back to the literals
    expect(st!.clips).toEqual([
      { track: 0, audio: 0, start: 0, in: 0, out: 1, fi: 0, fo: 0, name: 'x' },
    ]);
    expect(st!.xfade).toEqual([]);
    expect(st!.selectedTrack).toBe(0);
    expect(st!.selectedClip).toBeNull();
    expect(st!.cursor).toBeCloseTo(0.5, 6);
    expect(st!.pxPerSec).toBeCloseTo(100, 4);
    expect(st!.rowH).toBeCloseTo(90, 4);
    expect(st!.masterVol).toBe(1);
    expect(st!.bpm).toBe(120);
    expect(st!.sig).toEqual([4, 4]);
    expect(st!.markers).toEqual([{ id: 'm1', time: 1.25, name: 'M1' }]);
  });

  test('canonical re-encode of the decoded vector is byte-identical', () => {
    const vec = referenceVector();
    const st = decodeAmss(vec);
    expect(st).not.toBeNull();
    const re = encodeAmss(st!);
    expect(new Uint8Array(vec)).toEqual(re);
  });
});

describe('round-trip fidelity', () => {
  test('encode→decode preserves the full state (fades, xfades, markers, sig)', () => {
    const back = decodeAmss(encodeAmss(SAMPLE).buffer as ArrayBuffer);
    expect(back).not.toBeNull();
    expect(back!.tracks.map((x) => ({ ...x, vol: Number(x.vol.toPrecision(6)) }))).toEqual(
      SAMPLE.tracks.map((x) => ({ ...x, vol: Number(x.vol.toPrecision(6)) })),
    ); // f32 storage quantizes vol/pan
    expect(back!.audio.map((a) => ({ name: a.name, sampleRate: a.sampleRate }))).toEqual(
      SAMPLE.audio.map((a) => ({ name: a.name, sampleRate: a.sampleRate })),
    );
    for (const [i, a] of back!.audio.entries()) {
      for (const [c, ch] of a.channels.entries()) {
        expect([...ch].map((v) => Number(v.toPrecision(6)))).toEqual(
          [...SAMPLE.audio[i]!.channels[c]!].map((v) => Number(v.toPrecision(6))),
        );
      }
    }
    expect(
      back!.clips.map((c) => ({
        ...c,
        fi: Number(c.fi.toPrecision(6)),
        fo: Number(c.fo.toPrecision(6)),
      })),
    ).toEqual(
      SAMPLE.clips.map((c) => ({
        ...c,
        fi: Number(c.fi.toPrecision(6)),
        fo: Number(c.fo.toPrecision(6)),
      })),
    );
    expect(back!.xfade).toEqual(SAMPLE.xfade);
    expect(back!.selectedTrack).toBe(1);
    expect(back!.selectedClip).toBeNull();
    expect(back!.cursor).toBeCloseTo(1.5, 6);
    expect(back!.bpm).toBe(90);
    expect(back!.sig).toEqual([3, 4]);
    expect(back!.markers).toEqual(SAMPLE.markers);
  });

  test('long names truncate at 255 bytes (reference str cap), round-trip stable', () => {
    const long = 'x'.repeat(300);
    // keep both tracks so the clip track-references stay valid
    const st: AmssState = { ...SAMPLE, tracks: [{ ...SAMPLE.tracks[0]!, name: long }, SAMPLE.tracks[1]!] };
    const back = decodeAmss(encodeAmss(st).buffer as ArrayBuffer);
    expect(back!.tracks[0]!.name).toHaveLength(255);
  });
});

describe('validation and caps', () => {
  test('wrong version byte or truncated header decodes to null', () => {
    const good = new Uint8Array(encodeAmss(SAMPLE));
    const badVersion = good.slice();
    badVersion[0] = 2;
    expect(decodeAmss(badVersion.buffer)).toBeNull();
    expect(decodeAmss(good.slice(0, 10).buffer)).toBeNull(); // cut mid-header
    expect(decodeAmss(new ArrayBuffer(0))).toBeNull();
  });

  test('audio channel count > 32 or missing PCM decodes to null', () => {
    const bad: AmssState = {
      ...SAMPLE,
      audio: [{ name: 'x', sampleRate: 44100, channels: Array.from({ length: 33 }, () => new Float32Array(4)) }],
    };
    expect(decodeAmss(encodeAmss(bad).buffer as ArrayBuffer)).toBeNull();
    // cutting into the PCM region breaks the need<=length check → null
    const cut = new Uint8Array(encodeAmss(SAMPLE));
    expect(decodeAmss(cut.slice(0, cut.length - 100).buffer)).toBeNull();
    // reference-true: cutting only the MRK tail still decodes (the meta
    // scan breaks; audio and clips are already valid)
    const tail = new Uint8Array(encodeAmss(SAMPLE));
    const still = decodeAmss(tail.slice(0, tail.length - 8).buffer);
    expect(still).not.toBeNull();
    expect(still!.clips).toHaveLength(SAMPLE.clips.length);
  });

  test('encode refuses more than 65534 tracks/clips/audio (reference cap)', () => {
    const many: AmssState = {
      ...SAMPLE,
      tracks: Array.from({ length: 65535 }, () => ({
        name: 't',
        vol: 1,
        pan: 0,
        mute: false,
        solo: false,
        rec: false,
      })),
    };
    expect(() => encodeAmss(many)).toThrow(/65534/);
  });

  test('oversized MRK length stops the scan; the session still decodes', () => {
    const w = new Ref(160);
    w.u8(1);
    w.u8(65);
    w.u8(77);
    w.u8(83);
    w.u8(0);
    w.u16(0);
    w.u16(0);
    w.u16(0);
    w.u16(0);
    w.u16(65535);
    w.u16(65535);
    w.f32(0);
    w.f32(0);
    w.f32(100);
    w.f32(90);
    w.f32(1);
    w.chunk('MRK', () => w.u32(100_000)); // length beyond the buffer
    const st = decodeAmss(w.bytes);
    expect(st).not.toBeNull();
    expect(st!.markers).toEqual([]);
    expect(st!.tracks).toEqual([]);
  });

  test('unknown meta chunks are skipped (reference scans +8)', () => {
    const w = new Ref(128);
    w.u8(1);
    w.u8(65);
    w.u8(77);
    w.u8(83);
    w.u8(0);
    w.u16(0);
    w.u16(0);
    w.u16(0);
    w.u16(0);
    w.u16(65535);
    w.u16(65535);
    w.f32(0);
    w.f32(0);
    w.f32(100);
    w.f32(90);
    w.f32(1);
    // 8-byte unknown chunk (4-byte payload): the reference scan advances
    // +8 per chunk, so exactly-chunk-sized skips stay aligned — a LONGER
    // unknown chunk would desynchronise the scan (reference-true drift;
    // real writers only emit BPM/SIG/MRK)
    w.chunk('ZZZ', () => {
      w.u32(4);
    });
    w.chunk('BPM', () => w.f32(95));
    const st = decodeAmss(w.bytes);
    expect(st).not.toBeNull();
    expect(st!.bpm).toBe(95);
  });
});
