import { describe, expect, it } from 'vitest';
import { followsDisplay, gridLineWidth, liveTransform, transformCss } from './follow-math';

describe('follow-math', () => {
  it('followsDisplay richiede larghezza e altezza non nulle', () => {
    expect(followsDisplay({ width: 1920, height: 1080 })).toBe(true);
    expect(followsDisplay({ width: 0, height: 1080 })).toBe(false);
    expect(followsDisplay(null)).toBe(false);
    expect(followsDisplay(undefined)).toBe(false);
  });
  it('senza viewport noto non c\'è transform (mappa intera)', () => {
    expect(liveTransform({ scale: 2, liveView: { scale: 3, offsetX: 5, offsetY: 5 } }, null, 400)).toBeNull();
    expect(transformCss(null)).toBe('none');
  });
  it('gli offset si scalano di k = boxWidth/viewport.width, lo zoom no', () => {
    const t = liveTransform({ scale: 2, liveView: { scale: 1.5, offsetX: 100, offsetY: -50 } }, { width: 1000, height: 500 }, 250);
    expect(t).toEqual({ offsetX: 25, offsetY: -12.5, scale: 3 });
    expect(transformCss(t)).toBe('translate(25px, -12.5px) scale(3)');
  });
  it('liveView e scale mancanti valgono 1 / 0', () => {
    expect(liveTransform({}, { width: 100, height: 100 }, 100)).toEqual({ offsetX: 0, offsetY: 0, scale: 1 });
    expect(liveTransform(undefined, { width: 100, height: 100 }, 100)).toEqual({ offsetX: 0, offsetY: 0, scale: 1 });
  });
  it('gridLineWidth divide per lo zoom e non scende sotto 0,01', () => {
    expect(gridLineWidth(0.4, 2)).toBeCloseTo(0.2);
    expect(gridLineWidth(undefined, 1)).toBeCloseTo(0.3);
    expect(gridLineWidth(0.3, 0)).toBeCloseTo(30);
  });
});
