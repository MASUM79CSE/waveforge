// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import { render } from 'preact';
import { SelectionBar } from '../../../src/app/components/SelectionBar';
import * as S from '../../../src/app/state';

function flush(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
}

describe('M-D3: selection readout group', () => {
  test('no selection: three dashes, Clear disabled', async () => {
    S.selection.value = null;
    const host = document.createElement('div');
    document.body.appendChild(host);
    render(<SelectionBar />, host);
    await flush();
    const vals = host.querySelectorAll('.sel-val');
    expect(vals.length).toBe(3);
    vals.forEach((v) => expect(v.textContent).toBe('-'));
    const clear = host.querySelector('button') as HTMLButtonElement;
    expect(clear.disabled).toBe(true);
    host.replaceChildren();
  });

  test('with a selection: start/end/duration formatted, Clear enabled (Q hint)', async () => {
    S.selection.value = { start: 1.25, end: 3.75 };
    const host = document.createElement('div');
    document.body.appendChild(host);
    render(<SelectionBar />, host);
    await flush();
    const vals = [...host.querySelectorAll('.sel-val')].map((v) => v.textContent);
    expect(vals[0]).toContain('1.250');
    expect(vals[1]).toContain('3.750');
    expect(vals[2]).toContain('2.500');
    const clear = host.querySelector('button') as HTMLButtonElement;
    expect(clear.disabled).toBe(false);
    expect(clear.getAttribute('aria-label')).toMatch(/clear selection/i);
    host.replaceChildren();
  });
});
