/**
 * Help → Keyboard Shortcuts overlay (D6) — AudioMass-parity discoverability:
 * every binding in one place, legacy shift-letter layer included.
 */
import { shortcutCatalog } from '../shortcutCatalog';
import { closeShortcuts } from '../actions';
import { shortcutsOpen } from '../state';
import { Modal } from './Modal';

export function ShortcutsOverlay() {
  if (!shortcutsOpen.value) return null;
  return (
    <Modal title="Keyboard Shortcuts" onClose={closeShortcuts}>
      <div class="shortcuts">
        {shortcutCatalog.map((group) => (
          <div class="shortcuts-group" key={group.title}>
            <h3 class="shortcuts-title">{group.title}</h3>
            <table class="shortcuts-table">
              <tbody>
                {group.rows.map((row) => (
                  <tr key={row.key}>
                    <td class="shortcuts-key">
                      <kbd>{row.key}</kbd>
                    </td>
                    <td class="shortcuts-label">{row.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </Modal>
  );
}
