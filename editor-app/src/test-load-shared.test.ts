import { describe, expect, it } from 'vitest';

describe('globali condivisi caricati da media.js', () => {
  const g = globalThis as Record<string, unknown>;
  const functions = [
    'fitRect', 'computeTotalRotation', 'rotatePointToBase', 'rotateDirectionToBase', 'rotateVector',
    'snapAoeOrigin', 'aoeOutlinePoints', 'aoeAffectedCells', 'cellRectPercent', 'appendAoeOriginMarker',
    'aoeColorHex', 'aoeColorDarkHex', 'polygonClipPath', 'resolveAoeShaderId', 'pointInPolygon',
    'aoePixelsPerMeter',
  ];
  it.each(functions)('%s è una funzione', (name) => {
    expect(typeof g[name]).toBe('function');
  });
  it('AOE_METERS_PER_CELL è un numero', () => {
    expect(typeof g.AOE_METERS_PER_CELL).toBe('number');
  });
  it('AOE_COLOR_CYCLE_NAMES e AOE_SHADER_OVERRIDE_DEFAULT_COLOR sono definiti', () => {
    expect(Array.isArray(g.AOE_COLOR_CYCLE_NAMES)).toBe(true);
    expect(typeof g.AOE_SHADER_OVERRIDE_DEFAULT_COLOR).toBe('object');
  });
});
