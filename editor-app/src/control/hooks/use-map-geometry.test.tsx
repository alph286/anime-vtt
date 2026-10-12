// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useControlStore } from '../store/control-store';
import type { ControlState } from '../types';
import { useMapGeometry } from './use-map-geometry';

const GRID = {
  enabled: false, cellSize: 50, baseCellSize: 50, divisions: 1,
  offsetX: 0, offsetY: 0, color: '#fff', lineWidth: 0.4, opacity: 0.8,
};

function refsWithMedia(withMedia: boolean) {
  const preview = document.createElement('div');
  const wrap = document.createElement('div');
  const fit = document.createElement('div');
  Object.defineProperty(preview, 'clientWidth', { value: 400, configurable: true });
  Object.defineProperty(preview, 'clientHeight', { value: 300, configurable: true });
  const media = withMedia ? ({ naturalWidth: 800, naturalHeight: 600 } as unknown as HTMLImageElement) : null;
  return {
    preview: { current: preview }, mediaWrap: { current: wrap }, fitBox: { current: fit },
    media: { current: media },
  };
}

describe('useMapGeometry: opzione aspect', () => {
  beforeEach(() => {
    useControlStore.setState({
      server: null, previewLocationId: null,
      geometry: { imageRect: null, rotation: 0, naturalW: 0, naturalH: 0, previewW: 0, previewH: 0 },
    });
    act(() => useControlStore.getState().receiveState({
      activeLocationId: 'L1', activeImageId: null, displayViewport: { width: 1000, height: 500 },
      locations: [{
        id: 'L1', name: 'L1', archived: false, images: [],
        map: {
          file: 'm.png', type: 'image', scale: 1, flip180: false, rotate90: false, grid: GRID,
          polygons: [], shaders: [], aoes: [], compass: { visible: false, x: 50, y: 50, rotation: 0 },
          liveView: { scale: 1, offsetX: 0, offsetY: 0 },
        },
      }],
    } as unknown as ControlState));
  });
  afterEach(() => vi.restoreAllMocks());

  it('con aspect scrive --map-aspect nel preview (sovrascrive quella del media)', () => {
    const refs = refsWithMedia(true);
    renderHook(() => useMapGeometry(refs, { aspect: '1000 / 500' }));
    expect(refs.preview.current.style.getPropertyValue('--map-aspect')).toBe('1000 / 500');
  });

  it('senza opzione: aspect derivata dal media, nulla se il media manca', () => {
    const withMedia = refsWithMedia(true);
    renderHook(() => useMapGeometry(withMedia));
    expect(withMedia.preview.current.style.getPropertyValue('--map-aspect')).toBe('800 / 600');
    const noMedia = refsWithMedia(false);
    renderHook(() => useMapGeometry(noMedia));
    expect(noMedia.preview.current.style.getPropertyValue('--map-aspect')).toBe('');
  });

  it('un cambio di aspect ricalcola subito', () => {
    const refs = refsWithMedia(false);
    const { rerender } = renderHook(({ a }: { a: string | null }) => useMapGeometry(refs, { aspect: a }), { initialProps: { a: null as string | null } });
    expect(refs.preview.current.style.getPropertyValue('--map-aspect')).toBe('');
    rerender({ a: '16 / 9' });
    expect(refs.preview.current.style.getPropertyValue('--map-aspect')).toBe('16 / 9');
  });
});
