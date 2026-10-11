/**
 * Smart RAG dialogs (P1.5) — consent + manage models. This file is LAZY:
 * loaded by RagDialogHost on first open, never part of the entry chunk.
 */
import { useEffect, useState } from 'preact/hooks';
import { t } from '../../i18n';
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

function ConsentDialog() {
  const entry = ragPendingModel.value;
  if (!entry) return null;
  const total = entry.files.reduce((s, f) => s + f.bytes, 0);
  const mb = (total / 1_048_576).toFixed(1);
  return (
    <Modal title={t().ragConsentTitle} onClose={() => (ragConsentOpen.value = false)}>
      <div class="about">
        <p class="welcome-lead">{entry.id}</p>
        <p>{t().ragConsentLine}</p>
        <p class="welcome-tips">
          {t().ragSizeLabel}: {mb} MB · {t().ragLicenceLabel}: {entry.licence}
        </p>
        <div class="empty-actions">
          <button
            class="btn-primary"
            onClick={() => {
              void consentedDownload();
            }}
          >
            {t().ragConsentDownload}
          </button>
          <button class="btn" onClick={() => (ragConsentOpen.value = false)}>
            {t().ragConsentNotNow}
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
    <Modal title={t().ragManageTitle} onClose={() => (ragManageOpen.value = false)}>
      <div class="about">
        {rows === null ? (
          <p>…</p>
        ) : rows.length === 0 ? (
          <p>{t().ragNoModels}</p>
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
                      {t().ragDelete}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {ragState.value === 'downloading' && <p aria-live="polite">{ragProgress.value}%</p>}
        <button class="btn-primary" onClick={() => (ragManageOpen.value = false)}>
          {t().ragClose}
        </button>
      </div>
    </Modal>
  );
}

export function RagDialogs() {
  return (
    <>
      {ragConsentOpen.value && <ConsentDialog />}
      {ragManageOpen.value && <ManageDialog />}
    </>
  );
}
