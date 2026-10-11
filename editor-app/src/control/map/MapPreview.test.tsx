// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MapPreview from './MapPreview';
import { clientToBasePoint, mapRefs } from './map-refs';
import { useControlStore } from '../store/control-store';
import type { ControlState } from '../types';

const GRID = {
  enabled: true, cellSize: 50, baseCellSize: 50, divisions: 1,
  offsetX: 0, offsetY: 0, color: '#fff', lineWidth: 0.4, opacity: 0.8,
};

function loc(id: string, map: Record<string, unknown> = {}) {
  return {
    id, name: id, archived: false, images: [],
    map: {
      file: null, type: 'image', scale: 1, flip180: false, rotate90: false,
      grid: GRID, polygons: [], shaders: [], aoes: [],
      compass: { visible: true, x: 30, y: 70, rotation: 45 },
      ...map,
    },
  };
}
function setServer(over: Record<string, unknown> = {}, map: Record<string, unknown> = {}) {
  const server = {
    activeLocationId: 'L1', activeImageId: null, displayViewport: null,
    locations: [loc('L1', map)], ...over,
  } as unknown as ControlState;
  act(() => useControlStore.getState().receiveState(server));
}
const get = () => useControlStore.getState();

// renderGridSvg gira nella sandbox vm di media.js, che non ha `document`:
// nei test si osservano solo gli argomenti.
const gridGlobal = globalThis as unknown as { renderGridSvg: typeof renderGridSvg };

function fakeSize(w: number, h: number) {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(w);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(h);
}

describe('MapPreview', () => {
  beforeEach(() => {
    localStorage.clear();
    useControlStore.setState({
      server: null, previewLocationId: null, mode: null, tab: 'mappa', fogOpacity: 0.45,
      dmGridOpacity: 0.5, dmGridVisible: true, localZoom: { scale: 1, x: 0, y: 0 },
      geometry: { imageRect: null, rotation: 0, naturalW: 0, naturalH: 0, previewW: 0, previewH: 0 },
    });
  });
  let gridSpy: { mock: { lastCall?: Parameters<typeof renderGridSvg> } };
  beforeEach(() => {
    gridSpy = vi.spyOn(gridGlobal, 'renderGridSvg').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('location senza file: placeholder visibile, imageRect pieno, nessuna eccezione', () => {
    fakeSize(400, 300);
    setServer();
    const { container } = render(<MapPreview />);
    const placeholder = container.querySelector('.map-placeholder') as HTMLElement;
    expect(placeholder.hidden).toBe(false);
    expect(get().geometry.imageRect).toEqual({ left: 0, top: 0, width: 400, height: 300 });
    expect(get().geometry.naturalW).toBe(0);
    expect(get().geometry.previewW).toBe(400);
    expect(mapRefs.preview).toBe(container.querySelector('#map-preview'));
    expect(mapRefs.fitBox).toBe(container.querySelector('.fit-box'));
  });

  it('mantiene la gerarchia dei layer del pannello originale', () => {
    setServer();
    const { container } = render(<MapPreview />);
    const preview = container.querySelector('#map-preview')!;
    expect([...preview.children].map((c) => c.id)).toEqual(['map-local-zoom-wrap', 'viewport-rect', 'map-compass-marker']);
    const fit = container.querySelector('#map-local-zoom-wrap > .media-wrap > .fit-box')!;
    expect([...fit.children].map((c) => c.id)).toEqual([
      'map-img', 'map-video', 'map-placeholder', 'map-shader-canvas', 'map-fog-layer',
      'map-grid-svg', 'map-aoe-shader-canvas', 'map-aoe-svg', 'map-ping-canvas',
    ]);
  });

  it('FogOverlays: un bottone per poligono con clip-path e opacita', () => {
    const points = [[0, 0], [50, 0], [50, 50]];
    setServer({}, {
      polygons: [
        { id: 'p1', name: 'Sala', points, revealed: false },
        { id: 'p2', name: 'Cripta', points, revealed: true },
      ],
    });
    const { container } = render(<MapPreview />);
    const btns = container.querySelectorAll<HTMLButtonElement>('#map-fog-layer > button.fog-overlay');
    expect(btns).toHaveLength(2);
    expect(btns[0].style.clipPath).toBe(polygonClipPath(points as Pt[]));
    expect(btns[0].style.opacity).toBe('0.45');
    expect(btns[0].dataset.id).toBe('p1');
    expect(btns[0].title).toBe('Sala');
    expect(btns[1].classList.contains('revealed')).toBe(true);
    expect(btns[1].style.opacity).toBe('1');
    act(() => get().setFogOpacity(0.7));
    expect(btns[0].style.opacity).toBe('0.7');
  });

  describe('CompassMarker', () => {
    it('in % con translate+rotate fuori da pan', () => {
      setServer();
      const { container } = render(<MapPreview />);
      const m = container.querySelector('#map-compass-marker') as HTMLElement;
      expect(m.hidden).toBe(false);
      expect(m.classList.contains('pinned')).toBe(false);
      expect(m.style.left).toBe('30%');
      expect(m.style.top).toBe('70%');
      expect(m.style.transform).toBe('translate(-50%, -50%) rotate(45deg)');
    });

    it('in pan: .pinned, niente left/top, solo rotate', () => {
      setServer();
      act(() => get().setMode('pan'));
      const { container } = render(<MapPreview />);
      const m = container.querySelector('#map-compass-marker') as HTMLElement;
      expect(m.classList.contains('pinned')).toBe(true);
      expect(m.style.left).toBe('');
      expect(m.style.top).toBe('');
      expect(m.style.transform).toBe('rotate(45deg)');
    });

    it('nascosta se compass.visible falso o con immagine mostrata', () => {
      setServer({}, { compass: { visible: false, x: 0, y: 0, rotation: 0 } });
      const { container, unmount } = render(<MapPreview />);
      expect((container.querySelector('#map-compass-marker') as HTMLElement).hidden).toBe(true);
      unmount();
      setServer({ activeImageId: 'img1' });
      const r2 = render(<MapPreview />);
      expect((r2.container.querySelector('#map-compass-marker') as HTMLElement).hidden).toBe(true);
    });
  });

  describe('ViewportRect', () => {
    const geom = {
      imageRect: { left: 0, top: 0, width: 400, height: 200 }, rotation: 0,
      naturalW: 1000, naturalH: 500, previewW: 400, previewH: 200,
    };

    it('visibile in pan con displayViewport noto', () => {
      setServer({ displayViewport: { width: 1000, height: 500 } }, { file: 'm.png' });
      act(() => get().setMode('pan'));
      const { container } = render(<MapPreview />);
      act(() => get().setGeometry(geom));
      const r = container.querySelector('#viewport-rect') as HTMLElement;
      expect(r.hidden).toBe(false);
      expect(r.style.left).toBe('0px');
      expect(r.style.width).toBe('400px');
      expect(r.style.height).toBe('200px');
    });

    it('nascosto fuori da pan o senza displayViewport', () => {
      setServer({ displayViewport: { width: 1000, height: 500 } }, { file: 'm.png' });
      const { container, unmount } = render(<MapPreview />);
      act(() => get().setGeometry(geom));
      expect((container.querySelector('#viewport-rect') as HTMLElement).hidden).toBe(true);
      unmount();
      setServer({ displayViewport: null }, { file: 'm.png' });
      act(() => get().setMode('pan'));
      const r2 = render(<MapPreview />);
      act(() => get().setGeometry(geom));
      expect((r2.container.querySelector('#viewport-rect') as HTMLElement).hidden).toBe(true);
    });
  });

  it('applica il transform dello zoom locale al wrap', () => {
    setServer();
    const { container } = render(<MapPreview />);
    const wrap = container.querySelector('#map-local-zoom-wrap') as HTMLElement;
    expect(wrap.style.transform).toBe('');
    act(() => get().setLocalZoom({ scale: 2, x: 10, y: -5 }));
    expect(wrap.style.transform).toBe('translate(10px, -5px) scale(2)');
    act(() => get().setLocalZoom({ scale: 1, x: 0, y: 0 }));
    expect(wrap.style.transform).toBe('');
  });

  it('clampa lo zoom ripristinato una sola volta, alla prima misura reale', () => {
    fakeSize(400, 300);
    useControlStore.setState({ localZoom: { scale: 2, x: 1000, y: -1000 } });
    setServer();
    render(<MapPreview />);
    expect(get().localZoom).toEqual({ scale: 2, x: 200, y: -150 });
    expect(localStorage.getItem('zoomLocalState')).toBeNull();
    act(() => get().setLocalZoom({ scale: 2, x: 1000, y: 0 }));
    act(() => get().setGeometry({ ...get().geometry, previewW: 401 }));
    expect(get().localZoom.x).toBe(1000);
  });

  it('griglia: spessore compensato dallo zoom, visibilita e opacita del DM', () => {
    const spy = gridSpy;
    setServer();
    render(<MapPreview />);
    act(() => get().setLocalZoom({ scale: 2, x: 0, y: 0 }));
    let grid = spy.mock.lastCall![1];
    expect(grid.lineWidth).toBeCloseTo(0.2);
    expect(grid.opacity).toBe(0.5);
    expect(grid.enabled).toBe(true);
    act(() => get().toggleDmGridVisible());
    grid = spy.mock.lastCall![1];
    expect(grid.enabled).toBe(false);
  });
});

describe('clientToBasePoint', () => {
  const rect = { left: 10, top: 20, width: 200, height: 100 };
  it('senza rotazione restituisce la percentuale nel fit-box', () => {
    expect(clientToBasePoint(110, 45, rect, 0)).toEqual([50, 25]);
  });
  it('con rotazione riporta allo spazio base', () => {
    expect(clientToBasePoint(110, 45, rect, 90)).toEqual([25, 50]);
  });
  it('rettangolo vuoto: null', () => {
    expect(clientToBasePoint(0, 0, { left: 0, top: 0, width: 0, height: 0 }, 0)).toBeNull();
  });
});
