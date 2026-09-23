/**
 * Minimal typed event bus — the seam between the imperative engine layer and
 * the UI layer. Engine emits; UI subscribes; UI commands call engine methods.
 */
export type Handler<T> = (value: T) => void;

export class Bus<Events extends object> {
  private map = new Map<keyof Events, Set<Handler<never>>>();

  on<K extends keyof Events>(event: K, handler: Handler<Events[K]>): () => void {
    let set = this.map.get(event);
    if (!set) {
      set = new Set();
      this.map.set(event, set);
    }
    set.add(handler as Handler<never>);
    return () => this.off(event, handler);
  }

  off<K extends keyof Events>(event: K, handler: Handler<Events[K]>): void {
    this.map.get(event)?.delete(handler as Handler<never>);
  }

  emit<K extends keyof Events>(event: K, value: Events[K]): void {
    const set = this.map.get(event);
    if (!set) return;
    for (const handler of set) (handler as Handler<Events[K]>)(value);
  }
}
