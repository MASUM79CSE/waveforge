/**
 * Icon toolbar definition (D2, design-parity-plan.md).
 *
 * Groups of icon → command bindings, rendered in order. Every `command`
 * MUST exist in the command registry (`app/commands.ts`) — a unit test
 * enforces it, so the toolbar can never drift from the menus. Labels and
 * shortcut hints are NOT duplicated here: they resolve from the registry.
 */
import type { IconName } from './components/icons';

export interface ToolDef {
  icon: IconName;
  command: string;
}

/** AudioMass-style row: edit cluster, quick-fx cluster, zoom cluster. */
export const toolbarDefs: ToolDef[][] = [
  [
    { icon: 'cut', command: 'edit.cut' },
    { icon: 'copy', command: 'edit.copy' },
    { icon: 'paste', command: 'edit.paste' },
    { icon: 'trim', command: 'edit.trim' },
    { icon: 'silence', command: 'edit.silence' },
    { icon: 'delete', command: 'edit.delete' },
  ],
  [
    { icon: 'gain', command: 'fx.gain' },
    { icon: 'fadeIn', command: 'fx.fadeIn' },
    { icon: 'fadeOut', command: 'fx.fadeOut' },
    { icon: 'normalize', command: 'fx.normalize' },
    { icon: 'reverse', command: 'fx.reverse' },
    { icon: 'invert', command: 'fx.invert' },
  ],
  [
    { icon: 'zoomIn', command: 'view.zoomIn' },
    { icon: 'zoomOut', command: 'view.zoomOut' },
    { icon: 'zoomReset', command: 'view.zoomReset' },
  ],
];
