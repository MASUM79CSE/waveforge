/**
 * Autosave ring controller (M6, ADR 008 D3, plan §6.3.2): a debounced
 * snapshot that fires 30 s after the last edit OR every AUTOSAVE_OPS edit
 * operations (1 s micro-debounce collapses bursts). Persistence and the
 * enabled-check are injected/called at fire time, so the controller is
 * testable with fake timers; a failed write never reaches the edit path.
 */
import { isAutosaveEnabled } from './settings';

export const AUTOSAVE_DEBOUNCE_MS = 30_000;
export const AUTOSAVE_MICRO_DEBOUNCE_MS = 1_000;
export const AUTOSAVE_OPS = 8;

export interface AutosaveSink {
  write: () => Promise<void>;
  clear: () => Promise<void>;
  read: () => Promise<Uint8Array | null>;
}

export class AutosaveController {
  private ops = 0;
  private microTimer: ReturnType<typeof setTimeout> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly sink: AutosaveSink) {}

  /** Call after every committed edit operation. */
  notifyEdit(): void {
    if (!isAutosaveEnabled()) return;
    this.ops += 1;
    if (this.ops >= AUTOSAVE_OPS) {
      this.ops = 0;
      this.schedule(this.microTimer, AUTOSAVE_MICRO_DEBOUNCE_MS, 'micro');
    }
    this.schedule(this.debounceTimer, AUTOSAVE_DEBOUNCE_MS, 'debounce');
  }

  /** Latest snapshot payload, or null when the ring is empty. */
  readLatest(): Promise<Uint8Array | null> {
    return this.sink.read();
  }

  /** User declined crash recovery — drop the ring record. */
  async discard(): Promise<void> {
    this.clearTimers();
    await this.sink.clear();
  }

  /** Stop all timers (page hide / document close). */
  stop(): void {
    this.clearTimers();
  }

  private schedule(existing: ReturnType<typeof setTimeout> | null, ms: number, which: 'micro' | 'debounce'): void {
    if (existing !== null) clearTimeout(existing);
    const timer = setTimeout(() => {
      if (which === 'micro') this.microTimer = null;
      else this.debounceTimer = null;
      this.fire();
    }, ms);
    if (which === 'micro') this.microTimer = timer;
    else this.debounceTimer = timer;
  }

  private clearTimers(): void {
    if (this.microTimer !== null) clearTimeout(this.microTimer);
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);
    this.microTimer = null;
    this.debounceTimer = null;
    this.ops = 0;
  }

  private fire(): void {
    this.ops = 0;
    this.sink
      .write()
      .catch(() => {
        /* quota/IDB failures surface through the quota guard, not the edit path */
      });
  }
}
