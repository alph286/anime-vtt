import { describe, expect, it } from 'vitest';
import { moveId } from './sortable';

describe('moveId', () => {
  it('sposta dopo l’elemento sorvolato', () => {
    expect(moveId(['a', 'b', 'c'], 'a', 'c', false)).toEqual(['b', 'c', 'a']);
  });
  it('sposta prima dell’elemento sorvolato', () => {
    expect(moveId(['a', 'b', 'c'], 'c', 'a', true)).toEqual(['c', 'a', 'b']);
  });
  it('stesso id o id sconosciuto: invariato', () => {
    expect(moveId(['a', 'b'], 'a', 'a', true)).toEqual(['a', 'b']);
    expect(moveId(['a', 'b'], 'x', 'a', true)).toEqual(['a', 'b']);
  });
});
