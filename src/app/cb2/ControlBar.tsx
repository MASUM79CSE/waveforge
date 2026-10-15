/**
 * Control Bar v2 shell (CB-2.1): one header row — menu bar, the v2 APG
 * transport zone, the v1 zone components that migrate in Phases 3–4
 * (carried verbatim so every control stays reachable at every commit),
 * and the overflow menu. Mounted only when the ui.controlBarV2 flag is ON.
 */
import { MenuBar } from '../components/MenuBar';
import { ToolBar } from '../components/ToolBar';
import { TransportZone } from './TransportZone';
import { SelectionZone } from './SelectionZone';
import { TempoZone } from './TempoZone';
import { RecordZoneV2 } from './RecordZoneV2';
import { MasterZoneV2 } from './MasterZoneV2';
import { OverflowZone } from './OverflowZone';

export function ControlBarV2() {
  return (
    <div class="cb2" data-testid="cb2-root">
      <MenuBar apg />
      {/* .transport supplies the v1 zone layout; .cb2-row (loaded after
          app.css) overrides the hidden-scrollbar pattern with a visible
          affordance (F-01). */}
      <div class="transport cb2-row">
        <TransportZone />
        <ToolBar />
        <SelectionZone />
        <TempoZone />
        <div class="transport-spacer" />
        <RecordZoneV2 />
        <MasterZoneV2 />
        <OverflowZone />
      </div>
    </div>
  );
}
