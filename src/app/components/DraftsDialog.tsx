/**
 * Drafts manager (M6): list saved drafts with open/rename/delete, storage
 * usage footer, and busy state. Corrupt rows stay listed — opening one
 * surfaces WF-E402 as a toast while delete remains available (§6.3).
 */
import { useState } from 'preact/hooks';
import type { JSX } from 'preact';
import {
  closeDraftsDialog,
  deleteDraft,
  openDraft,
  renameDraft,
} from '../actions';
import { t } from '../../i18n';
import * as S from '../state';
import { Modal } from './Modal';

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtWhen(stamp: number): string {
  return new Date(stamp).toLocaleString();
}

function DraftRow({ row }: { row: S.DraftRow }): JSX.Element {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(row.name);

  return (
    <li class="draft-row" data-testid={`draft-${row.name}`}>
      {renaming ? (
        <form
          class="draft-rename"
          onSubmit={(e) => {
            e.preventDefault();
            setRenaming(false);
            void renameDraft(row.id, name);
          }}
        >
          <input
            class="fx-num"
            value={name}
            onChange={(e) => setName((e.target as HTMLInputElement).value)}
            aria-label={t().draftNameLabel}
          />
          <button type="submit" class="btn-secondary">
            OK
          </button>
        </form>
      ) : (
        <>
          <span class="draft-name">{row.name}</span>
          <span class="draft-meta">
            {fmtWhen(row.updatedAt)} · {row.duration.toFixed(2)} s ·{' '}
            {fmtBytes(row.sizeBytes)}
            {row.compressed ? ' · gz' : ''}
          </span>
          <span class="draft-actions">
            <button
              type="button"
              class="btn-secondary"
              disabled={S.draftsBusy.value}
              onClick={() => void openDraft(row.id)}
            >
              {t().draftOpen}
            </button>
            <button
              type="button"
              class="btn-secondary"
              onClick={() => setRenaming(true)}
            >
              {t().draftRename}
            </button>
            <button
              type="button"
              class="btn-secondary draft-delete"
              onClick={() => void deleteDraft(row.id)}
            >
              {t().draftDelete}
            </button>
          </span>
        </>
      )}
    </li>
  );
}

export function DraftsDialog(): JSX.Element | null {
  if (!S.draftsOpen.value) return null;
  const rows = S.draftsList.value;
  const usage = S.draftsUsage.value;
  const pct = usage && usage.quota > 0 ? Math.round((usage.usage / usage.quota) * 100) : null;

  return (
    <Modal title={t().draftsTitle} onClose={closeDraftsDialog}>
      <div class="fx-dialog drafts-dialog" data-testid="drafts-dialog">
        {rows.length === 0 && <p class="drafts-empty">{t().draftsEmpty}</p>}
        <ul class="draft-list">
          {rows.map((row) => (
            <DraftRow key={row.id} row={row} />
          ))}
        </ul>
        {pct !== null && (
          <p class="drafts-usage" data-testid="storage-usage">
            {t().draftsUsagePct(pct)}
          </p>
        )}
      </div>
    </Modal>
  );
}
