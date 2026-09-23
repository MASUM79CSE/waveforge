import { describe, expect, test } from 'vitest';
import {
  getErrorMessage,
  isWaveForgeError,
  makeError,
  redactContext,
  userMessageKey,
  WaveForgeError,
} from '../../src/core/errors';

describe('WaveForgeError', () => {
  test('carries its error code and defaults the message to the code', () => {
    const e = new WaveForgeError('WF-E102');
    expect(e.code).toBe('WF-E102');
    expect(e.message).toBe('WF-E102');
    expect(e instanceof Error).toBe(true);
  });

  test('accepts a context payload and a cause', () => {
    const cause = new Error('root');
    const e = makeError('WF-E201', { url: 'https://x/y' }, cause);
    expect(e.context?.['url']).toBe('https://x/y');
    expect(e.cause).toBe(cause);
  });

  test('isWaveForgeError distinguishes our errors from plain ones', () => {
    expect(isWaveForgeError(new WaveForgeError('WF-E601'))).toBe(true);
    expect(isWaveForgeError(new Error('plain'))).toBe(false);
    expect(isWaveForgeError('nope')).toBe(false);
  });

  test('userMessageKey maps the code into the i18n namespace', () => {
    expect(userMessageKey('WF-E402')).toBe('errors.WF-E402');
  });
});

describe('getErrorMessage', () => {
  test('unwraps Error instances', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom');
  });

  test('stringifies non-Error values', () => {
    expect(getErrorMessage('flat failure')).toBe('flat failure');
  });

  test('falls back for empty values', () => {
    expect(getErrorMessage(undefined)).toBe('Unexpected error');
    expect(getErrorMessage(null)).toBe('Unexpected error');
  });
});

describe('redactContext', () => {
  test('reduces paths to their basename', () => {
    const out = redactContext({ path: '/home/user/private/long-directory/voice.wav' });
    expect(out['path']).toBe('voice.wav');
  });

  test('redacts credential-like keys regardless of case', () => {
    const out = redactContext({ Authorization: 'Bearer abc', apiToken: 'xyz' });
    expect(out['Authorization']).toBe('[redacted]');
    expect(out['apiToken']).toBe('[redacted]');
  });

  test('truncates long strings', () => {
    const long = 'x'.repeat(200);
    const out = redactContext({ note: long });
    const value = out['note'] as string;
    expect(value.length).toBeLessThanOrEqual(64);
    expect(value.endsWith('…')).toBe(true);
  });

  test('returns a copy — the input object is untouched', () => {
    const input = { path: '/a/b.wav' };
    const out = redactContext(input);
    out['path'] = 'mutated';
    expect(input['path']).toBe('/a/b.wav');
  });
});
