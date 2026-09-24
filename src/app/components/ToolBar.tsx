/**
 * Icon toolbar (D2) — AudioMass-style quick actions bound to the command
 * registry. Labels + shortcut hints resolve from `commands` (single source
 * of truth); buttons disable without a document, exactly like the menus.
 */
import { Fragment } from 'preact';
import { commands, runCommand } from '../commands';
import { docInfo } from '../state';
import { toolbarDefs } from '../toolbarDefs';
import { Icon } from './icons';

const byId = new Map(commands.map((c) => [c.id, c]));

function titleFor(command: string): string {
  const cmd = byId.get(command);
  if (!cmd) return command;
  const kbd = cmd.kbd?.();
  return kbd ? `${cmd.label()} (${kbd})` : cmd.label();
}

export function ToolBar() {
  const enabled = docInfo.value !== null;
  return (
    <div class="toolbar" role="toolbar" aria-label="Quick tools">
      {toolbarDefs.map((group, gi) => (
        <Fragment key={gi}>
          {gi > 0 && <span class="toolbar-sep" aria-hidden="true" />}
          <div class="toolbar-group">
            {group.map((def) => (
              <button
                key={def.command}
                class="toolbtn"
                title={titleFor(def.command)}
                aria-label={titleFor(def.command)}
                disabled={!enabled}
                onClick={() => runCommand(def.command)}
              >
                <Icon name={def.icon} />
              </button>
            ))}
          </div>
        </Fragment>
      ))}
    </div>
  );
}
