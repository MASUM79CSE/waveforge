/**
 * GroupSection (UX-3.3) — renders one frame2 toolbar group from its
 * Frame2GroupDef: roving `role=toolbar` for toolbar groups, plain
 * `role=group` otherwise. Tooltips are the registry truth —
 * `Label (Shortcut)` — pulled from the ONE command registry, so the button
 * can never advertise a shortcut that does not exist (finding F-1 rule).
 * Disabled controls stay focusable with aria-disabled (INTERACTIONS.md §3).
 */
import type { JSX } from 'preact';
import { fmtClock } from '../../core/format';
import { t } from '../../i18n';
import { commands, runCommand } from '../commands';
import { cursorPos, docInfo, peakHoldDb, recLevel, recSeconds, recording, armed, clipLatched, countInBeat } from '../state';
import { resetClipLatch } from '../recordActions';
import { Icon } from '../components/icons';
import { RovingToolbar, type RovingApi } from './Toolbar';
import type { OverflowEntry } from './Overflow';
import { bpmText, type Frame2GroupDef, type GroupControl } from './groups';

function commandOf(c: GroupControl) {
  return c.command ? commands.find((cmd) => cmd.id === c.command) : undefined;
}

function tipOf(c: GroupControl): string {
  const cmd = commandOf(c);
  const label = cmd ? cmd.label() : fallbackLabel(c);
  const kbd = cmd?.kbd?.();
  return kbd ? `${label} (${kbd})` : label;
}

function fallbackLabel(c: GroupControl): string {
  switch (c.id) {
    case 'transport.play':
      return `${t().play} (Space)`;
    case 'transport.pause':
      return `${t().pause} (Space)`;
    case 'transport.stop':
      return t().stop;
    case 'transport.seekBack':
      return 'Back 5 s (Shift+←)';
    case 'transport.seekFwd':
      return 'Forward 5 s (Shift+→)';
    case 'transport.loop':
      return `${t().toggleLoop} (L)`;
    case 'beatgrid.toggle':
      return 'Toggle beat markers';
    case 'snap.toggle':
      return 'Snap selection edges to beat markers';
    case 'master.addtrack':
      return t().trackAdd;
    case 'master.swap':
      return t().channelSwap;
    default:
      return c.id;
  }
}

function ControlButton({ c, api }: { c: GroupControl; api?: RovingApi }) {
  const cmd = commandOf(c);
  const tip = tipOf(c);
  const pressed = c.toggle ? (cmd?.isChecked?.() ?? c.pressed?.() ?? false) : undefined;
  const disabled = c.disabled?.() ?? false;
  const attrs = api ? api.attrs(c.id) : { 'data-tb-id': c.id, tabIndex: 0 as const };
  const activate = (): void => {
    if (c.disabled?.()) return;
    if (c.command) runCommand(c.command);
    else c.run?.();
  };
  return (
    <button
      type="button"
      class="f2-btn"
      {...attrs}
      data-cmd={c.command}
      data-testid={c.testid}
      title={tip}
      aria-label={tip}
      aria-pressed={pressed}
      aria-disabled={disabled || undefined}
      onClick={activate}
    >
      {c.icon ? (
        <Icon name={c.icon} />
      ) : c.svg ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d={c.svg} />
        </svg>
      ) : (
        <span aria-hidden="true">{c.glyph}</span>
      )}
    </button>
  );
}

function PassiveControl({ c }: { c: GroupControl }) {
  if (c.id === 'beat.bpm') {
    return (
      <span class="f2-readout" title="Detected tempo (Analyze → BPM)">
        <span class="sel-label">BPM</span>
        <span class="sel-val">{bpmText()}</span>
      </span>
    );
  }
  return null;
}

/** Record cluster indicators — same DOM contract as the legacy Record zone. */
export function RecordIndicators() {
  const meterPct = (db: number): number =>
    Number.isFinite(db) ? Math.max(0, Math.min(100, Math.round(((db + 60) / 60) * 100))) : 0;
  return (
    <>
      {(recording.value || armed.value) && (
        <span class="rec-meter" title={`${Math.round(recLevel.value.peakDb)} dB`}>
          <span class="rec-meter-fill" style={{ width: `${meterPct(recLevel.value.peakDb)}%` }} />
          <span class="rec-meter-hold" style={{ left: `${meterPct(peakHoldDb.value)}%` }} />
          <button
            type="button"
            class={`rec-clip ${clipLatched.value ? 'latched' : ''}`}
            title="Clip — click to reset"
            aria-label="Clip indicator"
            data-testid="clip-led"
            onClick={resetClipLatch}
          />
          {recording.value && <span class="rec-time">{fmtClock(recSeconds.value)}</span>}
        </span>
      )}
      {countInBeat.value > 0 && (
        <span class="count-chip" data-testid="count-in">
          {countInBeat.value}
        </span>
      )}
    </>
  );
}

/** Position readout (Z2 right side) — same data as the legacy Position zone. */
export function PositionReadout() {
  const doc = docInfo.value;
  return (
    <span class="f2-section" data-f2-item="position" data-priority="2" role="group" aria-label="Position">
      <span class="transport-time" title="Cursor / duration">
        <span class="time-cursor">{fmtClock(cursorPos.value)}</span>
        <span class="time-sep">/</span>
        <span class="time-total">{doc ? fmtClock(doc.duration) : '0:00.000'}</span>
      </span>
    </span>
  );
}

export function GroupSection({ def, folded, children }: { def: Frame2GroupDef; folded: boolean; children?: preact.ComponentChildren }) {
  const label = t()[def.labelKey];
  const interactive = def.controls.filter((c) => !c.passive);
  const items = interactive.map((c) => ({ id: c.id, disabled: c.disabled?.() ?? false }));

  const body = (api?: RovingApi): preact.ComponentChildren => (
    <>
      {def.controls.map((c) =>
        c.passive ? <PassiveControl key={c.id} c={c} /> : <ControlButton key={c.id} c={c} api={api} />,
      )}
      {children}
    </>
  );

  return (
    <section
      class={`f2-section ${folded ? 'f2-folded' : ''}`}
      data-f2-item={def.group}
      data-priority={def.priority}
      aria-label={label}
    >
      {def.toolbar ? (
        <RovingToolbar label={label} items={items}>
          {(api) => body(api)}
        </RovingToolbar>
      ) : (
        <div class="f2-group" role="group" aria-label={label}>
          {body()}
        </div>
      )}
    </section>
  );
}

export type { JSX };

/** ⋯-menu entries for folded groups (labels = registry truth via tipOf). */
export function overflowEntriesFor(defs: Frame2GroupDef[]): OverflowEntry[] {
  const out: OverflowEntry[] = [];
  for (const d of defs) {
    for (const c of d.controls) {
      if (c.passive) continue;
      out.push({
        id: `${d.group}:${c.id}`,
        label: tipOf(c),
        action: () => {
          if (c.command) runCommand(c.command);
          else c.run?.();
        },
      });
    }
  }
  return out;
}
