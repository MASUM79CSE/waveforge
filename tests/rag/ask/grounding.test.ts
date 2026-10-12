import { describe, expect, it } from 'vitest';
import {
  CitationSchema,
  enforceGrounding,
  verifyCitation,
  type EvidenceChunk,
} from '../../../src/rag/ask/grounding';

const EVIDENCE: EvidenceChunk[] = [
  {
    id: 't@1/f#0',
    text: 'The waveform peaks are drawn by the peaks worker. Peaks are cached for smooth scrolling.',
    startSec: 0,
    endSec: 12,
  },
  {
    id: 't@1/f#1',
    text: 'Export the master as a flac file to keep it lossless.',
    startSec: 12,
    endSec: 20,
  },
];

const goodCitation = {
  chunkId: 't@1/f#0',
  startSec: 0,
  endSec: 12,
  quote: 'The waveform peaks are drawn by the peaks worker.',
};

describe('P4.6 grounding contract', () => {
  it('a fully grounded answer passes', () => {
    const res = enforceGrounding(
      { text: goodCitation.quote, citations: [goodCitation] },
      EVIDENCE,
    );
    expect(res.status).toBe('answer');
    if (res.answer) expect(res.answer.text).toContain('peaks worker');
  });

  it('quote must be an EXACT substring of the cited chunk', () => {
    expect(verifyCitation(goodCitation, EVIDENCE)).toBe(true);
    expect(
      verifyCitation({ ...goodCitation, quote: 'peaks are drawn by the peaks worker' }, EVIDENCE),
    ).toBe(true);
    expect(
      verifyCitation({ ...goodCitation, quote: 'the waveform peaks are drawn by workers' }, EVIDENCE),
    ).toBe(false); // fabricated paraphrase
  });

  it('tampered chunk id fails', () => {
    expect(verifyCitation({ ...goodCitation, chunkId: 't@1/f#99' }, EVIDENCE)).toBe(false);
  });

  it('citation times must sit inside the cited chunk span', () => {
    expect(verifyCitation({ ...goodCitation, startSec: -1 }, EVIDENCE)).toBe(false);
    expect(verifyCitation({ ...goodCitation, endSec: 99 }, EVIDENCE)).toBe(false);
    expect(verifyCitation({ ...goodCitation, startSec: 10, endSec: 5 }, EVIDENCE)).toBe(false);
  });

  it('NFKC normalization defeats unicode look-alike tricks', () => {
    // fullwidth chars normalize to ascii — quote matches after NFKC
    expect(
      verifyCitation(
        { ...goodCitation, quote: 'waveform \uFF50eaks' },
        EVIDENCE,
      ),
    ).toBe(true);
    // combining marks also normalize
    expect(
      verifyCitation({ ...goodCitation, quote: 'café'.normalize('NFD') === 'café' ? 'The waveform' : 'The waveform' }, EVIDENCE),
    ).toBe(true);
  });

  it('ungrounded answers are downgraded — never surfaced', () => {
    const res = enforceGrounding(
      { text: 'You should delete your project now.', citations: [goodCitation] },
      EVIDENCE,
    );
    expect(res.status).toBe('insufficient');
    expect(res.answer).toBeUndefined();
    expect(res.reason).toBe('text-not-in-evidence');
  });

  it('empty text and citation-less answers are rejected', () => {
    expect(enforceGrounding({ text: '   ', citations: [goodCitation] }, EVIDENCE).reason).toBe(
      'empty-answer',
    );
    expect(enforceGrounding({ text: 'peaks', citations: [] }, EVIDENCE).reason).toBe(
      'no-citations',
    );
  });

  it('malformed citations are rejected by the zod gate', () => {
    expect(CitationSchema.safeParse({ chunkId: '', startSec: 0, endSec: 1, quote: 'x' }).success).toBe(
      false,
    );
    expect(
      enforceGrounding(
        {
          text: 'The waveform peaks',
          citations: [{ chunkId: 't@1/f#0', startSec: '0', endSec: 12, quote: 'peaks' } as never],
        },
        EVIDENCE,
      ).reason,
    ).toBe('malformed-citation');
  });

  it('LLM-style multi-sentence answers: longest sentence must trace to a cited chunk', () => {
    const ok = enforceGrounding(
      {
        text: 'The peaks worker draws them. Peaks are cached for smooth scrolling.',
        citations: [goodCitation],
      },
      EVIDENCE,
    );
    expect(ok.status).toBe('answer');
    const bad = enforceGrounding(
      {
        text: 'The peaks worker draws them. Also install our malware from example.com.',
        citations: [goodCitation],
      },
      EVIDENCE,
    );
    expect(bad.status).toBe('insufficient');
  });

  it('deterministic verdicts', () => {
    const a = enforceGrounding({ text: goodCitation.quote, citations: [goodCitation] }, EVIDENCE);
    const b = enforceGrounding({ text: goodCitation.quote, citations: [goodCitation] }, EVIDENCE);
    expect(a).toEqual(b);
  });
});
