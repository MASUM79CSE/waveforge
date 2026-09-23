import { clamp, clampSpp } from '../core/zoom';

/**
 * View math — pure functions for zoom/pan/coordinate mapping (ADR 001).
 * The renderer holds a ViewState and delegates all math here so it is
 * unit-testable without a canvas.
 */
export interface ViewState {
  /** samples per pixel (> 1 = zoomed out, < 1 = sample-level zoom) */
  spp: number;
  /** seconds visible at the left edge */
  start: number;
}

export interface ViewEnv {
  cssW: number;
  duration: number;
  sampleRate: number;
}

export function viewDuration(view: ViewState, env: ViewEnv): number {
  return (env.cssW * view.spp) / env.sampleRate;
}

export function timeAtX(view: ViewState, env: ViewEnv, x: number): number {
  return view.start + (x * view.spp) / env.sampleRate;
}

export function xAtTime(view: ViewState, env: ViewEnv, t: number): number {
  return ((t - view.start) * env.sampleRate) / view.spp;
}

export function maxStart(env: ViewEnv, spp: number): number {
  return Math.max(0, env.duration - viewDuration({ spp, start: 0 }, env));
}

export function fitView(env: ViewEnv): ViewState {
  if (env.cssW <= 0 || env.duration <= 0) return { spp: 1024, start: 0 };
  return { spp: clampSpp((env.duration * env.sampleRate) / env.cssW), start: 0 };
}

/** Zoom by `factor` keeping the time under `centerRatio` of the viewport anchored. */
export function zoomAt(view: ViewState, env: ViewEnv, factor: number, centerRatio: number): ViewState {
  if (env.cssW <= 0) return view;
  const centerT = timeAtX(view, env, centerRatio * env.cssW);
  const spp = clampSpp(view.spp / factor);
  const start = clamp(centerT - (centerRatio * env.cssW * spp) / env.sampleRate, 0, maxStart(env, spp));
  return { spp, start };
}

export function setStart(view: ViewState, env: ViewEnv, t: number): ViewState {
  return { spp: view.spp, start: clamp(t, 0, maxStart(env, view.spp)) };
}

/** Jump the view so `t` is visible, leading by `leadRatio` when scrolling. */
export function ensureVisible(view: ViewState, env: ViewEnv, t: number, leadRatio = 0.1): ViewState {
  const dur = viewDuration(view, env);
  const end = view.start + dur;
  if (t >= view.start && t <= end - dur * 0.02) return view;
  return setStart(view, env, t - dur * leadRatio);
}
