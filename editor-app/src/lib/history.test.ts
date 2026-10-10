import { describe, expect, it, vi } from 'vitest';
import {
  HISTORY_LIMIT, addPoint, emptyDraft, emptyHistory, pushEntry, redoPoint, stepRedo, stepUndo, undoPoint,
} from './history';

const entry = (label: string) => ({ label, undo: vi.fn(), redo: vi.fn() });

describe('storico globale', () => {
  it('push azzera il ripeti', () => {
    const a = entry('a');
    const b = entry('b');
    let h = pushEntry(emptyHistory(), a);
    h = stepUndo(h).history; // a passa in redo
    expect(h.redo).toHaveLength(1);
    h = pushEntry(h, b);
    expect(h.undo).toEqual([b]);
    expect(h.redo).toEqual([]);
  });

  it('scarta la voce più vecchia oltre il limite', () => {
    let h = emptyHistory();
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) h = pushEntry(h, entry(String(i)));
    expect(h.undo).toHaveLength(HISTORY_LIMIT);
    expect(h.undo[0].label).toBe('5');
  });

  it('stepUndo su storico vuoto non cambia nulla', () => {
    const h = emptyHistory();
    const res = stepUndo(h);
    expect(res.entry).toBeNull();
    expect(res.history).toBe(h);
  });

  it('stepUndo e stepRedo spostano la voce tra le pile', () => {
    const a = entry('a');
    let h = pushEntry(emptyHistory(), a);
    const u = stepUndo(h);
    expect(u.entry).toBe(a);
    expect(u.history.undo).toEqual([]);
    expect(u.history.redo).toEqual([a]);
    const r = stepRedo(u.history);
    expect(r.entry).toBe(a);
    expect(r.history.undo).toEqual([a]);
    expect(r.history.redo).toEqual([]);
  });
});

describe('bozza poligono', () => {
  it('addPoint azzera il ripeti locale', () => {
    let d = addPoint(emptyDraft(), [1, 1]);
    d = addPoint(d, [2, 2]);
    d = undoPoint(d);
    expect(d.redo).toEqual([[2, 2]]);
    d = addPoint(d, [3, 3]);
    expect(d.points).toEqual([[1, 1], [3, 3]]);
    expect(d.redo).toEqual([]);
  });

  it('undoPoint e redoPoint sono simmetrici', () => {
    let d = addPoint(addPoint(emptyDraft(), [1, 1]), [2, 2]);
    d = undoPoint(d);
    d = redoPoint(d);
    expect(d.points).toEqual([[1, 1], [2, 2]]);
  });

  it('su bozza vuota undoPoint/redoPoint non cambiano nulla', () => {
    const d = emptyDraft();
    expect(undoPoint(d)).toBe(d);
    expect(redoPoint(d)).toBe(d);
  });
});
