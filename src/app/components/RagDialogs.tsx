/**
 * Smart RAG dialogs (P1.5) — consent + manage models. This file is LAZY:
 * loaded by RagDialogHost on first open, never part of the entry chunk.
 */
import { useEffect, useState } from 'preact/hooks';
import { locale } from '../../i18n';
import { cursorPos, manageModelsOpen, ragPanelOpen } from '../state';
import { engine } from '../../app/runtime';
import {
  consentedDownload,
  getStorage,
  loadStoredTranscript,
  ragModelChoices,
  ragTranscript,
  requestModel,
  startTranscription,
  ragConsentOpen,
  ragManageOpen,
  ragPendingModel,
  ragProgress,
  ragState,
} from '../../rag/runtime';
import { Modal } from './Modal';


/**
 * RAG string table (P1.9/P2.8) — lives HERE, not in the shared i18n
 * catalogs: the RAG UI is fully lazy, so the entry bundle must never
 * pay for its copy (bundle gate ≤ 2 KB gz growth). Falls back to English.
 */
const RAG_STRINGS = {
  en: {
    ragConsentTitle: 'Download AI model',
    ragConsentLine: 'Downloads model files only. Your audio and text never leave this device.',
    ragConsentDownload: 'Download',
    ragConsentNotNow: 'Not now',
    ragManageTitle: 'Manage AI models',
    menuGroupRag: 'Transcription',
    ragPanelTitle: 'Transcript',
    ragPanelNotSetup: 'Transcription is not set up yet.',
    ragPanelModelsRequired: 'Speech models are required. They run fully on this device.',
    ragPanelDownloading: 'Downloading model…',
    ragPanelReady: 'Ready. Transcription will run locally on this device.',
    ragNoModels: 'No AI models installed.',
    ragInstalled: 'Installed',
    ragDelete: 'Delete',
    ragClose: 'Close',
    ragSizeLabel: 'Size',
    ragLicenceLabel: 'Licence',
    ragPanelTranscribe: 'Transcribe',
    ragPanelTranscribing: 'Transcribing…',
    ragPanelNoTranscript: 'Run transcription to see the transcript here.',
    ragPanelCopy: 'Copy transcript',
    ragPanelCopied: 'Copied',
  },
  bn: {
    ragConsentTitle: 'এআই মডেল ডাউনলোড',
    ragConsentLine: 'শুধু মডেল ফাইল ডাউনলোড হয়। আপনার অডিও ও লেখা কখনো এই ডিভাইস ছাড়ে না।',
    ragConsentDownload: 'ডাউনলোড',
    ragConsentNotNow: 'এখন নয়',
    ragManageTitle: 'এআই মডেল ব্যবস্থাপনা',
    menuGroupRag: 'ট্রান্সক্রিপশন',
    ragPanelTitle: 'ট্রান্সক্রিপ্ট',
    ragPanelNotSetup: 'ট্রান্সক্রিপশন এখনও সেট আপ করা হয়নি।',
    ragPanelModelsRequired: 'স্পিচ মডেল প্রয়োজন। এগুলো সম্পূর্ণ এই ডিভাইসেই চলে।',
    ragPanelDownloading: 'মডেল ডাউনলোড হচ্ছে…',
    ragPanelReady: 'প্রস্তুত। ট্রান্সক্রিপশন এই ডিভাইসেই চলবে।',
    ragNoModels: 'কোনো এআই মডেল ইনস্টল করা নেই।',
    ragInstalled: 'ইনস্টল করা',
    ragDelete: 'মুছুন',
    ragClose: 'বন্ধ করুন',
    ragSizeLabel: 'আকার',
    ragLicenceLabel: 'লাইসেন্স',
    ragPanelTranscribe: 'ট্রান্সক্রাইব',
    ragPanelTranscribing: 'ট্রান্সক্রাইব হচ্ছে…',
    ragPanelNoTranscript: 'ট্রান্সক্রিপ্ট দেখতে ট্রান্সক্রিপশন চালান।',
    ragPanelCopy: 'ট্রান্সক্রিপ্ট কপি',
    ragPanelCopied: 'কপি হয়েছে',
  },
} as const;

type RagKey = keyof typeof RAG_STRINGS.en;

function rt(key: RagKey): string {
  const loc = locale() as keyof typeof RAG_STRINGS;
  return RAG_STRINGS[loc]?.[key] ?? RAG_STRINGS.en[key];
}

/**
 * TranscriptPanel (P2.8) — live side panel: transcribe CTA (reusing the
 * consent flow when the model is missing), progress, and the segment
 * list with click-to-seek + active highlight. Segment text renders as
 * TEXT NODES ONLY (transcripts are untrusted data — never HTML).
 * Keyboard: segments are real buttons (Enter seeks); Escape closes the
 * panel via the global chain.
 */
function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

function TranscriptPanel() {
  const close = () => (ragPanelOpen.value = false);
  const state = ragState.value;
  const transcript = ragTranscript.value;
  const models = ragModelChoices();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const cur = cursorPos.value;

  useEffect(() => {
    const m = models[0];
    if (m) void loadStoredTranscript(m.id);
  }, []);

  const onTranscribe = () => {
    const m = models[0];
    if (!m) {
      manageModelsOpen.value = true;
      return;
    }
    setError(null);
    void getStorage()
      .has(m.id)
      .then((installed): Promise<unknown> =>
        installed ? startTranscription(m.id) : requestModel(m.id).then(() => undefined),
      )
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  };

  const onCopy = () => {
    if (!transcript) return;
    const text = transcript.segments
      .map((s) => `${fmtTime(s.start)} - ${fmtTime(s.end)}\t${s.text}`)
      .join('\n');
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => setError('clipboard unavailable'));
  };

  let body;
  if (state === 'downloading') {
    body = <p>{rt('ragPanelDownloading')} {Math.round(ragProgress.value * 100)}%</p>;
  } else if (state === 'transcribing') {
    body = (
      <>
        <p>{rt('ragPanelTranscribing')} {Math.round(ragProgress.value * 100)}%</p>
        <div class="panel-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ragProgress.value * 100)} style={{ '--pct': String(ragProgress.value * 100) } as never} />
      </>
    );
  } else if (transcript && transcript.segments.length > 0) {
    body = (
      <>
        <ul class="segment-list">
          {transcript.segments.map((s) => (
            <li key={`${s.start}`}>
              <button
                type="button"
                class={s.start <= cur && cur < s.end ? 'segment active' : 'segment'}
                aria-label={`${fmtTime(s.start)}`}
                onClick={() => engine.seek(s.start)}
              >
                <span class="seg-time">{fmtTime(s.start)}</span>
                <span class="seg-text">{s.text}</span>
              </button>
            </li>
          ))}
        </ul>
        <button type="button" class="btn" onClick={onCopy}>
          {copied ? rt('ragPanelCopied') : rt('ragPanelCopy')}
        </button>
      </>
    );
  } else if (models.length === 0) {
    body = (
      <>
        <p>{rt('ragPanelNotSetup')}</p>
        <p class="welcome-tips">{rt('ragPanelModelsRequired')}</p>
        <button type="button" class="btn" onClick={() => (manageModelsOpen.value = true)}>
          {rt('ragManageTitle')}
        </button>
      </>
    );
  } else {
    body = (
      <>
        <p>{rt('ragPanelNoTranscript')}</p>
        <button type="button" class="btn" onClick={onTranscribe}>
          {rt('ragPanelTranscribe')}
        </button>
      </>
    );
  }
  return (
    <aside class="transcript-panel" role="complementary" aria-label={rt('ragPanelTitle')}>
      <div class="panel-head">
        <strong>{rt('ragPanelTitle')}</strong>
        <button type="button" class="icon-btn" aria-label={rt('ragClose')} onClick={close}>
          ✕
        </button>
      </div>
      {error !== null && (
        <p class="panel-error" role="alert">
          {error}
        </p>
      )}
      {body}
    </aside>
  );
}

function ConsentDialog() {
  const entry = ragPendingModel.value;
  if (!entry) return null;
  const total = entry.files.reduce((s, f) => s + f.bytes, 0);
  const mb = (total / 1_048_576).toFixed(1);
  return (
    <Modal title={rt('ragConsentTitle')} onClose={() => (ragConsentOpen.value = false)}>
      <div class="about">
        <p class="welcome-lead">{entry.id}</p>
        <p>{rt('ragConsentLine')}</p>
        <p class="welcome-tips">
          {rt('ragSizeLabel')}: {mb} MB · {rt('ragLicenceLabel')}: {entry.licence}
        </p>
        <div class="empty-actions">
          <button
            class="btn-primary"
            onClick={() => {
              void consentedDownload();
            }}
          >
            {rt('ragConsentDownload')}
          </button>
          <button class="btn" onClick={() => (ragConsentOpen.value = false)}>
            {rt('ragConsentNotNow')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ManageDialog() {
  const [rows, setRows] = useState<Array<{ id: string; version: string; bytes: number }>>(null!);
  useEffect(() => {
    void getStorage()
      .listInstalled()
      .then(setRows);
  }, []);
  return (
    <Modal title={rt('ragManageTitle')} onClose={() => (ragManageOpen.value = false)}>
      <div class="about">
        {rows === null ? (
          <p>…</p>
        ) : rows.length === 0 ? (
          <p>{rt('ragNoModels')}</p>
        ) : (
          <table>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.id}</td>
                  <td>{r.version}</td>
                  <td>{(r.bytes / 1_048_576).toFixed(1)} MB</td>
                  <td>
                    <button
                      class="btn"
                      onClick={() => {
                        void getStorage().delete(r.id).then(() => {
                          void getStorage()
                            .listInstalled()
                            .then(setRows);
                        });
                      }}
                    >
                      {rt('ragDelete')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {ragState.value === 'downloading' && <p aria-live="polite">{ragProgress.value}%</p>}
        <button class="btn-primary" onClick={() => (ragManageOpen.value = false)}>
          {rt('ragClose')}
        </button>
      </div>
    </Modal>
  );
}

export function RagDialogs() {
  return (
    <>
      {ragPanelOpen.value && <TranscriptPanel />}
      {ragConsentOpen.value && <ConsentDialog />}
      {ragManageOpen.value && <ManageDialog />}
    </>
  );
}
