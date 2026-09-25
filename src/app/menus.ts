import { t } from '../i18n';

/** Data-driven menu model → rendered by MenuBar. */
export interface MenuDef {
  id: string;
  title: () => string;
  items: MenuItemDef[];
}

/** One dropdown row: a command id, a separator, or a labelled group. */
export type MenuItemDef = string | '-' | { header: () => string; items: string[] };

/**
 * Pure fold: flatten mixed items for the renderer — consecutive group
 * members are wrapped, bare ids/separators pass through untouched.
 */
export interface MenuRow {
  kind: 'command' | 'separator' | 'header';
  id?: string;
  label?: string;
  /** group index a command belongs to (undefined = ungrouped) */
  group?: number;
}

export function foldMenuItems(items: MenuItemDef[], labelOf: (id: string) => string): MenuRow[] {
  const rows: MenuRow[] = [];
  let group = -1;
  for (const item of items) {
    if (item === '-') {
      group = -1;
      rows.push({ kind: 'separator' });
    } else if (typeof item === 'string') {
      rows.push({ kind: 'command', id: item, label: labelOf(item), group: group >= 0 ? group : undefined });
    } else {
      group += 1;
      rows.push({ kind: 'header', label: item.header(), group });
      for (const id of item.items) {
        rows.push({ kind: 'command', id, label: labelOf(id), group });
      }
    }
  }
  return rows;
}

export const menus: MenuDef[] = [
  {
    id: 'file',
    title: () => t().menuFile,
    items: [
      { header: () => t().menuGroupImport, items: ['file.open', 'file.url', 'file.sample'] },
      { header: () => t().menuGroupRecord, items: ['file.recordSettings', 'record.toggle', 'record.punch', 'record.monitor', 'record.metronome'] },
      { header: () => t().menuGroupExport, items: ['file.export'] },
      { header: () => t().menuGroupDrafts, items: ['file.draftSave', 'file.draftOpen'] },
    ],
  },
  {
    id: 'edit',
    title: () => t().menuEdit,
    items: [
      'edit.undo',
      'edit.redo',
      '-',
      'edit.cut',
      'edit.copy',
      'edit.paste',
      'edit.delete',
      '-',
      'clip.split',
      'clip.duplicate',
      'clip.delete',
      '-',
      'edit.trim',
      'edit.silence',
      '-',
      'edit.selectAll',
      'edit.deselect',
    ],
  },
  {
    id: 'effects',
    title: () => t().menuEffects,
    items: [
      'fx.rack',
      '-',
      { header: () => t().fxGroupDynamics, items: ['fx.compressor', 'fx.limiter', 'fx.gate', 'fx.deesser'] },
      { header: () => t().fxGroupNoise, items: ['fx.nr3', 'fx.nrPrint', 'fx.rnvoice'] },
      { header: () => t().fxGroupEq, items: ['fx.pgeq8', 'fx.pgeq', 'fx.geq10', 'fx.geq20'] },
      { header: () => t().fxGroupReverbDelay, items: ['fx.delay', 'fx.reverb', 'fx.reverb2'] },
      { header: () => t().fxGroupModulation, items: ['fx.chorus', 'fx.flanger', 'fx.phaser', 'fx.tremolo', 'fx.vibrato'] },
      { header: () => t().fxGroupDistortion, items: ['fx.distortion'] },
      { header: () => t().fxGroupTimePitch, items: ['fx.rate', 'fx.stretch'] },
      { header: () => t().fxGroupAmplitude, items: ['fx.gain', 'fx.fadeIn', 'fx.fadeOut', 'fx.normalize', 'fx.normalizeLufs'] },
      { header: () => t().fxGroupSpecial, items: ['fx.reverse', 'fx.invert', 'fx.removeSilence'] },
    ],
  },
  {
    id: 'analyze',
    title: () => t().menuAnalyze,
    items: [
      'analyze.lufs',
      'analyze.report',
      'analyze.bpm',
      '-',
      'analyze.beats',
      'analyze.panel',
    ],
  },
  {
    id: 'view',
    title: () => t().menuView,
    items: [
      { header: () => t().menuGroupZoom, items: ['view.zoomIn', 'view.zoomOut', 'view.zoomReset', 'view.center'] },
      { header: () => t().menuGroupCursor, items: ['view.follow', 'view.zerocross', 'view.axis'] },
      { header: () => t().menuGroupAppearance, items: ['view.theme', 'view.accent'] },
    ],
  },
  {
    id: 'help',
    title: () => t().menuHelp,
    items: ['help.welcome', 'help.shortcuts', 'help.about', 'help.doctor'],
  },
];
