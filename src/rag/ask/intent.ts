/**
 * P4.1 — deterministic intent router (pure). Classifies a user utterance
 * for the Ask feature using fixed en/bn cue rules — no ML, fully
 * auditable. Priority order on overlap: summarize > search > chat > ask
 * (a summary request that also looks like a question is a summary; a
 * locate request phrased as a question is a search). Default: ask.
 */
import { z } from 'zod';

export const IntentSchema = z.enum(['ask', 'search', 'summarize', 'chat']);
export type Intent = z.infer<typeof IntentSchema>;

export interface IntentResult {
  intent: Intent;
  /** Matched cue categories (debug/eval; deterministic order). */
  matched: string[];
}

/** NFKC + lowercase (mirrors the retrieval tokenizer's normalization). */
function norm(text: string): string {
  return text.normalize('NFKC').toLowerCase();
}

// Curated cue lists. Word-boundary regexes for latin cues, plain
// substring checks for bn (no \b on non-latin scripts).
const CUES: Array<{ name: string; intent: Intent; re: RegExp; substr?: string[] }> = [
  // summarize — strongest signal, checked first via priority below
  { name: 'summarize-en', intent: 'summarize', re: /\b(summar(y|ise|ize)|tldr|tl;dr|overview|recap|gist)\b/ },
  { name: 'summarize-bn', intent: 'summarize', re: /x/, substr: ['সারসংক্ষেপ', 'সারাংশ', 'সংক্ষেপে', 'মূল ভাব'] },
  // search — locating / jumping
  {
    name: 'search-en',
    intent: 'search',
    re: /\b(where (is|are|did|can i find)|find|locate|jump to|go to|show me the part|look for)\b/,
  },
  { name: 'search-bn', intent: 'search', re: /x/, substr: ['কোথায়', 'খুঁজে', 'খুঁজুন', 'জাম্প'] },
  // chat — smalltalk, not about the transcript
  { name: 'chat-en', intent: 'chat', re: /^(hi|hello|hey|thanks|thank you|good (morning|evening|afternoon))\b/ },
  { name: 'chat-bn', intent: 'chat', re: /x/, substr: ['হ্যালো', 'ধন্যবাদ', 'কেমন আছ'] },
  // ask — wh-words / question marks / how-does
  {
    name: 'ask-en',
    intent: 'ask',
    re: /\b(what|why|how|when|who|which|does|is|are|can|explain|tell me about|describe)\b/,
  },
  {
    name: 'ask-bn',
    intent: 'ask',
    re: /x/,
    substr: ['কী', 'কি', 'কেন', 'কিভাবে', 'কখন', 'কে', 'ব্যাখ্যা', 'কবে'],
  },
];

const PRIORITY: Intent[] = ['summarize', 'search', 'chat', 'ask'];

/**
 * Route an utterance to an intent. Question marks alone are weak
 * evidence: "find where the peaks are drawn?" still routes to search.
 */
export function routeIntent(rawQuery: string): IntentResult {
  const query = norm(rawQuery);
  const byIntent = new Map<Intent, string[]>();
  if (query.includes('?')) {
    byIntent.set('ask', ['question-mark']);
  }
  for (const cue of CUES) {
    const hit =
      (cue.re.source !== 'x' && cue.re.test(query)) ||
      (cue.substr?.some((s) => query.includes(s)) ?? false);
    if (hit) {
      const list = byIntent.get(cue.intent) ?? [];
      list.push(cue.name);
      byIntent.set(cue.intent, list);
    }
  }
  for (const intent of PRIORITY) {
    const matched = byIntent.get(intent);
    if (matched && matched.length > 0) {
      return { intent, matched };
    }
  }
  // default: treat a bare phrase as a question about the transcript
  return { intent: 'ask', matched: ['default'] };
}
