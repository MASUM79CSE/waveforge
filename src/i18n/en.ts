/**
 * Message catalog (English). All UI strings live here — components never
 * hardcode copy (ECC style gate). Adding a locale later = adding a file.
 */
import { Brand } from '../brand';
import { ERROR_CODES } from '../core/errors';

export const en = {
  appName: Brand.name,
  appTagline: Brand.tagline,

  // menus
  menuFile: 'File',
  menuEdit: 'Edit',
  menuView: 'View',
  menuHelp: 'Help',

  fileOpen: 'Open File…',
  fileUrl: 'Load From URL…',
  fileSample: 'Load Sample',
  fileExport: 'Export / Download…',
  fileDraftSave: 'Save Draft Locally',
  fileDraftOpen: 'Open Local Drafts…',

  editUndo: 'Undo',
  editRedo: 'Redo',
  editSelectAll: 'Select All',
  editDeselect: 'Deselect All',

  viewZoomIn: 'Zoom In Horiz',
  viewZoomOut: 'Zoom Out Horiz',
  viewZoomReset: 'Reset Zoom',
  viewCenter: 'Center to Cursor',
  viewFollow: 'Follow Cursor',

  helpWelcome: 'Welcome Message',
  helpAbout: 'About',

  // transport
  play: 'Play',
  pause: 'Pause',
  stop: 'Stop',
  toggleLoop: 'Toggle Loop',
  volume: 'Volume',

  // shell
  noAudio: 'No audio loaded',
  emptyStateHint: 'Loading arrives in M1 — the engine is next.',
  statusBar: (version: string) => `M0 shell · v${version}`,

  // welcome
  welcomeTitle: `Welcome to ${Brand.name}`,
  welcomeLead:
    'A free, full-featured audio & waveform editor that runs 100% in your browser — no uploads, no accounts, no tracking.',
  welcomePrivacy: 'Private by design: your audio is processed on your device and never leaves it.',
  welcomeStart: 'Get started',
  welcomeMilestone: 'The audio engine lands in milestone M1 — this shell is the M0 foundation.',

  // about
  aboutTitle: `About ${Brand.name}`,
  aboutBuilt: 'Built with Vite, TypeScript, Preact and the Web Audio API.',
  aboutGovernance: 'Developed under the ECC engineering workflow (TDD, review, security gates).',

  // dialogs
  ok: 'OK',
  close: 'Close',

  // toast helpers
  notYet: (feature: string, milestone: string) => `${feature} — arrives in ${milestone}`,

  // error catalog (Build Plan §6.1) — keys are the ErrorCode values
  errors: {
    'WF-E101': 'This format is not supported by your browser.',
    'WF-E102': 'Could not decode this file — it may be corrupt or unsupported.',
    'WF-E103': 'This file is too large for this device.',
    'WF-E201': 'Could not reach that URL. Check the address and your connection.',
    'WF-E202': 'That server does not allow browser access (CORS).',
    'WF-E301': 'Playback was blocked by the browser — press play again.',
    'WF-E302': 'Enhanced recording is unavailable; using the compatibility path.',
    'WF-E401': 'Local storage is full — manage your drafts.',
    'WF-E402': 'This draft appears to be damaged.',
    'WF-E501': 'A background worker restarted. If problems persist, reload the page.',
    'WF-E601': 'Something went wrong. Your audio is safe — autosave protects it.',
  } as Record<(typeof ERROR_CODES)[number], string>,
} as const;

export type Catalog = typeof en;
