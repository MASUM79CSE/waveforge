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
      'file.export',
      '-',
      'file.draftSave',
      'file.draftOpen',
    ],
  },
  {
    id: 'edit',
    title: () => t().menuEdit,
    items: ['edit.undo', 'edit.redo', '-', 'edit.selectAll', 'edit.deselect'],
  },
  {
    id: 'view',
    title: () => t().menuView,
    items: ['view.zoomIn', 'view.zoomOut', 'view.zoomReset', '-', 'view.center', '-', 'view.follow'],
  },
  {
    id: 'help',
    title: () => t().menuHelp,
    items: ['help.welcome', 'help.about'],
  },
];
