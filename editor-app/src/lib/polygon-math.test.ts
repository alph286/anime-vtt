import { describe, expect, it } from 'vitest';
import { polygonMoved, removeVertex, sortPolygonIdsByName, translatePolygon } from './polygon-math';
import type { Point } from '@/types';

describe('translatePolygon', () => {
  it('trasla e limita ai bordi 0..100', () => {
    const original: Point[] = [[10, 10], [95, 50], [50, 90]];
    expect(translatePolygon(original, 20, -30)).toEqual([[30, 0], [100, 20], [70, 60]]);
  });
  it('non muta l’originale', () => {
    const original: Point[] = [[10, 10]];
    translatePolygon(original, 5, 5);
    expect(original).toEqual([[10, 10]]);
  });
});
describe('removeVertex', () => {
  it('rifiuta se restano meno di 3 punti', () => {
    expect(removeVertex([[0, 0], [1, 1], [2, 2]], 0)).toBeNull();
  });
  it('rimuove il punto richiesto', () => {
    expect(removeVertex([[0, 0], [1, 1], [2, 2], [3, 3]], 1)).toEqual([[0, 0], [2, 2], [3, 3]]);
  });
});
describe('polygonMoved', () => {
  it('rileva spostamento e assenza di spostamento', () => {
    expect(polygonMoved([[1, 1]], [[1, 1]])).toBe(false);
    expect(polygonMoved([[1, 1]], [[1, 2]])).toBe(true);
  });
});
describe('sortPolygonIdsByName', () => {
  it('ordina in italiano con numeri naturali', () => {
    const ids = sortPolygonIdsByName([
      { id: 'a', name: 'Area 10' }, { id: 'b', name: 'Area 2' }, { id: 'c', name: 'area 1' },
    ]);
    expect(ids).toEqual(['c', 'b', 'a']);
  });
});
