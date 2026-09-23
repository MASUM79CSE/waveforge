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
  menuEffects: 'Effects',

  // edit ops (M2)
  editCut: 'Cut',
  editCopy: 'Copy',
  editPaste: 'Paste',
  editDelete: 'Delete Selection',
  editTrim: 'Trim to Selection',
  editInsertSilence: 'Insert Silence (1s)',
  fxGain: 'Gain…',
  fxFadeIn: 'Fade In',
  fxFadeOut: 'Fade Out',
  fxNormalize: 'Normalize…',
  fxReverse: 'Reverse',
  fxInvert: 'Invert',
  fxRemoveSilence: 'Remove Silence',
  channelLeft: 'Left',
  channelRight: 'Right',
  channelSwap: 'Swap channels',
  zeroCrossSnap: 'Zero-Cross Selection',

  // edit toasts + errors
  opCut: 'Cut',
  opCopy: 'Copy',
  opPaste: 'Paste',
  opDelete: 'Delete',
  opTrim: 'Trim',
  opSilence: 'Insert Silence',
  opGain: 'Gain',
  opFadeIn: 'Fade In',
  opFadeOut: 'Fade Out',
  opNormalize: 'Normalize',
  opReverse: 'Reverse',
  opInvert: 'Invert',
  opRemoveSilence: 'Remove Silence',
  undid: 'Undid:',
  redid: 'Redid:',
  editFailed: 'The edit could not be applied — your audio is unchanged.',
  needsSelection: 'Make a selection first (drag on the waveform).',
  nothingToPaste: 'Clipboard is empty — copy or cut something first.',
  pasteRateMismatch: 'Clipboard sample rate does not match this document.',
  copied: 'Copied to clipboard.',
  alreadyNormalized: 'Selection is already at its peak — nothing to change.',
  noSilenceFound: 'No silence found at the current threshold.',

  // prompt dialogs
  gainTitle: 'Gain',
  gainLabel: 'Amount (dB):',
  normalizeTitle: 'Normalize',
  normalizeLabel: 'Target peak (dBFS):',
  apply: 'Apply',

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

  // url dialog
  urlTitle: 'Load From URL',
  urlHint: 'The file must be served over https and allow cross-origin access (CORS).',
  urlPlaceholder: 'https://example.com/song.mp3',
  urlLoad: 'Load',
  urlCancel: 'Cancel',

  // canvas / empty state
  dropHint: 'Drag & drop an audio file here',
  quickOpen: 'Open file',
  quickSample: 'Load sample',

  // loading + toasts
  loadingFile: (name: string) => `Decoding ${name}…`,
  loadingUrl: 'Downloading…',
  loadingSample: 'Loading sample…',
  toastLoaded: (name: string) => `Loaded ${name}`,
  loopOn: 'Loop on',
  loopOff: 'Loop off',

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
