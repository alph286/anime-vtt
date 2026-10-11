import { describe, expect, it } from 'vitest';
import {
  aoeShapeLabel, aoeSizeDimensionLabel, formatMeters, nextCycleColor,
  nudgePayload, resizePayload, rotatePayload,
} from './aoe-ops';
import type { Aoe, ControlLocation } from '../types';

const grid = { enabled: true, cellSize: 50, baseCellSize: 50, divisions: 1, offsetX: 0, offsetY: 0, color: '#fff', lineWidth: 1, opacity: 1 };
const cone: Aoe = { id: 'a', shape: 'cone', color: 'red', x: 50, y: 50, sizeM: 3, rotation: 0, shaderOverride: null };
const line: Aoe = { id: 'b', shape: 'line', color: 'red', x: 50, y: 50, sizeM: 6, widthM: 1.5, rotation: 0, shaderOverride: null };

describe('resizePayload', () => {
  it('cono +1.5: sizeM 4.5 e origine ri-agganciata', () => {
    const p = resizePayload(cone, 1.5, 0, grid, 1000, 1000)!;
    const [x, y] = snapAoeOrigin('cone', 4.5, undefined as unknown as number, 0, grid, 50, 50, 1000, 1000);
    expect(p).toEqual({ aoeId: 'a', sizeM: 4.5, widthM: undefined, x, y });
  });
  it('non scende sotto AOE_METERS_PER_CELL', () => {
    expect(resizePayload(cone, -100, 0, grid, 1000, 1000)!.sizeM).toBe(AOE_METERS_PER_CELL);
  });
  it('widthM cambia solo per la linea', () => {
    expect(resizePayload(cone, 0, 1.5, grid, 1000, 1000)!.widthM).toBeUndefined();
    expect(resizePayload(line, 0, 1.5, grid, 1000, 1000)!.widthM).toBe(3);
    expect(resizePayload(line, 0, -100, grid, 1000, 1000)!.widthM).toBe(AOE_METERS_PER_CELL);
  });
});

describe('rotatePayload', () => {
  it('-15 da 0 -> 345 e ri-aggancia', () => {
    const p = rotatePayload(cone, -15, grid, 1000, 1000);
    const [x, y] = snapAoeOrigin('cone', 3, undefined as unknown as number, 345, grid, 50, 50, 1000, 1000);
    expect(p).toEqual({ aoeId: 'a', rotation: 345, x, y });
  });
  it('+15 da 350 -> 5', () => {
    expect(rotatePayload({ ...cone, rotation: 350 }, 15, grid, 1000, 1000).rotation).toBe(5);
  });
});

function locOf(flip180: boolean): ControlLocation {
  return { id: 'l', name: 'L', archived: false, images: [], map: { flip180, rotate90: false, grid, aoes: [] } } as unknown as ControlLocation;
}

describe('nudgePayload', () => {
  it('griglia disabilitata -> null', () => {
    const l = locOf(false); l.map.grid = { ...grid, enabled: false };
    expect(nudgePayload(cube(), 1, 0, l, 2000, 1000)).toBeNull();
  });
  it('dimensioni naturali 0 -> null', () => {
    expect(nudgePayload(cube(), 1, 0, locOf(false), 0, 0)).toBeNull();
  });
  it('mappa non ruotata: destra sposta x di una cella (50/2000=2.5%)', () => {
    const p = nudgePayload(cube(), 1, 0, locOf(false), 2000, 1000)!;
    expect(p.x).toBeCloseTo(52.5);
    expect(p.y).toBeCloseTo(50);
  });
  it('mappa ruotata 180: "su" schermo aumenta y (5%)', () => {
    const p = nudgePayload(cube(), 0, -1, locOf(true), 2000, 1000)!;
    expect(p.y).toBeGreaterThan(50);
    expect(p.y).toBeCloseTo(55);
  });
});
function cube(): Aoe { return { id: 'c', shape: 'cube', color: 'red', x: 50, y: 50, sizeM: 3, rotation: 0, shaderOverride: null }; }

describe('helper', () => {
  it('nextCycleColor', () => {
    expect(nextCycleColor('red')).toBe('green');
    expect(nextCycleColor('purple')).toBe('red');
    expect(nextCycleColor('yellow')).toBe('red');
  });
  it('label', () => {
    expect(aoeSizeDimensionLabel('sphere')).toBe('Raggio');
    expect(aoeSizeDimensionLabel('cube')).toBe('Lato');
    expect(aoeShapeLabel('cone')).toBe('Cono');
  });
  it('formatMeters', () => {
    expect(formatMeters(1.5)).toBe('1,5');
    expect(formatMeters(3)).toBe('3,0');
  });
});
