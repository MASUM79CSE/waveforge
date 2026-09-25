/**
 * R3 — session takes reducer (docs/recording-plan.md). Pure state over the
 * recording session: each take is appended when its buffer lands; keep
 * marks the good ones; discardLast drops the most recent entry (the buffer
 * commit itself rides the existing undoable lane/doc edit).
 */

export interface TakeEntry {
  id: number;
  name: string;
  seconds: number;
  kept: boolean;
}

export interface TakesState {
  nextId: number;
  takes: TakeEntry[];
}

export function createTakes(): TakesState {
  return { nextId: 1, takes: [] };
}

export function appendTake(state: TakesState, seconds: number): TakesState {
  return {
    nextId: state.nextId + 1,
    takes: [
      ...state.takes,
      { id: state.nextId, name: `Take ${state.nextId}`, seconds, kept: false },
    ],
  };
}

export function keepTake(state: TakesState, id: number): TakesState {
  return {
    ...state,
    takes: state.takes.map((t) => (t.id === id ? { ...t, kept: true } : t)),
  };
}

export function discardLast(state: TakesState): TakesState {
  if (state.takes.length === 0) return state;
  return { ...state, takes: state.takes.slice(0, -1) };
}
