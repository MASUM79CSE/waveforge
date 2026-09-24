/**
 * Undo policy (M8d): the doc and the project keep separate history stacks
 * (AudioEditor / AudioProjectEditor). One user-facing Ctrl+Z chain routes to
 * whichever stack holds the most recent operation. Ties go to the doc —
 * single-document behavior is unchanged when no project op interleaved.
 */
export type UndoTarget = 'doc' | 'project' | null;

export function pickUndoTarget(
  docAt: number,
  projectAt: number,
  docCan: boolean,
  projectCan: boolean,
): UndoTarget {
  if (docCan && projectCan) return projectAt > docAt ? 'project' : 'doc';
  if (docCan) return 'doc';
  if (projectCan) return 'project';
  return null;
}

export function pickRedoTarget(
  docAt: number,
  projectAt: number,
  docCan: boolean,
  projectCan: boolean,
): UndoTarget {
  if (docCan && projectCan) return projectAt > docAt ? 'project' : 'doc';
  if (docCan) return 'doc';
  if (projectCan) return 'project';
  return null;
}
