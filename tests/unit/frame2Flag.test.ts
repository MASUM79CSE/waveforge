// UX-2.1 — frame2 flag: URL override + guarded localStorage, default OFF.
// Contract: default OFF; localStorage key `ui.cleanSlateLayout` ∈ {'1','true'}
// turns it ON; URL param `ui2=1|true` turns it ON; URL `ui2=0|false|anything-else`
// forces OFF even if localStorage is set (URL wins); garbage values are OFF.
// @vitest-environment jsdom

import { afterEach, describe, expect, test } from 'vitest';
import { isFrame2, resetFrame2Cache, FRAME2_FLAG_KEY, FRAME2_URL_PARAM } from '../../src/app/frame2/flag';

function setUrl(url: string): void {
  window.history.replaceState(null, '', url);
}

afterEach(() => {
  localStorage.removeItem(FRAME2_FLAG_KEY);
  setUrl('/');
  resetFrame2Cache();
});

describe('frame2 flag — default OFF', () => {
  test('no url param, no localStorage → OFF', () => {
    setUrl('/');
    expect(isFrame2()).toBe(false);
  });

  test('garbage localStorage value → OFF', () => {
    localStorage.setItem(FRAME2_FLAG_KEY, 'garbage');
    expect(isFrame2()).toBe(false);
  });

  test('localStorage "0"/"false" → OFF', () => {
    localStorage.setItem(FRAME2_FLAG_KEY, '0');
    expect(isFrame2()).toBe(false);
    localStorage.setItem(FRAME2_FLAG_KEY, 'false');
    expect(isFrame2()).toBe(false);
  });
});

describe('frame2 flag — localStorage ON', () => {
  test('"1" → ON', () => {
    localStorage.setItem(FRAME2_FLAG_KEY, '1');
    expect(isFrame2()).toBe(true);
  });

  test('"true" → ON', () => {
    localStorage.setItem(FRAME2_FLAG_KEY, 'true');
    expect(isFrame2()).toBe(true);
  });
});

describe('frame2 flag — URL override', () => {
  test('ui2=1 forces ON without localStorage', () => {
    setUrl('/?ui2=1');
    expect(isFrame2()).toBe(true);
  });

  test('ui2=true forces ON without localStorage', () => {
    setUrl('/?ui2=true');
    expect(isFrame2()).toBe(true);
  });

  test('ui2=0 forces OFF even with localStorage ON (URL wins)', () => {
    localStorage.setItem(FRAME2_FLAG_KEY, '1');
    setUrl('/?ui2=0');
    expect(isFrame2()).toBe(false);
  });

  test('ui2=garbage forces OFF even with localStorage ON (URL wins when present)', () => {
    localStorage.setItem(FRAME2_FLAG_KEY, '1');
    setUrl('/?ui2=garbage');
    expect(isFrame2()).toBe(false);
  });

  test('url param name is ui2 and key is ui.cleanSlateLayout', () => {
    expect(FRAME2_URL_PARAM).toBe('ui2');
    expect(FRAME2_FLAG_KEY).toBe('ui.cleanSlateLayout');
  });
});
