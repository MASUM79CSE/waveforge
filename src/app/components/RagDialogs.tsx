/**
 * Smart RAG dialogs (P1.5) — consent + manage models. This file is LAZY:
 * loaded by RagDialogHost on first open, never part of the entry chunk.
 */
import { useEffect, useState } from 'preact/hooks';
import { locale } from '../../i18n';
import { manageModelsOpen, ragPanelOpen } from '../state';
import {
  consentedDownload,
  getStorage,
  ragConsentOpen,
  ragManageOpen,
  ragPendingModel,
  ragProgress,
  ragState,
} from '../../rag/runtime';
import { Modal } from './Modal';


/**
 * TranscriptPanel (P1.8) — the RAG side panel placeholder. Non-modal
 * (role=complementary), keyboard-closable via the global Escape chain.
 * State copy only; real transcript UI arrives in P2.
 */
/**
 * RAG string table (P1.9) — lives HERE, not in the shared i18n catalogs:
 * the RAG UI is fully lazy, so the entry bundle must never pay for its
 * copy (bundle gate ≤ 2 KB gz growth). Falls back to English.
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
  },
} as const;

type RagKey = keyof typeof RAG_STRINGS.en;

function rt(key: RagKey): string {
  const loc = locale() as keyof typeof RAG_STRINGS;
  return RAG_STRINGS[loc]?.[key] ?? RAG_STRINGS.en[key];
}

function TranscriptPanel() {
  const close = () => (ragPanelOpen.value = false);
  const downloading = ragState.value === 'downloading';
  const ready = ragState.value === 'ready';
  let body;
  if (downloading) {
    body = <p>{rt('ragPanelDownloading')} {Math.round(ragProgress.value * 100)}%</p>;
  } else if (ready) {
    body = <p>{rt('ragPanelReady')}</p>;
  } else {
    body = (
      <>
        <p>{rt('ragPanelNotSetup')}</p>
        <p class="welcome-tips">{rt('ragPanelModelsRequired')}</p>
        <button type="button" class="btn" onClick={() => (manageModelsOpen.value = true)}>
          {rt('ragManageTitle')}
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
