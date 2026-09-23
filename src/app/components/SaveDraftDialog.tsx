/**
 * Save-draft name prompt (M6): one text field, defaulting to the document
 * name; confirm hands off to confirmSaveDraft (quota-guarded).
 */
import { useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { closeSaveDraftDialog, confirmSaveDraft } from '../actions';
import { getDoc } from '../runtime';
import { t } from '../../i18n';
import * as S from '../state';
import { Modal } from './Modal';

export function SaveDraftDialog(): JSX.Element | null {
  if (!S.draftSaveOpen.value) return null;
  return <SaveDraftForm />;
}

function SaveDraftForm(): JSX.Element {
  const doc = getDoc();
  const base = (doc?.meta.name ?? 'untitled').replace(/\.[a-z0-9]+$/i, '');
  const [name, setName] = useState(base);

  const confirm = (): void => {
    void confirmSaveDraft(name);
  };

  return (
    <Modal title={t().draftsSave} onClose={closeSaveDraftDialog}>
      <form
        class="fx-dialog draft-save-dialog"
        onSubmit={(e) => {
          e.preventDefault();
          confirm();
        }}
      >
        <div class="fx-row">
          <label class="fx-label" for="draft-name">
            {t().draftNameLabel}
          </label>
          <input
            id="draft-name"
            class="fx-num"
            type="text"
            maxLength={200}
            value={name}
            onChange={(e) => setName((e.target as HTMLInputElement).value)}
          />
        </div>
        <div class="fx-actions">
          <button type="button" class="btn-secondary" onClick={closeSaveDraftDialog}>
            Cancel
          </button>
          <button type="submit" class="btn-primary">
            {t().draftsSave}
          </button>
        </div>
      </form>
    </Modal>
  );
}
