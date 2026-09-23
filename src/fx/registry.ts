/**
 * Effect registry (ADR 005): registration, lookup and param validation.
 * Validation clamps numbers into the spec range and coerces bools — the
 * dialog and the command layer both funnel through `validateParams`, so
 * nothing downstream re-checks.
 */
import type { EffectDef, Params, ParamSpec } from './types';

const registry = new Map<string, EffectDef>();

export function registerEffect(def: EffectDef): void {
  registry.set(def.id, def);
}

export function getEffect(id: string): EffectDef | undefined {
  return registry.get(id);
}

/** Registered effects in menu order (registration order of defs.ts). */
export function listEffects(): EffectDef[] {
  return [...registry.values()];
}

export function defaultParams(def: EffectDef): Params {
  const params: Params = {};
  for (const spec of def.specs) params[spec.key] = spec.default;
  return params;
}

/** Clamp/coerce raw input against the def's specs; unknown keys drop. */
export function validateParams(def: EffectDef, raw: Record<string, unknown>): Params {
  const out: Params = {};
  for (const spec of def.specs) {
    const value = raw[spec.key];
    out[spec.key] = coerceParam(spec, value) ?? spec.default;
  }
  return out;
}

function coerceParam(spec: ParamSpec, value: unknown): number | boolean | null {
  if (value === undefined || value === null) return null;
  if (spec.kind === 'bool') {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') return value.toLowerCase() !== 'false' && value !== '0';
    return null;
  }
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.max(spec.min, Math.min(spec.max, num));
}
