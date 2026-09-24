import { describe, expect, test } from 'vitest';
import {
  createTrack,
  laneAsset,
  mixTracks,
  mixdownReference,
  projectDuration,
  trackEffectiveGain,
  type ProjectState,
  type TrackState,
} from '../../src/engine/project';
import { newProject } from '../../src/engine/projectEditor';

const SR = 44100;

function stereo(n: number, fillL: number, fillR: number): Float32Array[] {
  const l = new Float32Array(n).fill(fillL);
  const r = new Float32Array(n).fill(fillR);
  return [l, r];
}

function mono(n: number, fill: number): Float32Array[] {
  return [new Float32Array(n).fill(fill)];
}

const pcm = new WeakMap<TrackState, Float32Array[]>();

function track(
  channels: Float32Array[],
  opts: Partial<Omit<TrackState, 'channels'>> = {},
): TrackState {
  const t = createTrack(channels, { sampleRate: SR, ...opts });
  pcm.set(t, channels);
  return t;
}

/** Raw channels a test lane was built from (the factory asset is zero-copy). */
function ch(t: TrackState): Float32Array[] {
  return pcm.get(t)!;
}

function proj(tracks: TrackState[], activeTrackId: string | null = null): ProjectState {
  const p = newProject(SR, []);
  for (const t of tracks) {
    p.assets[`asset_${t.id}`] = laneAsset(t.id, ch(t), SR);
    p.tracks.push(t);
  }
  p.activeTrackId = activeTrackId ?? tracks[0]?.id ?? null;
  return p;
}

describe('M8a project core — types/helpers', () => {
  test('createTrack: mono stays mono, stereo stays stereo; ids unique; defaults sane', () => {
    const a = track(mono(8, 0.5), { name: 'A' });
    const b = track(stereo(8, 0.25, -0.25));
    expect(ch(a)).toHaveLength(1);
    expect(ch(b)).toHaveLength(2);
    expect(a.id).not.toBe(b.id);
    expect(a.gain).toBe(1);
    expect(a.pan).toBe(0);
    expect(a.mute).toBe(false);
    expect(a.solo).toBe(false);
    expect(a.name).toBe('A');
  });

  test('trackEffectiveGain: mute → 0; anySolo → only soloed survive; else gain', () => {
    const t = track(stereo(4, 0, 0), { gain: 0.8 });
    expect(trackEffectiveGain(t, false)).toBe(0.8);
    expect(trackEffectiveGain({ ...t, mute: true }, false)).toBe(0);
    expect(trackEffectiveGain(t, true)).toBe(0);
    expect(trackEffectiveGain({ ...t, solo: true }, true)).toBe(0.8);
    expect(trackEffectiveGain({ ...t, mute: true, solo: true }, true)).toBe(0);
  });

  test('projectDuration: max track length; empty project → 0', () => {
    expect(projectDuration(proj([]))).toBe(0);
    const p = proj([
      track(mono(SR, 0)),
      track(stereo(Math.round(SR * 2.5), 0, 0)),
      track(mono(Math.round(SR * 1.5), 0)),
    ]);
    expect(projectDuration(p)).toBeCloseTo(2.5, 6);
  });
});

describe('M8a mixdown kernels — literal anchors', () => {
  test('empty project: mixdown has no channels', () => {
    expect(mixTracks(proj([]))).toHaveLength(0);
  });

  test('one stereo track at unity → bit-equal passthrough (gain 1 is lossless)', () => {
    const ch = stereo(256, 0.25, -0.5);
    const out = mixTracks(proj([track(ch)]));
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual(ch[0]);
    expect(out[1]).toEqual(ch[1]);
  });

  test('two stereo tracks sum in fixed order, bit-equal to the reference', () => {
    const a = track(stereo(128, 0.25, -0.125));
    const b = track(stereo(128, 0.5, 0.125), { gain: 0.5 });
    const out = mixTracks(proj([a, b]));
    const ref = mixdownReference(proj([a, b]));
    expect(out[0]).toEqual(ref[0]);
    expect(out[1]).toEqual(ref[1]);
    // first sample anchor: 0.25·1 + 0.5·0.5 = 0.5 exactly in f32
    expect(out[0]![0]).toBe(0.5);
  });

  test('mono track centered feeds both channels at unity; hard L pan → R exactly 0', () => {
    const m = track(mono(64, 0.5));
    const mid = mixTracks(proj([m]));
    expect(mid).toHaveLength(2);
    expect(mid[0]).toEqual(ch(m)[0]);
    expect(mid[1]).toEqual(ch(m)[0]);

    const left = mixTracks(proj([track(mono(64, 0.5), { pan: -1 })]));
    for (let i = 0; i < 64; ++i) {
      expect(left[1]![i]).toBe(0); // exactly zero
      expect(left[0]![i]).toBe(0.5); // cos(0) = 1 → lossless at hard left
    }
  });

  test('mute contributes exactly 0; solo alone equals mute-others', () => {
    const a = track(stereo(32, 0.5, 0.5));
    const b = track(stereo(32, 0.5, 0.5), { gain: 0.5 });
    const muted = mixTracks(proj([a, track(ch(b), { mute: true })]));
    expect(muted[0]).toEqual(ch(a)[0]);

    const soloed = mixTracks(
      proj([a, track(ch(b), { gain: b.gain, solo: true })]),
    );
    const onlyB = mixTracks(proj([track(ch(a), { mute: true }), b]));
    expect(soloed[0]).toEqual(onlyB[0]);
    expect(soloed[1]).toEqual(onlyB[1]);
  });

  test('length = max track length; short track tail contributes nothing', () => {
    const long = track(stereo(100, 0.25, 0.25));
    const short = track(mono(40, 0.5), { gain: 0.5 });
    const out = mixTracks(proj([long, short]));
    expect(out[0]).toHaveLength(100);
    // tail region (40..100) is the long track alone → bit-equal to it
    for (let i = 40; i < 100; ++i) expect(out[0]![i]).toBe(0.25);
  });

  test('determinism: two runs bit-identical; order matters (a+b vs b+a reference-faithful)', () => {
    const a = track(stereo(64, 0.3, -0.3));
    const b = track(mono(64, 0.7), { gain: 0.4, pan: 0.25 });
    const r1 = mixTracks(proj([a, b]));
    const r2 = mixTracks(proj([a, b]));
    expect(r1[0]).toEqual(r2[0]);
    const swapped = mixTracks(proj([b, a]));
    const refSwapped = mixdownReference(proj([b, a]));
    expect(swapped[0]).toEqual(refSwapped[0]); // swap = different float order, but each is reference-faithful
  });

  test('[profile] 6 tracks × 3 min stereo mix ≤ 500 ms uninstrumented', { timeout: 30_000 }, () => {
    const n = SR * 180;
    const tracks: TrackState[] = [];
    for (let i = 0; i < 6; ++i) {
      tracks.push(track(stereo(n, 0.1, -0.1), { gain: 0.8, pan: i % 2 === 0 ? -0.3 : 0.3 }));
    }
    const t0 = performance.now();
    const out = mixTracks(proj(tracks));
    const dt = performance.now() - t0;
    expect(out[0]).toHaveLength(n);
    // eslint-disable-next-line no-console
    console.log(`[profile] M8a mixTracks 6×3min stereo: ${Math.round(dt)} ms`);
    // §M8a budget 500 ms uninstrumented (≈400 measured); ADR 009 smoke 1.5 s.
    expect(dt).toBeLessThan(1500); // instrumented smoke; budget 400 ms uninstrumented (ADR 009)
  });
});
