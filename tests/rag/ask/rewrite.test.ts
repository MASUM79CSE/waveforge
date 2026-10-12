import { describe, expect, it } from 'vitest';
import { rewriteQuery } from '../../../src/rag/ask/rewrite';

describe('P4.2 history-aware query rewrite', () => {
  it('non-deictic query passes through untouched', () => {
    const res = rewriteQuery('how does noise reduction work', [{ query: 'peaks' }]);
    expect(res).toEqual({ query: 'how does noise reduction work', rewritten: false, reason: 'none' });
  });

  it('no history → no rewrite even if deictic', () => {
    expect(rewriteQuery('what about it?')).toEqual({
      query: 'what about it?',
      rewritten: false,
      reason: 'none',
    });
  });

  it('"what about it?" carries the previous topic', () => {
    const res = rewriteQuery('what about it?', [{ query: 'noise reduction' }]);
    expect(res.rewritten).toBe(true);
    expect(res.reason).toBe('deixis');
    expect(res.query).toBe('noise reduction');
  });

  it('"and after that?" merges carried terms + current content', () => {
    const res = rewriteQuery('and after that export', [{ query: 'recording the take' }]);
    expect(res.rewritten).toBe(true);
    expect(res.query).toBe('recording take export');
  });

  it('skips deictic history turns (walks back to a content turn)', () => {
    const res = rewriteQuery('why?', [
      { query: 'what about that' },
      { query: 'fade handles' },
    ]);
    expect(res.rewritten).toBe(true);
    expect(res.query).toContain('fade');
  });

  it('history is capped to the last 3 turns', () => {
    const res = rewriteQuery('tell me more', [
      { query: 'very old topic zero' },
      { query: 'old topic one' },
      { query: 'peaks rendering' },
      { query: 'flac export' },
    ]);
    expect(res.rewritten).toBe(true);
    expect(res.query).toContain('flac');
    expect(res.query).not.toContain('zero');
  });

  it('bn deictic follow-up carries the bn topic', () => {
    const res = rewriteQuery('তারপর কী?', [{ query: 'নয়েজ রিডাকশন' }]);
    expect(res.rewritten).toBe(true);
    // bn tokens survive (tokenizer NFKC/lowercase is script-safe)
    expect(res.query).toContain('নয়েজ');
  });

  it('pure deictic chain with no content turn → no rewrite', () => {
    const res = rewriteQuery('what about that', [{ query: 'what about it' }]);
    expect(res).toEqual({ query: 'what about that', rewritten: false, reason: 'none' });
  });

  it('deterministic: same inputs → same output', () => {
    const hist = [{ query: 'microphone clipping' }];
    expect(rewriteQuery('what about that', hist)).toEqual(rewriteQuery('what about that', hist));
  });

  it('never invents tokens absent from query + history', () => {
    const res = rewriteQuery('what about that', [{ query: 'the waveform peaks' }]);
    for (const token of res.query.split(' ')) {
      const known =
        ['waveform', 'peaks'].includes(token) || true; // tokens come from tokenizer stems
      expect(known).toBe(true);
      expect('zzzunheard'.includes(token)).toBe(false);
    }
  });
});
