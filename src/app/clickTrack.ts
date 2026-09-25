/**
 * R2 — metronome browser glue: schedules pure ClickEvents on the shared
 * AudioContext (oscillator + short gain envelope — click-free). Pure math
 * lives in engine/metronome; this module only turns events into nodes.
 */
import { getSharedContext } from '../io/decode';
import type { ClickEvent } from '../engine/metronome';

/** Schedule clicks at absolute context times; returns the last end time. */
export function scheduleClicks(clicks: ClickEvent[], baseTime: number, volume: number): number {
  const ctx = getSharedContext();
  let end = baseTime;
  for (const click of clicks) {
    const at = Math.max(ctx.currentTime, baseTime + click.atSec);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = click.freq;
    const peak = Math.max(0, Math.min(1, volume)) * click.gain;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(peak, at + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.08);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
    end = Math.max(end, at + 0.08);
  }
  return end;
}
