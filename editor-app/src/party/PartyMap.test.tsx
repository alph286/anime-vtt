// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/socket', () => ({
  socket: { on: vi.fn(), off: vi.fn(), emit: vi.fn(), connected: false },
}));

import { socket } from '@/lib/socket';
import { useControlStore } from '../control/store/control-store';
import type { ControlState } from '../control/types';
import PartyMap from './PartyMap';

if (typeof window.PointerEvent === 'undefined') {
  class PE extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
    }
  }
  (window as unknown as { PointerEvent: typeof PE }).PointerEvent = PE;
}

const GRID = {
  enabled: true, cellSize: 50, baseCellSize: 50, divisions: 1,
  offsetX: 0, offsetY: 0, color: '#fff', lineWidth: 0.4, opacity: 0.8,
};
const NW = 800;
const NH = 600;

function aoe(over: Record<string, unknown> = {}) {
  return { id: 'A', shape: 'cube', color: 'red', x: 25, y: 25, sizeM: 3, rotation: 0, cast: false, shaderOverride: null, ...over };
}
function loc(id: string, map: Record<string, unknown> = {}) {
  return {
    id, name: id, archived: false, images: [],
    map: {
      file: 'm.png', type: 'image', scale: 1, flip180: false, rotate90: false,
      grid: GRID, polygons: [], shaders: [], aoes: [],
      compass: { visible: false, x: 50, y: 50, rotation: 0 },
      liveView: { scale: 1, offsetX: 0, offsetY: 0 },
      ...map,
    },
  };
}
function setServer(map: Record<string, unknown> = {}, over: Record<string, unknown> = {}) {
  const state = {
    activeLocationId: 'L1', activeImageId: null, displayViewport: { width: 1000, height: 500 },
    locations: [loc('L1', map)], ...over,
  } as unknown as ControlState;
  act(() => useControlStore.getState().receiveState(state));
}
const get = () => useControlStore.getState();

function pointer(el: Element, type: string, x: number, y: number, pointerId = 1) {
  act(() => {
    el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId }));
  });
}
const emitsOf = (ev: string) => vi.mocked(socket.emit).mock.calls.filter((c) => c[0] === ev).map((c) => c[1] as Record<string, unknown>);

function mount() {
  const utils = render(<PartyMap />);
  act(() => get().setGeometry({
    imageRect: { left: 0, top: 0, width: 400, height: 300 }, rotation: 0,
    naturalW: NW, naturalH: NH, previewW: 250, previewH: 300,
  }));
  const q = <T extends Element>(s: string) => utils.container.querySelector(s) as T;
  return { ...utils, q, fit: q<HTMLDivElement>('#map-fit-box'), svg: q<SVGSVGElement>('#map-aoe-svg') };
}
const poly = (svg: SVGSVGElement, id = 'A') => svg.querySelector(`.aoe-shape-overlay[data-id="${id}"]`) as SVGPolygonElement;

describe('PartyMap', () => {
  let gridSpy: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(socket.emit).mockClear();
    useControlStore.setState({
      server: null, previewLocationId: null, mode: null, selectedAoeId: null,
      aoeShape: 'cone', aoeColor: 'red', aoeSize: 1.5, aoeWidth: 1.5, aoeShaderOverride: null,
      localZoom: { scale: 1, x: 0, y: 0 }, dmGridOpacity: 0.5, dmGridVisible: true,
      geometry: { imageRect: null, rotation: 0, naturalW: 0, naturalH: 0, previewW: 0, previewH: 0 },
    });
    (HTMLElement.prototype as unknown as { setPointerCapture: unknown }).setPointerCapture = vi.fn();
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(250);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      { left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, x: 0, y: 0, toJSON: () => ({}) } as DOMRect,
    );
    gridSpy = vi.fn();
    vi.spyOn(globalThis as unknown as { renderGridSvg: () => void }, 'renderGridSvg').mockImplementation(gridSpy as never);
    vi.spyOn(globalThis as unknown as { appendAoeOriginMarker: () => void }, 'appendAoeOriginMarker').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('(a) segue il display: --map-aspect e transform scalati di k', () => {
    setServer({ liveView: { scale: 2, offsetX: 40, offsetY: -20 } });
    const { q } = mount();
    // k = 250 / 1000 = 0,25
    expect(q<HTMLElement>('#map-preview').style.getPropertyValue('--map-aspect')).toBe('1000 / 500');
    expect(q<HTMLElement>('#map-layer').style.transform).toBe('translate(10px, -5px) scale(2)');
  });

  it('(b) senza displayViewport (o 0x0) niente transform e niente aspect del viewport', () => {
    for (const vp of [null, { width: 0, height: 0 }]) {
      setServer({ liveView: { scale: 2, offsetX: 40, offsetY: 0 } }, { displayViewport: vp });
      const { q, unmount } = mount();
      expect(q<HTMLElement>('#map-layer').style.transform).toBe('none');
      expect(q<HTMLElement>('#map-preview').style.getPropertyValue('--map-aspect')).toBe('');
      unmount();
    }
  });

  it('(c) griglia: spessore diviso per la scala, opacita di grid.opacity', () => {
    setServer({ scale: 2 });
    mount();
    const last = gridSpy.mock.calls.at(-1)!;
    expect(last[1].lineWidth).toBeCloseTo(0.2);
    expect(last[1].opacity).toBe(0.8);
    expect(last[1].enabled).toBe(true);
  });

  it('(d) fog: solo i poligoni non rivelati, nero pieno', () => {
    const pts = [[0, 0], [50, 0], [50, 50]];
    setServer({ polygons: [{ id: 'p1', revealed: false, points: pts }, { id: 'p2', revealed: true, points: pts }] });
    const { container } = mount();
    const els = container.querySelectorAll<HTMLElement>('.fog-overlay');
    expect(els).toHaveLength(1);
    expect(els[0].style.clipPath).toContain('polygon');
    expect(els[0].style.opacity).toBe('');
  });

  it('(e) tap su area vuota piazza; con immagine mostrata no; tolta, di nuovo si', () => {
    setServer();
    const { fit } = mount();
    pointer(fit, 'pointerdown', 40, 30);
    pointer(fit, 'pointerup', 42, 31);
    expect(emitsOf('aoe:place')).toHaveLength(1);

    setServer({}, { activeImageId: 'img1' });
    pointer(fit, 'pointerdown', 40, 30);
    pointer(fit, 'pointerup', 42, 31);
    expect(emitsOf('aoe:place')).toHaveLength(1);

    setServer({}, { activeImageId: null });
    pointer(fit, 'pointerdown', 40, 30);
    pointer(fit, 'pointerup', 42, 31);
    expect(emitsOf('aoe:place')).toHaveLength(2);
  });

  it('(f) trascinamento interrotto da un\'immagine mostrata: niente altri aoe:move', () => {
    setServer({ aoes: [aoe()] });
    const { fit, svg } = mount();
    pointer(poly(svg), 'pointerdown', 100, 75);
    pointer(fit, 'pointermove', 110, 75);
    expect(emitsOf('aoe:move')).toHaveLength(1);
    setServer({ aoes: [aoe()] }, { activeImageId: 'img1' });
    pointer(fit, 'pointermove', 120, 75);
    expect(emitsOf('aoe:move')).toHaveLength(1);
  });

  it('(g) contorno AOE non compensato dallo zoom e griglia indipendente da dmGridOpacity', () => {
    localStorage.setItem('zoomLocalState', JSON.stringify({ scale: 3, x: 0, y: 0 }));
    useControlStore.setState({ localZoom: { scale: 3, x: 0, y: 0 }, dmGridOpacity: 0.1 });
    act(() => get().resetLocalZoom());
    setServer({ scale: 2, liveView: { scale: 2, offsetX: 0, offsetY: 0 }, aoes: [aoe()] });
    const { svg } = mount();
    expect(poly(svg).style.strokeWidth).toBe('2');
    expect(gridSpy.mock.calls.at(-1)![1].opacity).toBe(0.8);
  });
});
