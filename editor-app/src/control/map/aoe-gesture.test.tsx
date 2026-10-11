// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/socket', () => ({
  socket: { on: vi.fn(), off: vi.fn(), emit: vi.fn(), connected: false },
}));

import { socket } from '@/lib/socket';
import MapTab from './MapTab';
import { useControlStore } from '../store/control-store';
import type { ControlState } from '../types';

// jsdom non ha PointerEvent: basta un MouseEvent con pointerId.
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
function setServer(aoes: unknown[] = [], over: Record<string, unknown> = {}) {
  const state = {
    activeLocationId: 'L1', activeImageId: null, displayViewport: { width: 1000, height: 500 },
    locations: [loc('L1', { aoes }), loc('L2')], ...over,
  } as unknown as ControlState;
  act(() => useControlStore.getState().receiveState(state));
}
const get = () => useControlStore.getState();

function pointer(el: Element, type: string, x: number, y: number, pointerId = 1) {
  act(() => {
    el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId }));
  });
}

// Il fit-box occupa 400x300 px a schermo per una mappa 800x600: 1 px client
// = 0,25% in x e 0,333% in y; una cella (50 px naturali) = 25 px client.
function mount() {
  const utils = render(<MapTab />);
  act(() => get().setGeometry({
    imageRect: { left: 0, top: 0, width: 400, height: 300 }, rotation: 0,
    naturalW: NW, naturalH: NH, previewW: 400, previewH: 300,
  }));
  const fit = utils.container.querySelector('#map-fit-box') as HTMLDivElement;
  const svg = utils.container.querySelector('#map-aoe-svg') as SVGSVGElement;
  return { ...utils, fit, svg };
}

const emitsOf = (ev: string) => vi.mocked(socket.emit).mock.calls.filter((c) => c[0] === ev).map((c) => c[1] as Record<string, unknown>);
const poly = (svg: SVGSVGElement, id = 'A') => svg.querySelector(`.aoe-shape-overlay[data-id="${id}"]`) as SVGPolygonElement;

describe('AOE: gesti e overlay', () => {
  let marker: ReturnType<typeof vi.fn<() => void>>;
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(socket.emit).mockClear();
    useControlStore.setState({
      server: null, previewLocationId: null, mode: null, tab: 'mappa', selectedAoeId: null,
      aoeShape: 'cone', aoeColor: 'red', aoeSize: 1.5, aoeWidth: 1.5, aoeShaderOverride: null,
      localZoom: { scale: 1, x: 0, y: 0 },
      geometry: { imageRect: null, rotation: 0, naturalW: 0, naturalH: 0, previewW: 0, previewH: 0 },
    });
    (HTMLElement.prototype as unknown as { setPointerCapture: unknown }).setPointerCapture = vi.fn();
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      { left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, x: 0, y: 0, toJSON: () => ({}) } as DOMRect,
    );
    vi.spyOn(globalThis as unknown as { renderGridSvg: () => void }, 'renderGridSvg').mockImplementation(() => {});
    // appendAoeOriginMarker gira nel contesto vm di media.js, che non ha
    // `document`: stub minimo, si verificano solo gli argomenti.
    marker = vi.fn<() => void>();
    vi.spyOn(globalThis as unknown as { appendAoeOriginMarker: () => void }, 'appendAoeOriginMarker').mockImplementation(marker);
  });
  afterEach(() => vi.restoreAllMocks());

  describe('(a)/(b) tap su area vuota', () => {
    it('tap entro 8 px piazza con i default dello store e origine agganciata', () => {
      setServer();
      const { fit } = mount();
      act(() => get().forceMode('aoe'));
      pointer(fit, 'pointerdown', 40, 30);
      pointer(fit, 'pointerup', 43, 33);
      const places = emitsOf('aoe:place');
      expect(places).toHaveLength(1);
      const [x, y] = snapAoeOrigin('cone', 1.5, undefined as unknown as number, 0, GRID as never, 43 / 4, 33 / 3, NW, NH);
      expect(places[0]).toEqual({
        locationId: 'L1', shape: 'cone', color: 'red', shaderOverride: null, sizeM: 1.5, widthM: undefined, x, y,
      });
    });

    it('widthM definito solo per la linea', () => {
      setServer();
      const { fit } = mount();
      act(() => { get().patchAoeDefaults({ shape: 'line', width: 3, size: 9, color: 'green', shaderOverride: 'web_area' }); get().forceMode('aoe'); });
      pointer(fit, 'pointerdown', 100, 100);
      pointer(fit, 'pointerup', 100, 100);
      const [x, y] = snapAoeOrigin('line', 9, 3, 0, GRID as never, 25, 100 / 3, NW, NH);
      expect(emitsOf('aoe:place')[0]).toEqual({
        locationId: 'L1', shape: 'line', color: 'green', shaderOverride: 'web_area', sizeM: 9, widthM: 3, x, y,
      });
    });

    it('con mappa ruotata di 90 gradi il punto passa da rotatePointToBase', () => {
      setServer();
      const { fit } = mount();
      act(() => { get().setGeometry({ ...get().geometry, rotation: 90 }); get().forceMode('aoe'); });
      pointer(fit, 'pointerdown', 40, 30);
      pointer(fit, 'pointerup', 40, 30);
      const [bx, by] = rotatePointToBase([10, 10], 90);
      const [x, y] = snapAoeOrigin('cone', 1.5, undefined as unknown as number, 0, GRID as never, bx, by, NW, NH);
      expect(emitsOf('aoe:place')[0]).toMatchObject({ x, y });
    });

    it('oltre 8 px di spostamento non piazza nulla', () => {
      setServer();
      const { fit } = mount();
      act(() => get().forceMode('aoe'));
      pointer(fit, 'pointerdown', 40, 30);
      pointer(fit, 'pointerup', 49, 30);
      expect(emitsOf('aoe:place')).toEqual([]);
    });
  });

  describe('(c) trascinamento di un\'area', () => {
    it('seleziona l\'area e accumula il delta non agganciato', () => {
      setServer([aoe()]);
      const { fit, svg } = mount();
      act(() => get().forceMode('aoe'));
      pointer(poly(svg), 'pointerdown', 100, 75);
      expect(get().selectedAoeId).toBe('A');
      expect(HTMLElement.prototype.setPointerCapture).toHaveBeenCalledWith(1);
      // Tre passi da 10 px (2,5% ciascuno, meno di una cella da 6,25%).
      pointer(fit, 'pointermove', 110, 75);
      pointer(fit, 'pointermove', 120, 75);
      pointer(fit, 'pointermove', 130, 75);
      const moves = emitsOf('aoe:move');
      expect(moves).toHaveLength(3);
      const [x, y] = snapAoeOrigin('cube', 3, undefined as unknown as number, 0, GRID as never, 25 + 7.5, 25, NW, NH);
      expect(moves[2]).toEqual({ locationId: 'L1', aoeId: 'A', x, y });
      expect(x).toBeGreaterThan(25);
      // Il primo passo da solo resta sotto la cella: l'aggancio non sposta.
      const [x1] = snapAoeOrigin('cube', 3, undefined as unknown as number, 0, GRID as never, 25, 25, NW, NH);
      expect(moves[0].x).toBe(x1);
      // Il pointerup chiude il drag senza piazzare nulla.
      pointer(fit, 'pointerup', 130, 75);
      expect(emitsOf('aoe:place')).toEqual([]);
    });
  });

  describe('(d) guardie di modalita e disponibilita', () => {
    it('fuori da aoe nessun emit, e il cambio modalita scarta il drag', () => {
      setServer([aoe()]);
      const { fit, svg } = mount();
      act(() => get().forceMode('ping'));
      vi.mocked(socket.emit).mockClear();
      pointer(fit, 'pointerdown', 40, 30);
      pointer(fit, 'pointerup', 40, 30);
      expect(emitsOf('aoe:place')).toEqual([]);

      act(() => get().forceMode('aoe'));
      pointer(poly(svg), 'pointerdown', 100, 75);
      act(() => get().forceMode(null));
      act(() => get().forceMode('aoe'));
      pointer(fit, 'pointermove', 140, 75);
      expect(emitsOf('aoe:move')).toEqual([]);
    });

    it('AOE non disponibile (anteprima di un\'altra location): nessun emit', () => {
      setServer([aoe()]);
      const { fit, svg } = mount();
      act(() => get().forceMode('aoe'));
      pointer(poly(svg), 'pointerdown', 100, 75);
      act(() => useControlStore.setState({ previewLocationId: 'L2' }));
      pointer(fit, 'pointermove', 140, 75);
      pointer(fit, 'pointerdown', 40, 30, 2);
      pointer(fit, 'pointerup', 40, 30, 2);
      act(() => useControlStore.setState({ previewLocationId: 'L1' }));
      // Il drag e stato scartato dal move con AOE non disponibile.
      pointer(fit, 'pointermove', 150, 75);
      expect(emitsOf('aoe:move')).toEqual([]);
      expect(emitsOf('aoe:place')).toEqual([]);
    });
  });

  it('(e) uno state:update remoto durante il drag non lo interrompe', () => {
    setServer([aoe()]);
    const { fit, svg } = mount();
    act(() => get().forceMode('aoe'));
    pointer(poly(svg), 'pointerdown', 100, 75);
    setServer([aoe(), aoe({ id: 'B', x: 70, y: 70 })]);
    pointer(fit, 'pointermove', 130, 75);
    expect(emitsOf('aoe:move')).toHaveLength(1);
    expect(get().mode).toBe('aoe');
  });

  it('(f) pointercancel pulisce drag e inizio tap', () => {
    setServer([aoe()]);
    const { fit, svg } = mount();
    act(() => get().forceMode('aoe'));
    pointer(poly(svg), 'pointerdown', 100, 75);
    pointer(fit, 'pointercancel', 100, 75);
    pointer(fit, 'pointermove', 130, 75);
    expect(emitsOf('aoe:move')).toEqual([]);
    pointer(fit, 'pointerdown', 40, 30);
    pointer(fit, 'pointercancel', 40, 30);
    pointer(fit, 'pointerup', 40, 30);
    expect(emitsOf('aoe:place')).toEqual([]);
  });

  describe('overlay', () => {
    it('area normale: celle sotto con fill-opacity 0.35, contorno scuro sopra', () => {
      setServer([aoe()]);
      const { svg } = mount();
      const cells = [...svg.querySelectorAll('rect.aoe-cell-highlight')];
      expect(cells.length).toBeGreaterThan(0);
      expect(cells[0].getAttribute('fill')).toBe(aoeColorHex('red'));
      expect(cells[0].getAttribute('fill-opacity')).toBe('0.35');
      const p = poly(svg);
      expect(p.getAttribute('stroke')).toBe(aoeColorDarkHex('red'));
      expect(p.getAttribute('fill')).toBe('none');
      // Ordine: tutte le celle prima del contorno.
      expect([...svg.children].indexOf(p)).toBe(cells.length);
      expect(marker).toHaveBeenCalledWith(svg, expect.objectContaining({ id: 'A' }), aoeColorDarkHex('red'), 1.5, NW, NH);
    });

    it('cast o shapeVisible:false: contorno "none" ma celle presenti', () => {
      setServer([aoe({ cast: true }), aoe({ id: 'B', x: 70, y: 70, shapeVisible: false })]);
      const { svg } = mount();
      expect(poly(svg, 'A').getAttribute('stroke')).toBe('none');
      expect(poly(svg, 'B').getAttribute('stroke')).toBe('none');
      expect(svg.querySelectorAll('rect.aoe-cell-highlight').length).toBeGreaterThan(0);
      expect(marker).toHaveBeenCalledWith(svg, expect.objectContaining({ id: 'A' }), 'none', 1.5, NW, NH);
    });

    it('selezione e compensazione dello zoom locale sullo spessore', () => {
      setServer([aoe(), aoe({ id: 'B', x: 70, y: 70 })]);
      const { svg } = mount();
      act(() => { get().selectAoe('A'); useControlStore.setState({ localZoom: { scale: 2, x: 0, y: 0 } }); });
      expect(poly(svg, 'A').getAttribute('class')).toBe('aoe-shape-overlay selected');
      expect(poly(svg, 'A').style.strokeWidth).toBe('1.5');
      expect(poly(svg, 'B').getAttribute('class')).toBe('aoe-shape-overlay');
      expect(poly(svg, 'B').style.strokeWidth).toBe('1');
      expect(marker).toHaveBeenLastCalledWith(svg, expect.objectContaining({ id: 'B' }), aoeColorDarkHex('red'), 0.75, NW, NH);
    });

    it('nessun disegno senza dimensioni naturali', () => {
      setServer([aoe()]);
      const { svg } = mount();
      act(() => get().setGeometry({ ...get().geometry, naturalW: 0, naturalH: 0 }));
      expect(svg.children.length).toBe(0);
    });
  });
});
