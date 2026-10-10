import type { Point } from '@/types';

export interface HistoryEntry { label: string; undo: () => void; redo: () => void }
export interface HistoryState { undo: HistoryEntry[]; redo: HistoryEntry[] }
export const HISTORY_LIMIT = 50;

export const emptyHistory = (): HistoryState => ({ undo: [], redo: [] });

export function pushEntry(h: HistoryState, entry: HistoryEntry, limit = HISTORY_LIMIT): HistoryState {
  const undo = [...h.undo, entry];
  if (undo.length > limit) undo.shift();
  return { undo, redo: [] };
}

export function stepUndo(h: HistoryState): { history: HistoryState; entry: HistoryEntry | null } {
  const entry = h.undo[h.undo.length - 1];
  if (!entry) return { history: h, entry: null };
  return { history: { undo: h.undo.slice(0, -1), redo: [...h.redo, entry] }, entry };
}

export function stepRedo(h: HistoryState): { history: HistoryState; entry: HistoryEntry | null } {
  const entry = h.redo[h.redo.length - 1];
  if (!entry) return { history: h, entry: null };
  return { history: { undo: [...h.undo, entry], redo: h.redo.slice(0, -1) }, entry };
}

export interface Draft { points: Point[]; redo: Point[] }
export const emptyDraft = (): Draft => ({ points: [], redo: [] });

export function addPoint(d: Draft, p: Point): Draft {
  return { points: [...d.points, p], redo: [] };
}

export function undoPoint(d: Draft): Draft {
  if (!d.points.length) return d;
  return { points: d.points.slice(0, -1), redo: [...d.redo, d.points[d.points.length - 1]] };
}

export function redoPoint(d: Draft): Draft {
  if (!d.redo.length) return d;
  return { points: [...d.points, d.redo[d.redo.length - 1]], redo: d.redo.slice(0, -1) };
}
