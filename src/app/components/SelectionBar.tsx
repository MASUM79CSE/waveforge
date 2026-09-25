/**
 * Selection readout group (D3) — reference parity: Start / End / Duration
 * with a Clear button wired to `edit.deselect` (Q). Dashes when empty.
 */
import { runCommand } from '../commands';
import { selection } from '../state';
import { fmtClock } from '../../core/format';

function fmt(t: number): string {
  return fmtClock(t);
}

export function SelectionBar() {
  const sel = selection.value;
  const has = sel !== null;
  const dur = has ? Math.max(0, sel.end - sel.start) : 0;
  return (
    <div class="toolbar-group selgroup" role="group" aria-label="Selection">
      <span class="sel-cell">
        <span class="sel-label">Start:</span>
        <span class="sel-val">{has ? fmt(sel.start) : '-'}</span>
      </span>
      <span class="sel-cell">
        <span class="sel-label">End:</span>
        <span class="sel-val">{has ? fmt(sel.end) : '-'}</span>
      </span>
      <span class="sel-cell">
        <span class="sel-label">Duration:</span>
        <span class="sel-val">{has ? fmt(dur) : '-'}</span>
      </span>
      <button
        class="sel-clear"
        title="Clear Selection (Q)"
        aria-label="Clear Selection (Q)"
        disabled={!has}
        onClick={() => runCommand('edit.deselect')}
      >
        ✕
      </button>
    </div>
  );
}
