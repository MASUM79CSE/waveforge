import { describe, expect, it } from 'vitest';
import { IntentSchema, routeIntent } from '../../../src/rag/ask/intent';

describe('P4.1 intent router', () => {
  it('golden table — en', () => {
    const table: Array<[string, string]> = [
      ['what are the peaks used for?', 'ask'],
      ['why does the export take long', 'ask'],
      ['how does noise reduction work', 'ask'],
      ['where is the fade handle', 'search'],
      ['find the part about recording', 'search'],
      ['jump to the noise print', 'search'],
      ['summarize this', 'summarize'],
      ['give me a tldr', 'summarize'],
      ['can you give me an overview', 'summarize'],
      ['hello', 'chat'],
      ['thanks, that helped', 'chat'],
    ];
    for (const [query, intent] of table) {
      expect(routeIntent(query).intent, query).toBe(intent);
    }
  });

  it('golden table — bn', () => {
    const table: Array<[string, string]> = [
      ['নয়েজ রিডাকশন কিভাবে কাজ করে?', 'ask'],
      ['ফেড কোথায়?', 'search'],
      ['সারসংক্ষেপ দাও', 'summarize'],
      ['হ্যালো', 'chat'],
      ['ধন্যবাদ', 'chat'],
    ];
    for (const [query, intent] of table) {
      expect(routeIntent(query).intent, query).toBe(intent);
    }
  });

  it('question mark routes to ask when nothing stronger matches', () => {
    expect(routeIntent('the peaks?').intent).toBe('ask');
    expect(routeIntent('waveform peaks').intent).toBe('ask'); // default
  });

  it('priority: summarize beats search/ask phrasing', () => {
    expect(routeIntent('find the part to summarize?').intent).toBe('summarize');
    expect(routeIntent('where can I find the summary?').intent).toBe('summarize');
  });

  it('priority: search beats ask (locate phrased as question)', () => {
    expect(routeIntent('where is the section that explains fades?').intent).toBe('search');
  });

  it('chat only at the start of the utterance', () => {
    expect(routeIntent('HI there').intent).toBe('chat');
    expect(routeIntent('the hi-hat recording').intent).toBe('ask'); // 'hi' mid-phrase ≠ greeting
  });

  it('NFKC + case normalization; matched list is deterministic', () => {
    const a = routeIntent('  TL;DR  ');
    const b = routeIntent('tldr');
    expect(a.intent).toBe('summarize');
    expect(a.matched).toEqual(b.matched);
  });

  it('result is zod-valid and carries debug cues', () => {
    const res = routeIntent('why is the meter red');
    expect(IntentSchema.parse(res.intent)).toBe('ask');
    expect(res.matched.length).toBeGreaterThan(0);
  });

  it('empty / whitespace input defaults to ask', () => {
    expect(routeIntent('').intent).toBe('ask');
    expect(routeIntent('   ').intent).toBe('ask');
  });
});
