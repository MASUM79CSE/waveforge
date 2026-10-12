/**
 * P3.8 — golden retrieval corpus (deterministic). Six topics, five
 * segments each (natural phrasing, no keyword stuffing), plus
 * distractor segments that share single words with the topics but are
 * NOT correct answers. Chunked with the production chunker; gold ids
 * are the chunks containing the topic's marker segments.
 */
import type { EvalQuery } from './metrics';

export interface CorpusSegment {
  start: number;
  end: number;
  text: string;
}

const seg = (text: string, i: number): CorpusSegment => ({ start: i * 2, end: i * 2 + 1.9, text });

/** Marker phrases: unique per topic, used to derive gold chunk ids. */
export const MARKERS = {
  peaks: 'draw the waveform peaks into the overview canvas',
  export: 'export the master as a flac file',
  noise: 'noise reduction learns the noise print from silence',
  shortcuts: 'press control z to undo the last edit',
  record: 'arm the track and record from your microphone',
  fade: 'drag the fade handle to shape the clip edges',
} as const;

export type Topic = keyof typeof MARKERS;

export const CORPUS_SEGMENTS: CorpusSegment[] = [
  seg(MARKERS.peaks, 0),
  seg('the overview canvas redraws whenever the zoom level changes', 1),
  seg('peaks are cached so scrolling the timeline stays smooth', 2),
  seg('zoom into the selection with the plus key', 3),
  seg('the ruler shows minutes and seconds at the current zoom', 4),
  seg(MARKERS.export, 5),
  seg('choose a folder and the render finishes with a progress bar', 6),
  seg('flac keeps the quality lossless while shrinking the file size', 7),
  seg('the rendered file name follows the project title', 8),
  seg('metadata like artist and year can be written into the file', 9),
  seg(MARKERS.noise, 10),
  seg('a few seconds of room tone is enough for the noise print', 11),
  seg('apply the learned print to remove steady hiss', 12),
  seg('heavy reduction can leave watery artifacts on voices', 13),
  seg('a gate silences everything below its threshold', 14),
  seg(MARKERS.shortcuts, 15),
  seg('control shift z steps forward again through the history', 16),
  seg('control c copies the current selection to the clipboard', 17),
  seg('every edit lands on the undo stack as a single step', 18),
  seg('the shortcut overlay lists every binding in one place', 19),
  seg(MARKERS.record, 20),
  seg('pick the input device in the recording settings dialog', 21),
  seg('the meter turns red when the input clips', 22),
  seg('recordings land on a new track in the current project', 23),
  seg('monitor with headphones to avoid feedback while recording', 24),
  seg(MARKERS.fade, 25),
  seg('a short fade in removes the click at the start', 26),
  seg('crossfades smooth the joint between two adjacent clips', 27),
  seg('fade curves can be linear or exponential', 28),
  // distractors: share words with topics but are not the answers
  seg('the noise floor meter sits next to the peak meter in the transport', 29),
  seg('export settings remember the last used folder between sessions', 30),
  seg('undo history is capped so memory stays bounded on long sessions', 31),
  seg('the microphone level meter can be docked under the timeline', 32),
  seg('wave shower is not a feature of this application at all', 33),
];

export interface CorpusQuery extends EvalQuery {
  topic: Topic;
}

/** Gold ids are derived from marker → chunk mapping by the harness. */
export const GOLDEN_QUERIES: Array<Omit<CorpusQuery, 'gold'>> = [
  { topic: 'peaks', query: 'how are the waveform peaks drawn' },
  { topic: 'export', query: 'export my master as flac' },
  { topic: 'noise', query: 'remove hiss with noise reduction' },
  { topic: 'shortcuts', query: 'keyboard shortcut to undo an edit' },
  { topic: 'record', query: 'record from my microphone' },
  { topic: 'fade', query: 'add a fade to the clip' },
];
