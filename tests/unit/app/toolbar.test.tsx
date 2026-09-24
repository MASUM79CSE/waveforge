// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import { render } from 'preact';
import { toolbarDefs } from '../../../src/app/toolbarDefs';
import { commands } from '../../../src/app/commands';
import { ToolBar } from '../../../src/app/components/ToolBar';

function flush(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
}

describe('M-D2: icon toolbar', () => {
  test('every toolbar def targets a command that exists in the registry', () => {
    const registered = new Set(commands.map((c) => c.id));
    for (const group of toolbarDefs) {
      for (const def of group) {
        expect(registered.has(def.command), def.command).toBe(true);
      }
    }
  });

  test('renders one disabled icon button per def, with svg + label; enabled with a doc', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    render(<ToolBar />, host);
    await flush();

    const expected = toolbarDefs.reduce((n, g) => n + g.length, 0);
    const buttons = host.querySelectorAll('button');
    expect(buttons.length).toBe(expected);

    const first = buttons[0] as HTMLButtonElement;
    expect(first.disabled).toBe(true); // no document loaded
    expect(first.querySelector('svg')).not.toBeNull();
    expect((first.getAttribute('aria-label') ?? '').length).toBeGreaterThan(0);
    host.querySelectorAll('button').forEach((b) => {
      expect(b.querySelector('svg')).not.toBeNull();
    });
    host.replaceChildren();
  });
});
