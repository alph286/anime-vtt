import { describe, expect, it } from 'vitest';
import { OPPOSITE, SHADER_MIN_M, placementFromDrag, rectCorners, resizeFromFixedCorner, stepSize } from './shader-math';

const nw = 1000;
const nh = 500;
const ppm = 50;

describe('placementFromDrag', () => {
  it('converte il rettangolo trascinato in centro e metri', () => {
    expect(placementFromDrag([10, 10], [30, 20], nw, nh, ppm)).toEqual({ x: 20, y: 15, widthM: 4, heightM: 1 });
  });
  it('rispetta la dimensione minima', () => {
    const r = placementFromDrag([10, 10], [10, 10], nw, nh, ppm);
    expect(r.widthM).toBe(SHADER_MIN_M);
    expect(r.heightM).toBe(SHADER_MIN_M);
  });
});
describe('resizeFromFixedCorner', () => {
  it('l’angolo fisso resta fermo', () => {
    expect(resizeFromFixedCorner([10, 10], [30, 20], nw, nh, ppm)).toEqual({ x: 20, y: 15, widthM: 4, heightM: 1 });
  });
  it('funziona trascinando oltre l’angolo fisso', () => {
    const r = resizeFromFixedCorner([10, 10], [5, 2], nw, nh, ppm);
    expect(r.x).toBeCloseTo(7.5);
    expect(r.y).toBeCloseTo(6);
    expect(r.widthM).toBeCloseTo(1);
    expect(r.heightM).toBeCloseTo(0.8);
  });
});
describe('rectCorners/OPPOSITE', () => {
  it('calcola i quattro angoli', () => {
    const c = rectCorners({ leftPct: 10, topPct: 20, widthPct: 30, heightPct: 40 });
    expect(c.nw).toEqual([10, 20]);
    expect(c.se).toEqual([40, 60]);
    expect(c.ne).toEqual([40, 20]);
    expect(c.sw).toEqual([10, 60]);
  });
  it('opposti', () => {
    expect(OPPOSITE.nw).toBe('se');
    expect(OPPOSITE.ne).toBe('sw');
  });
});
describe('stepSize', () => {
  const deco = { widthM: 2, heightM: 0.5 };
  it('aumenta e riduce a passi di 0.5 m, con minimo', () => {
    expect(stepSize(deco, 'w-in')).toEqual({ widthM: 2.5, heightM: 0.5 });
    expect(stepSize(deco, 'w-out')).toEqual({ widthM: 1.5, heightM: 0.5 });
    expect(stepSize(deco, 'h-out')).toEqual({ widthM: 2, heightM: SHADER_MIN_M });
    expect(stepSize(deco, 'h-in')).toEqual({ widthM: 2, heightM: 1 });
  });
});
