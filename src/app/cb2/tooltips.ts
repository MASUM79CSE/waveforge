/**
 * CB-4.3 — tooltip text is DERIVED from the command registry: label +
 * platform-truthful shortcut. No v2 control hardcodes a hint — the old
 * "(M)" metronome title advertised a shortcut that was never bound
 * (E-CB-018). If a shortcut exists, the registry `kbd()` is its single
 * source; binding decisions belong to Phase 6 ratification.
 */
import { commands } from '../commands';

/** Registry shortcut suffix for a command id — `' (Q)'` or `''`. */
export function kbdOf(cmdId: string): string {
  const kbd = commands.find((c) => c.id === cmdId)?.kbd?.();
  return kbd ? ` (${kbd})` : '';
}

/** Tooltip text for a command button: `"Label"` or `"Label (Shortcut)"`. */
export function cmdTitle(cmdId: string): string {
  const cmd = commands.find((c) => c.id === cmdId);
  if (!cmd) return '';
  return `${cmd.label()}${kbdOf(cmdId)}`;
}
