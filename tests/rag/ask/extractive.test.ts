import { describe, expect, it } from 'vitest';
import { createExtractiveProvider } from '../../../src/rag/ask/extractive';
import { verifyCitation, type EvidenceChunk } from '../../../src/rag/ask/grounding';
import { AskAnswerSchema } from '../../../src/rag/ask/provider';
import { CORPUS_SEGMENTS } from '../../../src/rag/eval/corpus';

const EVIDENCE: EvidenceChunk[] = [
  {
    id: 't@1/f#0',
    text: 'The waveform peaks are drawn by the peaks worker. Peaks are cached for smooth scrolling. The overview canvas redraws on zoom changes.',
    startSec: 0,
    endSec: 30,
  },
  {
    id: 't@1/f#1',
    text: 'Export the master as a flac file to keep it lossless. The rendered file name follows the project title.',
    startSec: 30,
    endSec: 60,
  },
];

const provider = createExtractiveProvider();
const ctx = (evidence: EvidenceChunk[] = EVIDENCE, confidence = 0.9) => ({ evidence, confidence });

describe('P4.4 extractive provider', () => {
  it('golden: peaks question quotes the right sentence from the right chunk', async () => {
    const res = await provider.answer({ query: 'how are the waveform peaks drawn' }, ctx());
    expect(res.status).toBe('answer');
    expect(res.text).toContain('The waveform peaks are drawn by the peaks worker.');
    expect(res.citations[0]!.chunkId).toBe('t@1/f#0');
    expect(res.provider).toBe('extractive');
  });

  it('answer text is an exact substring of the cited chunk', async () => {
    const res = await provider.answer({ query: 'flac export quality' }, ctx());
    expect(res.status).toBe('answer');
    const chunk = EVIDENCE.find((c) => c.id === res.citations[0]!.chunkId)!;
    expect(chunk.text.includes(res.text.split(' ')[0]!)).toBe(true);
    for (const part of res.text.split('. ').filter(Boolean)) {
      expect(chunk.text.includes(part.replace(/\.$/, '')) || chunk.text.includes(part)).toBe(true);
    }
  });

  it('every citation passes verifyCitation (exact quotes, valid spans)', async () => {
    const res = await provider.answer({ query: 'peaks caching and flac export' }, ctx());
    for (const c of res.citations) {
      expect(verifyCitation(c, EVIDENCE)).toBe(true);
    }
  });

  it('provider output is zod-valid', async () => {
    const res = await provider.answer({ query: 'how are the waveform peaks drawn' }, ctx());
    expect(AskAnswerSchema.parse(res)).toEqual(res);
  });

  it('empty evidence → insufficient', async () => {
    const res = await provider.answer({ query: 'anything at all', ctx: undefined, confidence: 0.9 } as never, ctx([]));
    expect(res.status).toBe('insufficient');
    expect(res.text).toBe('');
  });

  it('zero-overlap query → insufficient (never invents)', async () => {
    const res = await provider.answer({ query: 'zzz qqq xviolet' }, ctx());
    expect(res.status).toBe('insufficient');
  });

  it('stopword-only query → insufficient', async () => {
    const res = await provider.answer({ query: 'the of and to a' }, ctx());
    expect(res.status).toBe('insufficient');
  });

  it('multi-topic query: picks the most on-topic chunk, not distractors', async () => {
    const res = await provider.answer({ query: 'is the flac export lossless' }, ctx());
    expect(res.citations[0]!.chunkId).toBe('t@1/f#1');
    expect(res.text).toContain('lossless');
  });

  it('multi-sentence answers keep original document order', async () => {
    const res = await provider.answer({ query: 'peaks worker cached scrolling' }, ctx());
    if (res.citations.length > 1) {
      const first = res.text.indexOf(res.citations[0]!.quote);
      const second = res.text.indexOf(res.citations[1]!.quote);
      expect(first).toBeLessThan(second);
    }
    expect(res.citations.length).toBeLessThanOrEqual(2);
  });

  it('budget: at most 2 sentences / 400 chars', async () => {
    const big: EvidenceChunk[] = [
      {
        id: 'c#0',
        text: Array.from(
          { length: 8 },
          (_, i) => `The peaks worker fact number ${i} is about peaks rendering today.`,
        ).join(' '),
        startSec: 0,
        endSec: 80,
      },
    ];
    const res = await provider.answer({ query: 'peaks worker rendering' }, ctx(big));
    expect(res.citations.length).toBeLessThanOrEqual(2);
    expect(res.text.length).toBeLessThanOrEqual(400);
  });

  it('deterministic: identical input → identical answer', async () => {
    const a = await provider.answer({ query: 'how are the waveform peaks drawn' }, ctx());
    const b = await provider.answer({ query: 'how are the waveform peaks drawn' }, ctx());
    expect(a).toEqual(b);
  });

  it('bn query over bn evidence cites the matching sentence', async () => {
    const bn: EvidenceChunk[] = [
      {
        id: 't@1/f#2',
        text: 'নয়েজ রিডাকশন প্রথমে নয়েজ প্রিন্ট শেখে। তারপর স্থায়ী হিস দূর করে।',
        startSec: 0,
        endSec: 10,
      },
      {
        id: 't@1/f#3',
        text: 'ফেড হ্যান্ডেল দিয়ে ক্লিপের শুরু ও শেষ নরম করা যায়।',
        startSec: 10,
        endSec: 20,
      },
    ];
    const res = await provider.answer({ query: 'নয়েজ রিডাকশন কিভাবে কাজ করে' }, ctx(bn));
    expect(res.status).toBe('answer');
    expect(res.citations[0]!.chunkId).toBe('t@1/f#2');
    expect(res.text).toContain('নয়েজ');
  });

  it('end-to-end over the P3.8 golden corpus (markers reachable)', async () => {
    const chunks = CORPUS_SEGMENTS.map((s, i) => ({
      id: `eval@1/corpus#${i}`,
      text: s.text,
      startSec: s.start,
      endSec: s.end,
    }));
    const res = await provider.answer(
      { query: 'remove steady hiss with the learned noise print' },
      ctx(chunks),
    );
    console.log('DEBUG', JSON.stringify(res).slice(0, 400));
    expect(res.status).toBe('answer');
    expect(res.text.toLowerCase()).toContain('noise');
  });

  it('aborted context → insufficient, never an answer', async () => {
    const ac = new AbortController();
    ac.abort();
    const res = await provider.answer({ query: 'peaks' }, { ...ctx(), signal: ac.signal });
    expect(res.status).toBe('insufficient');
  });
});
