import { describe, expect, it } from 'vitest';
import { constrainSquare, gridFromAlignDrag, gridHistoryAfter, nudgeOffsets } from './grid-math';

describe('gridFromAlignDrag', () => {
  it('celle da 100px, nessuno scarto', () => {
    expect(gridFromAlignDrag([10, 10], [20, 20], 1000, 1000, false, 1)).toEqual({
      baseCellSize: 100, divisions: 1, offsetX: 0, offsetY: 0,
    });
  });
  it('calcola lo scarto rispetto all’origine', () => {
    const r = gridFromAlignDrag([10.5, 10.5], [20.5, 20.5], 1000, 1000, false, 1);
    expect(r?.offsetX).toBe(5);
    expect(r?.offsetY).toBe(5);
  });
  it('le divisioni dimezzano la cella effettiva e restano memorizzate', () => {
    const r = gridFromAlignDrag([10.5, 10.5], [20.5, 20.5], 1000, 1000, false, 2);
    expect(r?.baseCellSize).toBe(100);
    expect(r?.divisions).toBe(2);
    expect(r?.offsetX).toBe(5); // 105 % 50
  });
  it('vincolo quadrato usa il lato maggiore', () => {
    const r = gridFromAlignDrag([0, 0], [20, 10], 1000, 1000, true, 1);
    expect(r?.baseCellSize).toBe(200);
  });
  it('trascinamento troppo piccolo → null', () => {
    expect(gridFromAlignDrag([10, 10], [10.2, 10.2], 1000, 1000, false, 1)).toBeNull();
  });
});
describe('constrainSquare', () => {
  it('rende quadrato in pixel, non in percentuale', () => {
    expect(constrainSquare(20, 10, 1000, 500)).toEqual({ width: 20, height: 40 });
  });
});
describe('gridHistoryAfter', () => {
  const before = { enabled: true, cellSize: 100, baseCellSize: 100, divisions: 1, offsetX: 0, offsetY: 0, color: '#fff', lineWidth: 0.3, opacity: 1 };
  it('ricalcola cellSize se cambiano baseCellSize/divisions', () => {
    expect(gridHistoryAfter(before, { baseCellSize: 200, divisions: 2 }).cellSize).toBe(100);
  });
  it('non tocca cellSize per un semplice spostamento', () => {
    const after = gridHistoryAfter(before, { offsetX: 7 });
    expect(after.cellSize).toBe(100);
    expect(after.offsetX).toBe(7);
  });
});
describe('nudgeOffsets', () => {
  it('passo = 10% della cella, minimo 1', () => {
    expect(nudgeOffsets({ cellSize: 100, offsetX: 5, offsetY: 5 }, 1, -1)).toEqual({ offsetX: 15, offsetY: -5 });
    expect(nudgeOffsets({ cellSize: 4, offsetX: 0, offsetY: 0 }, 1, 0)).toEqual({ offsetX: 1, offsetY: 0 });
  });
});
