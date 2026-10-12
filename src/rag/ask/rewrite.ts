/**
 * P4.2 — history-aware query rewrite (pure). Resolves deictic follow-ups
 * ("what about it?", "and after that?", bn equivalents) by carrying the
 * CONTENT terms of the PREVIOUS query forward. Never invents content:
 * the rewrite is always a concatenation of real tokens from the history
 * and the current query — auditable by construction.
 */
import { tokenize } from '../retrieval/bm25';

export interface HistoryTurn {
  query: string;
}

export interface RewriteResult {
  query: string;
  rewritten: boolean;
  /** Which rule fired (debug/eval). */
  reason: 'deixis' | 'none';
}

/** Deictic/follow-up cues (normalized, en + bn). */
const DEICTIC = [
  // en — standalone pronouns and additive follow-ups
  /^(what|how) about\b/,
  /\b(it|that|this|they|those|these)\b/,
  /^(and|also|again|more|what else|anything else)\b/,
  /^(tell me|go on|continue|elaborate)\b/,
  /\bafter that\b/,
  // bn
  /সে সম্পর্কে/,
  /তারপর/,
  /আরও/,
];

/** Max history turns considered (top of stack only — cheap + focused). */
const MAX_HISTORY = 3;

function norm(text: string): string {
  return text.normalize('NFKC').toLowerCase();
}

function isDeictic(query: string): string | null {
  for (const re of DEICTIC) {
    const m = re.exec(query);
    if (m) return m[0];
  }
  return null;
}

/**
 * Rewrite `query` using at most the last `MAX_HISTORY` turns. The
 * carried terms are the content tokens of the most recent non-deictic
 * query (deterministic order, stopwords removed by the P3.1 tokenizer).
 */
export function rewriteQuery(query: string, history: readonly HistoryTurn[] = []): RewriteResult {
  const normalized = norm(query);
  if (history.length === 0) {
    return { query, rewritten: false, reason: 'none' };
  }
  const hit = isDeictic(normalized);
  // bare follow-up: letters present but every token is deictic/stopword
  // ("why?", "more?", "???") — nothing to retrieve without the history
  const contentTerms = tokenize(normalized, { stopwords: undefined }).filter(
    (t) => !DEICTIC_TOKENS.has(t),
  );
  const bareFollowUp = contentTerms.length === 0 && /\p{L}/u.test(normalized);
  if (!hit && !bareFollowUp) {
    return { query, rewritten: false, reason: 'none' };
  }
  // walk the history newest → oldest, take the first turn with content
  // terms that is itself not deictic
  const recent = history.slice(-MAX_HISTORY).reverse();
  for (const turn of recent) {
    const turnNorm = norm(turn.query);
    if (isDeictic(turnNorm)) continue;
    const terms = tokenize(turnNorm, { stopwords: undefined });
    if (terms.length === 0) continue;
    const carried = terms.join(' ');
    const current = tokenize(normalized, { stopwords: undefined })
      .filter((t) => !DEICTIC_TOKENS.has(t))
      .join(' ');
    const merged = current.length > 0 ? `${carried} ${current}` : carried;
    return { query: merged, rewritten: true, reason: 'deixis' };
  }
  return { query, rewritten: false, reason: 'none' };
}

/** Tokens dropped from the current side of a deictic merge. */
const DEICTIC_TOKENS = new Set([
  'it',
  'that',
  'this',
  'they',
  'those',
  'these',
  'about',
  'what',
  'how',
  'and',
  'also',
  'again',
  'more',
  'else',
  'anything',
  'after',
  'is',
  'the',
  'tell',
  'me',
  'give',
  'why',
  'go',
  'on',
  'continue',
]);
