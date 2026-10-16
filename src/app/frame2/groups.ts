/**
 * frame2 group definitions (UX-3.1) — the five IA.md §2 groups with their
 * controls, in default band order. Controls dispatch through the ONE
 * command registry (`data-cmd`) where a command exists; controls without a
 * registry entry (play/pause/stop/seek/loop, beat/snap, add-track/swap)
 * carry their legacy action directly so behavior matches the legacy bars.
 * Legacy `data-testid`s are preserved verbatim (DOM contract); the monitor/
 * record/punch/transport SVG paths are the app's own existing artwork.
 *
 * Toolbar role policy (APG ≥3 controls): transport/edit/tools are roving
 * toolbars; timenap (2 toggles + readout) and meters (sliders) are plain
 * groups — sliders/fields stay outside toolbar roving by design
 * (INTERACTIONS.md §3).
 */
import {
  beatsShown,
  bpmResult,
  channelsSwapped,
  docInfo,
  looping,
  playing,
  recStudio,
  recording,
  selection,
  snapToBeat,
} from '../state';
import { transport } from '../actions';
import { toggleBeatsShown } from '../analysisActions';
import { ensureProject } from '../projectActions';
import { toggleChannelsSwapped } from '../editActions';
import type { IconName } from '../components/icons';
import type { Frame2ToolbarGroup } from './visibility';

export interface GroupControl {
  /** unique roving id (registry id when one exists) */
  id: string;
  /** registry command id → data-cmd; absent = direct action via `run` */
  command?: string;
  /** legacy DOM contract preserved */
  testid?: string;
  icon?: IconName;
  /** our own 24×24 SVG path (legacy bar artwork) */
  svg?: string;
  glyph?: string;
  /** renders aria-pressed; state from command.isChecked() or `pressed` */
  toggle?: boolean;
  pressed?: () => boolean;
  disabled?: () => boolean;
  /** non-interactive readout (rendered as a span) */
  passive?: boolean;
  /** direct action when there is no registry command */
  run?: () => void;
}

export interface Frame2GroupDef {
  group: Frame2ToolbarGroup;
  labelKey: 'tbTransport' | 'tbEdit' | 'tbTools' | 'tbTimenap' | 'tbMeters';
  /** role=toolbar + roving tabindex (requires ≥3 controls) */
  toolbar: boolean;
  /** overflow order within the band — 1 folds LAST */
  priority: number;
  controls: GroupControl[];
}

const noDoc = (): boolean => docInfo.value === null;

export const FRAME2_GROUPS: Frame2GroupDef[] = [
  {
    group: 'transport',
    labelKey: 'tbTransport',
    toolbar: true,
    priority: 1,
    controls: [
      { id: 'transport.play', testid: 'transport-play', svg: 'M8 5l12 7-12 7z', disabled: noDoc, run: () => transport.togglePlay() },
      { id: 'transport.pause', testid: 'transport-pause', svg: 'M7 5h4v14H7zM13 5h4v14h-4z', disabled: () => noDoc() || !playing.value, run: () => transport.pause() },
      { id: 'transport.stop', testid: 'transport-stop', svg: 'M6 6h12v12H6z', disabled: noDoc, run: () => transport.stop() },
      { id: 'transport.seekBack', testid: 'transport-seek-back', svg: 'M11 6v12L2.5 12zM21 6v12l-8.5-6z', disabled: noDoc, run: () => transport.nudge(-5) },
      { id: 'transport.seekFwd', testid: 'transport-seek-fwd', svg: 'M13 6v12l8.5-6zM3 6v12l8.5-6z', disabled: noDoc, run: () => transport.nudge(5) },
      { id: 'transport.loop', svg: 'M17 2l4 4-4 4V7H7a3 3 0 0 0-3 3H2a5 5 0 0 1 5-5h10V2zM7 22l-4-4 4-4v3h10a3 3 0 0 0 3-3h2a5 5 0 0 1-5 5H7v3z', toggle: true, pressed: () => looping.value, disabled: noDoc, run: () => transport.toggleLoop() },
      { id: 'record.toggle', testid: 'record-toggle', svg: 'M12 7a5 5 0 0 1 5 5v3a5 5 0 0 1-10 0v-3a5 5 0 0 1 5-5zM8 21h8', toggle: true, pressed: () => recording.value, command: 'record.toggle' },
      { id: 'record.monitor', testid: 'monitor-toggle', svg: 'M4 14v-2a8 8 0 0 1 16 0v2M4 14a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h1v-6H4zm16 0a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-1v-6h1z', toggle: true, pressed: () => recStudio.value.monitoring, command: 'record.monitor' },
      { id: 'record.punch', testid: 'punch-button', svg: 'M9 4h2v16H9zM14 4h1a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4h-1zM5 6h2v12H5z', disabled: () => recording.value || selection.value === null, command: 'record.punch' },
      { id: 'record.metronome', glyph: '♩', toggle: true, pressed: () => recStudio.value.metronome, command: 'record.metronome' },
    ],
  },
  {
    group: 'edit',
    labelKey: 'tbEdit',
    toolbar: true,
    priority: 1,
    controls: [
      { id: 'edit.undo', glyph: '↶', disabled: noDoc, command: 'edit.undo' },
      { id: 'edit.redo', glyph: '↷', disabled: noDoc, command: 'edit.redo' },
      { id: 'edit.cut', icon: 'cut', disabled: noDoc, command: 'edit.cut' },
      { id: 'edit.copy', icon: 'copy', disabled: noDoc, command: 'edit.copy' },
      { id: 'edit.paste', icon: 'paste', disabled: noDoc, command: 'edit.paste' },
      { id: 'edit.delete', icon: 'delete', disabled: noDoc, command: 'edit.delete' },
      { id: 'edit.trim', icon: 'trim', disabled: noDoc, command: 'edit.trim' },
      { id: 'edit.silence', icon: 'silence', disabled: noDoc, command: 'edit.silence' },
      { id: 'edit.selectAll', glyph: '▣', disabled: noDoc, command: 'edit.selectAll' },
      { id: 'edit.deselect', glyph: '✕', disabled: noDoc, command: 'edit.deselect' },
    ],
  },
  {
    group: 'tools',
    labelKey: 'tbTools',
    toolbar: true,
    priority: 2,
    controls: [
      { id: 'view.zoomIn', icon: 'zoomIn', command: 'view.zoomIn' },
      { id: 'view.zoomOut', icon: 'zoomOut', command: 'view.zoomOut' },
      { id: 'view.zoomReset', icon: 'zoomReset', command: 'view.zoomReset' },
      { id: 'view.center', glyph: '⌖', disabled: noDoc, command: 'view.center' },
      { id: 'view.follow', glyph: '⇥', toggle: true, command: 'view.follow' },
      { id: 'view.zerocross', glyph: 'ø', toggle: true, command: 'view.zerocross' },
      { id: 'view.axis', glyph: '═', toggle: true, command: 'view.axis' },
    ],
  },
  {
    group: 'timenap',
    labelKey: 'tbTimenap',
    toolbar: false, // 2 toggles + readout → plain group per the APG ≥3 rule
    priority: 3,
    controls: [
      { id: 'beatgrid.toggle', glyph: 'BEAT', toggle: true, pressed: () => beatsShown.value, run: () => toggleBeatsShown() },
      { id: 'snap.toggle', glyph: 'SNAP', toggle: true, pressed: () => snapToBeat.value, run: () => { snapToBeat.value = !snapToBeat.value; } },
      { id: 'beat.bpm', passive: true }, // BPM readout (non-interactive)
    ],
  },
  {
    group: 'meters',
    labelKey: 'tbMeters',
    toolbar: false, // sliders — arrow-needing controls stay outside toolbars
    priority: 4,
    controls: [
      { id: 'master.addtrack', glyph: '＋', disabled: noDoc, run: () => void ensureProject() },
      { id: 'master.swap', glyph: '⇄', toggle: true, pressed: () => channelsSwapped.value, run: () => toggleChannelsSwapped() },
    ],
  },
];

/** BPM readout value (passive display inside timenap). */
export function bpmText(): string {
  return bpmResult.value ? bpmResult.value.bpm.toFixed(1) : '-';
}

export const FRAME2_TOOLBAR_ROLE_GROUPS: Frame2ToolbarGroup[] = FRAME2_GROUPS.filter((g) => g.toolbar).map(
  (g) => g.group,
);

export function controlsOf(g: Frame2GroupDef): GroupControl[] {
  return g.controls;
}
