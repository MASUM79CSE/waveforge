/**
 * Effect definition types (ADR 005). Definitions are UI-free and registry-
 * driven: one generic dialog renders params; apply + preview share the same
 * definition. Kernels are pure (unit tested); graph builders take the audio
 * context as a parameter (construction-tested with a recording fake).
 */

export type ParamKind = 'number' | 'bool';

export interface ParamSpec {
  key: string;
  /** i18n key for the parameter label. */
  labelKey: string;
  kind: ParamKind;
  /** number params: inclusive UI range + step (also the validation clamp). */
  min: number;
  max: number;
  step: number;
  default: number | boolean;
}

export type Params = Record<string, number | boolean>;

/** Optional side-channel for effects that carry bulk data (imported IRs). */
export interface EffectRunContext {
  irChannels?: Float32Array[];
  irSampleRate?: number;
  /** Learned noise print for fx.nrPrint (E6a), |N̂(k)| in linear magnitude. */
  noisePrint?: Float32Array;
  /** A6b: per-param automation curves (region-relative sample domain),
   * keyed by the effect's flat param keys (e.g. `b0Freq`). */
  paramCurves?: Record<string, import('../engine/automation').AutomationCurve>;
}

export interface KernelEffectDef {
  id: string;
  labelKey: string;
  kind: 'kernel';
  specs: ParamSpec[];
  /** Pure sample DSP: region channels in, region channels out. */
  process: (
    channels: Float32Array[],
    sampleRate: number,
    params: Params,
    ctx?: EffectRunContext,
  ) => Float32Array[];
  /**
   * Wet-tail seconds the pipeline must append after the region
   * (post-region context where it exists, zeros past doc end) so pure
   * kernels can produce tails exactly like graph tailSeconds (E4 §0).
   */
  tail?: (params: Params, ctx?: EffectRunContext) => number;
}

export interface GraphEffectDef {
  id: string;
  labelKey: string;
  kind: 'graph';
  specs: ParamSpec[];
  /** id resolved by graphs.buildGraph(ctx, graphId, params, opts). */
  graphId: string;
  /** Extra seconds the wet signal rings past the region (delay repeats, IR). */
  tailSeconds?: (params: Params) => number;
}

export type EffectDef = KernelEffectDef | GraphEffectDef;

export interface GraphOpts {
  /** Channel count of the material being processed (sizes the reverb IR). */
  channels: number;
}
