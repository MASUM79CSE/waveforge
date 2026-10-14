/**
 * PF-02 clip-fade / crossfade COMMAND operations. Dynamically imported by
 * the command registry and the fades dialog so these kernels + history
 * plumbing stay out of the startup bundle (WF-007 budget).
 */
import { crossfadeClips, setClipFades, uncrossfadeClips } from '../engine/clipFadesKernels';
import { clipEdit, selectedClip } from './clipActions';
import { clipArrangement, projectEditor } from './projectActions';
import { projectOpen } from './state';
import { toastInfo } from './toast';
import { t } from '../i18n';
import { closeClipFades, } from './actions';
import { clipFadesOpen, } from './state';
import { TextPromptDialog } from './components/PromptDialog';

const XFADE_DEFAULT_S = 0.01; // reference dialog default: 10 ms

/** PF-02: set the selected clip's fade-in/out (seconds) through the history. */
export function applyClipFadesSelected(fadeInSec: number, fadeOutSec: number): boolean {
  const ed = projectEditor();
  const selection = selectedClip();
  if (!ed || !selection) return false;
  const track = ed.project.tracks.find((t) => t.id === selection.trackId);
  if (!track) return false;
  const sr = ed.project.sampleRate;
  const before = track.clips;
  const after = setClipFades(
    { clips: before },
    selection.clipId,
    Math.round(fadeInSec * sr),
    Math.round(fadeOutSec * sr),
    sr,
  );
  clipEdit(ed, selection.trackId, 'clip fades', before, after);
  return true;
}

/**
 * PF-02: toggle an equal-power crossfade between the selected clip and its
 * adjacent earlier neighbour (reference toggleXfade). Returns the outcome
 * for toasts: 'on' | 'off' | null (nothing crossfadable selected).
 */
export function toggleCrossfadeSelected(): 'on' | 'off' | null {
  const ed = projectEditor();
  const selection = selectedClip();
  if (!ed || !selection) return null;
  const track = ed.project.tracks.find((t) => t.id === selection.trackId);
  const clip = track?.clips.find((c) => c.id === selection.clipId);
  if (!track || !clip) return null;
  const before = track.clips;
  const partnerMarked = before.find((c) => c.xfadeWith === clip.id);
  if (clip.xfadeWith || partnerMarked) {
    const markerOn = clip.xfadeWith ? clip.id : partnerMarked!.id;
    const after = uncrossfadeClips({ clips: before }, markerOn);
    clipEdit(ed, selection.trackId, 'remove crossfade', before, after);
    return 'off';
  }
  const sr = ed.project.sampleRate;
  const assets = new Map(Object.entries(ed.project.assets));
  const want = Math.round(XFADE_DEFAULT_S * sr);
  // Reference parity: the pair may be addressed from either side — the
  // kernel contract takes the LATER clip id, so try next then self.
  const idx = before.findIndex((c) => c.id === clip.id);
  for (const later of [before[idx + 1], idx > 0 ? clip : undefined]) {
    if (!later) continue;
    try {
      const after = crossfadeClips({ clips: before }, later.id, want, assets);
      clipEdit(ed, selection.trackId, 'crossfade clip', before, after);
      return 'on';
    } catch {
      /* not an adjacent partner — try the next candidate */
    }
  }
  return null;
}

/** Current fade lengths (seconds) of the selected clip, for the dialog (lazy chunk). */
export function selectedClipFades(): { fadeInSec: number; fadeOutSec: number } | null {
  const selection = selectedClip();
  const clips = selection ? clipArrangement(selection.trackId) : null;
  const clip = clips?.find((c) => c.id === selection?.clipId);
  if (!selection || !clip) return null;
  const sr = projectEditor()?.project.sampleRate ?? 44100;
  return { fadeInSec: (clip.fadeIn ?? 0) / sr, fadeOutSec: (clip.fadeOut ?? 0) / sr };
}

/** PF-02: clip fades dialog (two numbers via the shared text prompt). */
export function ClipFadesDialog() {
  const open = clipFadesOpen.value;
  const current = open ? selectedClipFades() : null;
  return (
    <TextPromptDialog
      open={open && current !== null}
      title={t().clipFades}
      label={t().clipFadesLabel}
      initialValue={
        current
          ? `${Math.round(current.fadeInSec * 1000)}, ${Math.round(current.fadeOutSec * 1000)}`
          : '0, 0'
      }
      maxLength={40}
      onConfirm={(text) => {
        const parts = text.split(',').map((v) => Number(v.trim()));
        const [a = NaN, b = NaN] = parts;
        if (parts.length === 2 && Number.isFinite(a) && Number.isFinite(b)) {
          // setClipFades clamps negatives + sums
          applyClipFadesSelected(a / 1000, b / 1000);
        } else {
          closeClipFades();
        }
      }}
      onCancel={closeClipFades}
    />
  );
}

/** Command entry: toggle + toast (kept here so the branches stay lazy). */
export function crossfadeFromCommand(): void {
  const res = toggleCrossfadeSelected();
  if (res === 'on') toastInfo(t().clipCrossfadeMenu); // toast text = menu label (parity)
  else if (res === 'off') toastInfo(t().opXfadeOff);
  else if (projectOpen.value) toastInfo(t().clipXfadeNone);
}
