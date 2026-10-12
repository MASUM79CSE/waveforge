/**
 * Smart RAG dialogs (P1.5) — consent + manage models. This file is LAZY:
 * loaded by RagDialogHost on first open, never part of the entry chunk.
 */
import { useEffect, useState } from 'preact/hooks';
import { locale } from '../../i18n';
import { cursorPos, manageModelsOpen, ragPanelOpen, selection } from '../state';
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
import type { SearchHit } from '../../rag/retrieval/search';
import {
  ragAskBusy,
  ragAskHistory,
  ragAskUseLlm,
  type AskTurn,
} from '../../rag/runtime';
import { planFromChunk, planFromSelection, planFromUtterance } from '../../rag/edits/planners';
import type { EditPlan } from '../../rag/edits/plan';
import { chaptersFromTranscript } from '../../rag/edits/chapters';


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
    ragSearchLabel: 'Search in transcript',
    ragSearchPlaceholder: 'Type to search',
    ragSearchEmpty: 'No matches in this transcript.',
    ragSearchIndexing: 'Preparing search on this device',
    ragSearchFailed: 'Search is unavailable for this transcript.',
    ragAskLabel: 'Ask about this transcript',
    ragAskPlaceholder: 'Ask a question',
    ragAskButton: 'Ask',
    ragAskBusy: 'Working on this device…',
    ragAskNotInTranscript: 'Not in this transcript.',
    ragAskChatNote: 'I can only answer questions about this transcript.',
    ragAskFromModel: 'local model',
    ragAskOptIn: 'Use local AI model (downloads once, stays on this device)',
    ragEditsTitle: 'Smart edits',
    ragEditsDescribe: 'Describe an edit',
    ragEditsPropose: 'Propose',
    ragEditsPreview: 'Preview',
    ragEditsApply: 'Apply',
    ragEditsCancel: 'Cancel',
    ragEditsDeleteSel: 'Delete selection',
    ragEditsSilenceSel: 'Silence selection',
    ragEditsQuieter: 'Quieter',
    ragEditsLouder: 'Louder',
    ragEditsUnsafe: 'That edit is not safe on this document.',
    ragEditsFailed: 'The edit could not be applied.',
    ragEditsDeleteUtterance: 'Delete utterance',
    ragEditsSilenceUtterance: 'Silence utterance',
    ragChaptersTitle: 'Chapters',
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
    ragSearchLabel: 'ট্রান্সক্রিপ্টে খুঁজুন',
    ragSearchPlaceholder: 'লিখে খুঁজুন',
    ragSearchEmpty: 'এই ট্রান্সক্রিপ্টে কোনো মিল নেই।',
    ragSearchIndexing: 'এই ডিভাইসেই সার্চ প্রস্তুত হচ্ছে',
    ragSearchFailed: 'এই ট্রান্সক্রিপ্টে সার্চ করা যাচ্ছে না।',
    ragAskLabel: 'এই ট্রান্সক্রিপ্ট নিয়ে জিজ্ঞাসা করুন',
    ragAskPlaceholder: 'প্রশ্ন লিখুন',
    ragAskButton: 'জিজ্ঞাসা',
    ragAskBusy: 'এই ডিভাইসেই কাজ চলছে…',
    ragAskNotInTranscript: 'এই ট্রান্সক্রিপ্টে নেই।',
    ragAskChatNote: 'আমি শুধু এই ট্রান্সক্রিপ্ট নিয়ে উত্তর দিতে পারি।',
    ragAskFromModel: 'লোকাল মডেল',
    ragAskOptIn: 'লোকাল এআই মডেল ব্যবহার করুন (একবার ডাউনলোড, ডিভাইসেই থাকে)',
    ragEditsTitle: 'স্মার্ট এডিট',
    ragEditsDescribe: 'এডিট লিখে বলুন',
    ragEditsPropose: 'প্রস্তাব',
    ragEditsPreview: 'প্রিভিউ',
    ragEditsApply: 'প্রয়োগ',
    ragEditsCancel: 'বাতিল',
    ragEditsDeleteSel: 'নির্বাচন মুছুন',
    ragEditsSilenceSel: 'নির্বাচন নীরব করুন',
    ragEditsQuieter: 'কম জোরে',
    ragEditsLouder: 'বেশি জোরে',
    ragEditsUnsafe: 'এই ডকুমেন্টে এই এডিট নিরাপদ নয়।',
    ragEditsFailed: 'এডিট প্রয়োগ করা যায়নি।',
    ragEditsDeleteUtterance: 'উক্তি মুছুন',
    ragEditsSilenceUtterance: 'উক্তি নীরব করুন',
    ragChaptersTitle: 'অধ্যায়',
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

/** Selection in seconds from app state (or null). */
function selRangeSec(): { startSec: number; endSec: number } | null {
  const sel = selection.value;
  if (!sel || sel.end - sel.start < 0.01) return null;
  return { startSec: Math.max(0, Math.min(sel.start, sel.end)), endSec: Math.max(sel.start, sel.end) };
}

/** Span of the most recent answer's last citation (or null). */
function lastCitationSec(): { startSec: number; endSec: number } | null {
  const turn = ragAskHistory.value.find((t) => t.citations.length > 0);
  if (!turn) return null;
  const c = turn.citations[turn.citations.length - 1]!;
  return { startSec: c.startSec, endSec: c.endSec };
}

function TranscriptPanel() {
  const close = () => (ragPanelOpen.value = false);
  const state = ragState.value;
  const transcript = ragTranscript.value;
  const models = ragModelChoices();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [askInput, setAskInput] = useState('');
  const [editInput, setEditInput] = useState('');
  const [proposal, setProposal] = useState<{ plan: EditPlan; verb: string } | null>(null);
  const history = ragAskHistory.value;
  const chapters = transcript ? chaptersFromTranscript(transcript) : [];
  const askBusy = ragAskBusy.value;
  const cur = cursorPos.value;

  // P4.8 — Ask submit: full on-device pipeline; answers render as TEXT
  // NODES; citation buttons seek. Never throws past the UI boundary.
  // P5.4/P5.7 — Smart edits: NL proposal (explicit confirm), quick
  // selection ops, per-answer utterance ops. Plans are deterministic;
  // execution goes through applyPlan = ONE performEdit.
  const proposeEdit = (text: string) => {
    const resolve =
      selRangeSec() ??
      lastCitationSec() ??
      { startSec: 0, endSec: transcript ? transcript.segments[transcript.segments.length - 1]?.end ?? 0 : 0 };
    const res = planFromUtterance(text, resolve);
    setProposal(res.plan ? { plan: res.plan, verb: res.verb ?? '' } : null);
    if (!res.plan) setError(null);
  };
  const applyProposal = (plan: EditPlan) => {
    void import('../../app/ragEditActions')
      .then((m) => m.applyPlan(plan))
      .then((res) => {
        if (!res.ok) setError(res.reason === 'unsafe' ? rt('ragEditsUnsafe') : rt('ragEditsFailed'));
        else setProposal(null);
      })
      .catch(() => setError(rt('ragEditsFailed')));
  };

  const onAsk = () => {
    const q = askInput.trim();
    if (q.length === 0 || askBusy) return;
    setAskInput('');
    void import('../../rag/runtime')
      .then((rtMod) => rtMod.askTranscript(q))
      .catch(() => undefined);
  };

  useEffect(() => {
    const m = models[0];
    if (m) void loadStoredTranscript(m.id);
  }, []);

  // P3.7 — hybrid transcript search: debounce, auto-index on first use
  // (all on-device), render snippets as TEXT NODES, seek on click/Enter.
  useEffect(() => {
    if (!transcript || query.trim().length === 0) {
      setHits([]);
      return;
    }
    const t = setTimeout(() => {
      setSearching(true);
      void import('../../rag/runtime')
        .then(async (rtMod) => {
          // semantic search with the calibrated no-match floor when the
          // rows carry the real model; fake-embedder rows (CI) keep
          // find-in-transcript lexical semantics (D9)
          let res = await rtMod.searchTranscript(query, { topK: 5, semantic: true });
          if (res.length === 0 && !rtMod.ragIndexBusy.value) {
            await rtMod.indexTranscript();
            res = await rtMod.searchTranscript(query, { topK: 5, semantic: true });
          }
          setHits(res);
        })
        .catch(() => setHits([]))
        .finally(() => setSearching(false));
    }, 200);
    return () => clearTimeout(t);
  }, [query, transcript]);

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
        <div class="transcript-search">
          <input
            type="search"
            class="search-input"
            aria-label={rt('ragSearchLabel')}
            placeholder={rt('ragSearchPlaceholder')}
            value={query}
            onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
          />
          <div role="status" aria-live="polite" class="search-status">
            {searching ? rt('ragSearchIndexing') : query.trim() && hits.length === 0 && !searching ? rt('ragSearchEmpty') : ''}
          </div>
          {hits.length > 0 && (
            <ul class="segment-list search-results">
              {hits.map((h) => (
                <li key={h.chunk.id}>
                  <button
                    type="button"
                    class="segment"
                    aria-label={`${fmtTime(h.chunk.startSec)}`}
                    onClick={() => engine.seek(h.chunk.startSec)}
                  >
                    <span class="seg-time">{fmtTime(h.chunk.startSec)}</span>
                    <span class="seg-text">{h.chunk.text}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div class="transcript-ask">
          <div class="ask-row">
            <input
              type="text"
              class="ask-input"
              aria-label={rt('ragAskLabel')}
              placeholder={rt('ragAskPlaceholder')}
              value={askInput}
              onInput={(e) => setAskInput((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onAsk();
              }}
            />
            <button type="button" class="btn ask-btn" onClick={onAsk} disabled={askBusy || askInput.trim().length === 0}>
              {rt('ragAskButton')}
            </button>
          </div>
          <label class="ask-optin">
            <input
              type="checkbox"
              checked={ragAskUseLlm.value}
              onChange={(e) => (ragAskUseLlm.value = (e.target as HTMLInputElement).checked)}
            />
            {rt('ragAskOptIn')}
          </label>
          {askBusy && (
            <div role="status" aria-live="polite" class="ask-status">
              {rt('ragAskBusy')}
            </div>
          )}
          {history.map((turn: AskTurn) => (
            <div class="ask-turn" key={turn.id}>
              <p class="ask-q">{turn.query}</p>
              {turn.note === 'chat' ? (
                <p class="ask-a" role="status">{rt('ragAskChatNote')}</p>
              ) : turn.status === 'answer' ? (
                <p class="ask-a">
                  {turn.text}{' '}
                  <span class="ask-provider">({turn.provider === 'local-llm' ? rt('ragAskFromModel') : 'extractive'})</span>
                </p>
              ) : (
                <p class="ask-a" role="status">{rt('ragAskNotInTranscript')}</p>
              )}
              {turn.citations.length > 0 && (
                <div class="ask-citations">
                  {turn.citations.map((c, i) => (
                    <button
                      type="button"
                      class="btn ask-cite"
                      key={`${turn.id}-${i}`}
                      aria-label={`${fmtTime(c.startSec)}`}
                      onClick={() => engine.seek(c.startSec)}
                    >
                      {fmtTime(c.startSec)}
                    </button>
                  ))}
                  {(() => {
                    const c = turn.citations[turn.citations.length - 1]!;
                    const del = planFromChunk({ startSec: c.startSec, endSec: c.endSec, chunkId: c.chunkId }, 'delete');
                    const sil = planFromChunk({ startSec: c.startSec, endSec: c.endSec, chunkId: c.chunkId }, 'silence');
                    return (
                      <>
                        {del && (
                          <button type="button" class="btn ask-cite" aria-label={`${rt('ragEditsDeleteUtterance')} ${fmtTime(c.startSec)}`} onClick={() => applyProposal(del)}>
                            ✂
                          </button>
                        )}
                        {sil && (
                          <button type="button" class="btn ask-cite" aria-label={`${rt('ragEditsSilenceUtterance')} ${fmtTime(c.startSec)}`} onClick={() => applyProposal(sil)}>
                            ∅
                          </button>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          ))}
        </div>
        <div class="smart-edits">
          <strong class="section-title">{rt('ragEditsTitle')}</strong>
          <div class="ask-row">
            <input
              type="text"
              class="ask-input"
              aria-label={rt('ragEditsDescribe')}
              placeholder={rt('ragEditsDescribe')}
              value={editInput}
              onInput={(e) => setEditInput((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && editInput.trim().length > 0) proposeEdit(editInput.trim());
              }}
            />
            <button
              type="button"
              class="btn ask-btn"
              disabled={editInput.trim().length === 0}
              onClick={() => proposeEdit(editInput.trim())}
            >
              {rt('ragEditsPropose')}
            </button>
          </div>
          {proposal && (
            <div class="edit-confirm">
              <p class="edit-desc">
                {proposal.verb} {proposal.plan.kind === 'insertSilence'
                  ? `${proposal.plan.durSec.toFixed(1)}s @ ${fmtTime(proposal.plan.atSec)}`
                  : `${fmtTime(proposal.plan.startSec)} – ${fmtTime(proposal.plan.endSec)}`}
              </p>
              <div class="ask-citations">
                <button type="button" class="btn ask-cite" onClick={() => void import('../../app/ragEditActions').then((m) => m.previewPlan(proposal.plan))}>
                  {rt('ragEditsPreview')}
                </button>
                <button type="button" class="btn ask-cite" onClick={() => applyProposal(proposal.plan)}>
                  {rt('ragEditsApply')}
                </button>
                <button type="button" class="btn ask-cite" onClick={() => setProposal(null)}>
                  {rt('ragEditsCancel')}
                </button>
              </div>
            </div>
          )}
          <div class="ask-citations">
            <button
              type="button"
              class="btn ask-cite"
              disabled={!selRangeSec()}
              onClick={() => {
                const sel = selRangeSec();
                if (sel) applyProposal(planFromSelection(sel, 'delete')!);
              }}
            >
              {rt('ragEditsDeleteSel')}
            </button>
            <button
              type="button"
              class="btn ask-cite"
              disabled={!selRangeSec()}
              onClick={() => {
                const sel = selRangeSec();
                if (sel) applyProposal(planFromSelection(sel, 'silence')!);
              }}
            >
              {rt('ragEditsSilenceSel')}
            </button>
            <button
              type="button"
              class="btn ask-cite"
              disabled={!selRangeSec()}
              onClick={() => {
                const sel = selRangeSec();
                if (sel) applyProposal(planFromSelection(sel, 'gain', 0.5)!);
              }}
            >
              {rt('ragEditsQuieter')}
            </button>
            <button
              type="button"
              class="btn ask-cite"
              disabled={!selRangeSec()}
              onClick={() => {
                const sel = selRangeSec();
                if (sel) applyProposal(planFromSelection(sel, 'gain', 1.8)!);
              }}
            >
              {rt('ragEditsLouder')}
            </button>
          </div>
          {chapters.length > 0 && (
            <div class="chapters">
              <strong class="section-title">{rt('ragChaptersTitle')}</strong>
              <ul class="chapter-list">
                {chapters.map((c) => (
                  <li key={c.index}>
                    <button
                      type="button"
                      class="segment"
                      aria-label={`${c.title} (${fmtTime(c.atSec)})`}
                      onClick={() => engine.seek(c.atSec)}
                    >
                      <span class="seg-time">{fmtTime(c.atSec)}</span>
                      <span class="seg-text">{c.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
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
