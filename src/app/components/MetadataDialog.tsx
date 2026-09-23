/**
 * Song-info (ID3) dialog (M5): six validated fields; values are stored in
 * the `tags` signal and embedded as an ID3v2.4 tag in MP3 exports.
 */
import { useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { id3Schema, type Id3Meta } from '../../io/id3';
import { t } from '../../i18n';
import * as S from '../state';
import { Modal } from './Modal';

const FIELDS: { key: keyof Id3Meta; label: string; type: 'text' | 'year' }[] = [
  { key: 'title', label: 'Title', type: 'text' },
  { key: 'artist', label: 'Artist', type: 'text' },
  { key: 'album', label: 'Album', type: 'text' },
  { key: 'year', label: 'Year', type: 'year' },
  { key: 'track', label: 'Track', type: 'text' },
  { key: 'genre', label: 'Genre', type: 'text' },
];

export function MetadataDialog(): JSX.Element | null {
  const open = S.metadataOpen.value;
  const [draft, setDraft] = useState<Record<string, string>>({ ...S.tags.value });
  const [invalid, setInvalid] = useState(false);

  if (!open) return null;

  const save = (): void => {
    const cleaned = Object.fromEntries(
      Object.entries(draft).filter(([, v]) => v !== ''),
    );
    const parsed = id3Schema.safeParse(cleaned);
    if (!parsed.success) {
      setInvalid(true);
      return;
    }
    S.tags.value = parsed.data as Record<string, string>;
    S.metadataOpen.value = false;
  };

  return (
    <Modal title={t().metadataTitle} onClose={() => (S.metadataOpen.value = false)}>
      <div class="fx-dialog meta-dialog">
        <p class="meta-hint">{t().metadataHint}</p>
        {FIELDS.map((field) => (
          <div class="fx-row" key={field.key}>
            <label class="fx-label" for={`meta-${field.key}`}>
              {field.label}
            </label>
            <input
              id={`meta-${field.key}`}
              class="fx-num"
              type="text"
              value={draft[field.key] ?? ''}
              maxLength={field.type === 'year' ? 4 : 500}
              onInput={(e) => {
                setDraft({ ...draft, [field.key]: (e.target as HTMLInputElement).value });
                setInvalid(false);
              }}
            />
          </div>
        ))}
        {invalid && <p class="meta-error">{t().errors['WF-E101']}</p>}
        <div class="fx-actions">
          <button type="button" class="btn-secondary" onClick={() => (S.metadataOpen.value = false)}>
            Cancel
          </button>
          <button type="button" class="btn-primary" onClick={save}>
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}
