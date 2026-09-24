// @vitest-environment jsdom
import { describe, expect, test, beforeEach } from 'vitest';
import {
  channelPans,
  channelVolumes,
  clampChannelVolume,
  clampPan,
} from '../../../src/app/state';
import {
  setChannelPan,
  setChannelVolume,
} from '../../../src/app/editActions';

describe('M-D8: per-channel volume + pan strips', () => {
  beforeEach(() => {
    channelVolumes.value = [1, 1];
    channelPans.value = [0, 0];
  });

  test('clamps: volume 0..1.5, pan -1..1, NaN rescues to defaults', () => {
    expect(clampChannelVolume(2)).toBe(1.5);
    expect(clampChannelVolume(-1)).toBe(0);
    expect(clampChannelVolume(Number.NaN)).toBe(1);
    expect(clampPan(3)).toBe(1);
    expect(clampPan(-3)).toBe(-1);
    expect(clampPan(Number.NaN)).toBe(0);
  });

  test('setChannelVolume/Pan update the per-channel signal slot only', () => {
    setChannelVolume(1, 0.5);
    setChannelPan(0, -0.5);
    expect(channelVolumes.value).toEqual([1, 0.5]);
    expect(channelPans.value).toEqual([-0.5, 0]);
    // clamped through the setter too
    setChannelPan(1, 7);
    expect(channelPans.value).toEqual([-0.5, 1]);
  });
});
