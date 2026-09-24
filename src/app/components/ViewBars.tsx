/**
 * D5 view controls (AudioMass parity):
 *  - ZoomBar: floating bottom-left group — horizontal ±/reset + vertical ±
 *  - BeatBar: control-row group — BEAT markers toggle, SNAP toggle, BPM readout
 */
import { runCommand } from '../commands';
import { beatsShown, bpmResult, snapToBeat, vzoom, VZOOM_MAX, VZOOM_MIN, setVZoom } from '../state';
import { toggleBeatsShown } from '../analysisActions';

function stepVZoom(dir: 1 | -1): void {
  const step = dir > 0 ? 1.25 : 1 / 1.25;
  setVZoom(vzoom.value * step);
}

export function ZoomBar() {
  return (
    <div class="zoombar" role="toolbar" aria-label="Zoom">
      <button
        class="toolbtn"
        data-tip="Zoom In Horiz (+)"
        aria-label="Zoom In Horiz (+)"
        onClick={() => runCommand('view.zoomIn')}
      >
        +
      </button>
      <button
        class="toolbtn"
        data-tip="Zoom Out Horiz (-)"
        aria-label="Zoom Out Horiz (-)"
        onClick={() => runCommand('view.zoomOut')}
      >
        −
      </button>
      <button
        class="toolbtn"
        data-tip="Reset Zoom (0)"
        aria-label="Reset Zoom (0)"
        onClick={() => runCommand('view.zoomReset')}
      >
        R
      </button>
      <span class="zoombar-sep" aria-hidden="true" />
      <button
        class="toolbtn"
        data-tip="Zoom In Vertically"
        aria-label="Zoom In Vertically"
        disabled={vzoom.value >= VZOOM_MAX - 1e-9}
        onClick={() => stepVZoom(1)}
      >
        ↕+
      </button>
      <button
        class="toolbtn"
        data-tip="Zoom Out Vertically"
        aria-label="Zoom Out Vertically"
        disabled={vzoom.value <= VZOOM_MIN + 1e-9}
        onClick={() => stepVZoom(-1)}
      >
        ↕−
      </button>
      <span class="zoombar-val" title="Vertical zoom">{vzoom.value.toFixed(2)}×</span>
    </div>
  );
}

export function BeatBar() {
  const bpmText = bpmResult.value ? bpmResult.value.bpm.toFixed(1) : '-';

  return (
    <div class="toolbar-group beatbar" role="group" aria-label="Beat grid">
      <button
        class={`flagbtn ${beatsShown.value ? 'on' : ''}`}
        aria-pressed={beatsShown.value}
        title="Toggle beat markers"
        onClick={() => toggleBeatsShown()}
      >
        <span class="flag">BEAT</span>
      </button>
      <button
        class={`flagbtn ${snapToBeat.value ? 'on' : ''}`}
        aria-pressed={snapToBeat.value}
        title="Snap selection edges to beat markers"
        onClick={() => {
          snapToBeat.value = !snapToBeat.value;
        }}
      >
        <span class="flag">SNAP</span>
      </button>
      <span class="beat-bpm" title="Detected tempo (Analyze → BPM)">
        <span class="sel-label">BPM</span>
        <span class="sel-val">{bpmText}</span>
      </span>
    </div>
  );
}
