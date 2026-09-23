import { t } from '../i18n';

/** Data-driven menu model → rendered by MenuBar. */
export interface MenuDef {
  id: string;
  title: () => string;
  items: (string | '-')[]; // command ids or separators
}

export const menus: MenuDef[] = [
  {
    id: 'file',
    title: () => t().menuFile,
    items: [
      'file.open',
      'file.url',
      'file.sample',
      '-',
      'file.recordSettings',
      'file.export',
      '-',
      'file.draftSave',
      'file.draftOpen',
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
      'fx.compressor',
      'fx.limiter',
      '-',
      'fx.pgeq',
      'fx.geq10',
      'fx.geq20',
      '-',
      'fx.delay',
      'fx.reverb',
      'fx.distortion',
      '-',
      'fx.gate',
      'fx.rate',
      '-',
      'fx.gain',
      'fx.fadeIn',
      'fx.fadeOut',
      '-',
      'fx.normalize',
      'fx.reverse',
      'fx.invert',
      '-',
      'fx.removeSilence',
    ],
  },
  {
    id: 'analyze',
    title: () => t().menuAnalyze,
    items: [
      'analyze.lufs',
      'analyze.bpm',
      '-',
      'analyze.beats',
      'analyze.panel',
    ],
  },
  {
    id: 'view',
    title: () => t().menuView,
    items: ['view.zoomIn', 'view.zoomOut', 'view.zoomReset', '-', 'view.center', '-', 'view.follow', 'view.zerocross'],
  },
  {
    id: 'help',
    title: () => t().menuHelp,
    items: ['help.welcome', 'help.about'],
  },
];
