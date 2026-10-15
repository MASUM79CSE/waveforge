/**
 * Control Bar v2 (flag `ui.controlBarV2`): the v2 transport row. Zones
 * relocate between the row and the ⋮ panel at measured breakpoints
 * (CB-5.1/CB-D19) — each zone renders exactly once.
 */
import { MenuBar } from '../components/MenuBar';
import { ToolBar } from '../components/ToolBar';
import { TransportZone } from './TransportZone';
import { SelectionZone } from './SelectionZone';
import { TempoZone } from './TempoZone';
import { RecordZoneV2 } from './RecordZoneV2';
import { MasterZoneV2 } from './MasterZoneV2';
import { OverflowZone } from './OverflowZone';
import { rowWidth, TUCK, trackRowWidth } from './rowWidth';

export function ControlBarV2() {
  const w = rowWidth.value;
  const tuck = {
    master: w < TUCK.master,
    record: w < TUCK.record,
    tempo: w < TUCK.tempo,
    selection: w < TUCK.selection,
    tool: w < TUCK.tool,
  };
  return (
    <div class="cb2" data-testid="cb2-root" ref={trackRowWidth}>
      <MenuBar apg />
      <div class="transport cb2-row">
        <TransportZone />
        {!tuck.tool && <ToolBar />}
        {!tuck.selection && <SelectionZone />}
        {!tuck.tempo && <TempoZone />}
        <div class="transport-spacer" />
        {!tuck.record && <RecordZoneV2 />}
        {!tuck.master && <MasterZoneV2 />}
        <OverflowZone tucked={tuck}>
          {tuck.tempo && <TempoZone />}
          {tuck.record && <RecordZoneV2 />}
          {tuck.master && <MasterZoneV2 />}
          {tuck.selection && <SelectionZone />}
        </OverflowZone>
      </div>
    </div>
  );
}
