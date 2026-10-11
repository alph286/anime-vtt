// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import { clampLocalZoomPan, loadLocalZoom, saveLocalZoom, zoomToRect } from './local-zoom';

describe('local-zoom', () => {
  beforeEach(() => localStorage.clear());

  it('load: assente o corrotto → {1,0,0}', () => {
    expect(loadLocalZoom()).toEqual({ scale: 1, x: 0, y: 0 });
    localStorage.setItem('zoomLocalState', '{rotto');
    expect(loadLocalZoom()).toEqual({ scale: 1, x: 0, y: 0 });
    localStorage.setItem('zoomLocalState', JSON.stringify({ scale: 'x', x: 0, y: 0 }));
    expect(loadLocalZoom()).toEqual({ scale: 1, x: 0, y: 0 });
  });
  it('load: scale fuori range viene clampata a [1,5]', () => {
    localStorage.setItem('zoomLocalState', JSON.stringify({ scale: 99, x: 3, y: 4 }));
    expect(loadLocalZoom()).toEqual({ scale: 5, x: 3, y: 4 });
  });
  it('save/load round-trip', () => {
    saveLocalZoom({ scale: 2, x: 10, y: -5 });
    expect(loadLocalZoom()).toEqual({ scale: 2, x: 10, y: -5 });
  });
  it('clamp: il contenuto non esce dal riquadro', () => {
    expect(clampLocalZoomPan({ scale: 2, x: 9999, y: -9999 }, 200, 100)).toEqual({ scale: 2, x: 100, y: -50 });
    expect(clampLocalZoomPan({ scale: 1, x: 50, y: 50 }, 200, 100)).toEqual({ scale: 1, x: 0, y: 0 });
  });
  it('zoomToRect: contain, centrato, clampato', () => {
    const z = zoomToRect({ left: 50, top: 25, width: 100, height: 50 }, 200, 100)!;
    expect(z.scale).toBe(2);
    expect(z.x).toBeCloseTo(0);
    expect(z.y).toBeCloseTo(0);
  });
  it('zoomToRect: rect nullo o con dimensioni 0 → null', () => {
    expect(zoomToRect({ left: 0, top: 0, width: 0, height: 10 }, 200, 100)).toBeNull();
  });
});
