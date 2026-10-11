// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/socket', () => ({
  socket: { on: vi.fn(), off: vi.fn(), emit: vi.fn(), connected: false },
}));

import { socket } from '@/lib/socket';
import MapTab from './MapTab';
import { useControlStore } from '../store/control-store';
import { panDeltaForDrag } from '../lib/view-math';
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

function loc(id: string, map: Record<string, unknown> = {}) {
  return {
    id, name: id, archived: false, images: [],
    map: {
      file: null, type: 'image', scale: 1, flip180: false, rotate90: false,
      grid: GRID, polygons: [{ id: 'P', name: 'Zona', points: [[0, 0], [50, 0], [50, 50]], revealed: false }],
      shaders: [], aoes: [], compass: { visible: false, x: 50, y: 50, rotation: 0 },
      liveView: { scale: 1, offsetX: 0, offsetY: 0 },
      ...map,
    },
  };
}
function serverState(over: Record<string, unknown> = {}) {
  return {
    activeLocationId: 'L1', activeImageId: null, displayViewport: { width: 1000, height: 500 },
    locations: [loc('L1'), loc('L2')], ...over,
  } as unknown as ControlState;
}
function setServer(over: Record<string, unknown> = {}) {
  act(() => useControlStore.getState().receiveState(serverState(over)));
}
const get = () => useControlStore.getState();

function fakeSize(w: number, h: number) {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(w);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(h);
}

function pointer(el: Element, type: string, x: number, y: number, pointerId = 1) {
  act(() => {
    el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId }));
  });
}

// Geometria "con mappa caricata": il media vero in jsdom non si carica mai.
function setGeometry() {
  act(() => useControlStore.getState().setGeometry({
    imageRect: { left: 0, top: 0, width: 400, height: 300 }, rotation: 0,
    naturalW: 800, naturalH: 600, previewW: 400, previewH: 300,
  }));
}

function mount() {
  const utils = render(<MapTab />);
  const preview = utils.container.querySelector('#map-preview') as HTMLDivElement;
  return { ...utils, preview };
}

const emitMock = () => vi.mocked(socket.emit);
const emitsOf = (ev: string) => emitMock().mock.calls.filter((c) => c[0] === ev);

describe('gesti sulla mappa', () => {
  let capture: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    localStorage.clear();
    emitMock().mockClear();
    useControlStore.setState({
      server: null, previewLocationId: null, mode: null, tab: 'mappa', fogOpacity: 0.45,
      dmGridOpacity: 0.5, dmGridVisible: true, localZoom: { scale: 1, x: 0, y: 0 },
      geometry: { imageRect: null, rotation: 0, naturalW: 0, naturalH: 0, previewW: 0, previewH: 0 },
    });
    capture = vi.fn();
    (HTMLElement.prototype as unknown as { setPointerCapture: unknown }).setPointerCapture = capture;
    (HTMLElement.prototype as unknown as { releasePointerCapture: unknown }).releasePointerCapture = vi.fn();
    vi.spyOn(globalThis as unknown as { renderGridSvg: () => void }, 'renderGridSvg').mockImplementation(() => {});
    fakeSize(400, 300);
  });
  afterEach(() => vi.restoreAllMocks());

  describe('pulsanti modalita', () => {
    it('cinque pulsanti con i title originali; toggle con aria-pressed e classi sul preview', () => {
      setServer();
      const { container, preview } = mount();
      const btns = [...container.querySelectorAll('#map-mode-toggles button')] as HTMLButtonElement[];
      expect(btns.map((b) => b.title)).toEqual([
        'Sposta inquadratura trascinando',
        'Rivela/nascondi fog toccando la mappa',
        'Indica un punto ai giocatori toccando la mappa',
        'Zoom locale (solo per te, non visibile ai giocatori)',
        "Area d'effetto",
      ]);
      act(() => btns[1].click());
      expect(get().mode).toBe('fog');
      expect(btns[1].getAttribute('aria-pressed')).toBe('true');
      expect(preview.classList.contains('mode-fog')).toBe(true);
      act(() => btns[3].click());
      expect(preview.classList.contains('mode-fog')).toBe(false);
      expect(preview.classList.contains('mode-zoom')).toBe(true);
      act(() => btns[3].click());
      expect(get().mode).toBe(null);
      expect(preview.className).toBe('map-preview');
    });

    it('ping e aoe disabilitati in anteprima di un altra location', () => {
      setServer({ locations: [loc('L1', { file: 'm.png' }), loc('L2')] });
      const { container } = mount();
      const btn = (id: string) => container.querySelector(`#${id}`) as HTMLButtonElement;
      expect(btn('ping-mode-toggle').disabled).toBe(false);
      expect(btn('aoe-mode-toggle').disabled).toBe(false);
      act(() => get().setPreviewLocation('L2'));
      expect(btn('ping-mode-toggle').disabled).toBe(true);
      expect(btn('aoe-mode-toggle').disabled).toBe(true);
      expect(btn('pan-mode-toggle').disabled).toBe(false);
    });
  });

  describe('(a) tocco fog', () => {
    it('in modalita fog un click sulla zona emette fow:toggle', () => {
      setServer();
      const { container } = mount();
      act(() => get().forceMode('fog'));
      act(() => (container.querySelector('.fog-overlay[data-id="P"]') as HTMLElement).click());
      expect(emitsOf('fow:toggle')).toEqual([['fow:toggle', { locationId: 'L1', polygonId: 'P' }]]);
    });

    it('usa la location in anteprima, non quella attiva', () => {
      setServer();
      const { container } = mount();
      act(() => { get().setPreviewLocation('L2'); get().forceMode('fog'); });
      act(() => (container.querySelector('.fog-overlay[data-id="P"]') as HTMLElement).click());
      expect(emitsOf('fow:toggle')[0][1]).toEqual({ locationId: 'L2', polygonId: 'P' });
    });

    it('in altre modalita non emette', () => {
      setServer();
      const { container } = mount();
      for (const m of [null, 'pan', 'zoom'] as const) {
        act(() => get().forceMode(m));
        act(() => (container.querySelector('.fog-overlay[data-id="P"]') as HTMLElement).click());
      }
      expect(emitsOf('fow:toggle')).toEqual([]);
    });
  });

  describe('(b) pan', () => {
    it('pointerdown -> move(+10,0) -> up emette view:pan con il delta di panDeltaForDrag', () => {
      setServer();
      const { preview } = mount();
      setGeometry();
      act(() => get().forceMode('pan'));
      pointer(preview, 'pointerdown', 100, 100);
      expect(capture).toHaveBeenCalledWith(1);
      pointer(preview, 'pointermove', 110, 100);
      pointer(preview, 'pointerup', 110, 100);
      const s = get();
      const expected = panDeltaForDrag({
        location: s.server!.locations[0], displayViewport: s.server!.displayViewport,
        naturalW: 800, naturalH: 600, imageRect: s.geometry.imageRect, previewW: 400, previewH: 300,
      }, 10, 0)!;
      expect(emitsOf('view:pan')).toEqual([['view:pan', { locationId: 'L1', dx: expected.dx, dy: expected.dy }]]);
      expect(expected.dx).not.toBe(0);
      // Dopo il pointerup nessun altro movimento emette.
      pointer(preview, 'pointermove', 130, 100);
      expect(emitsOf('view:pan')).toHaveLength(1);
    });

    it('un tocco che parte dai pulsanti modalita non avvia il drag ne cattura il puntatore', () => {
      setServer();
      const { container, preview } = mount();
      setGeometry();
      act(() => get().forceMode('pan'));
      const btn = container.querySelector('#pan-mode-toggle')!;
      pointer(btn, 'pointerdown', 100, 100);
      pointer(preview, 'pointermove', 120, 100);
      expect(capture).not.toHaveBeenCalled();
      expect(emitsOf('view:pan')).toEqual([]);
    });

    it('anche se i pulsanti finissero dentro il preview, il guard closest() regge', () => {
      setServer();
      const { preview } = mount();
      setGeometry();
      act(() => get().forceMode('pan'));
      const fake = document.createElement('div');
      fake.id = 'map-mode-toggles';
      const inner = document.createElement('span');
      fake.appendChild(inner);
      preview.appendChild(fake);
      pointer(inner, 'pointerdown', 100, 100);
      pointer(preview, 'pointermove', 120, 100);
      expect(capture).not.toHaveBeenCalled();
      expect(emitsOf('view:pan')).toEqual([]);
      fake.remove();
    });

    it('senza displayViewport non emette e non lancia', () => {
      setServer({ displayViewport: null });
      const { preview } = mount();
      setGeometry();
      act(() => get().forceMode('pan'));
      expect(() => {
        pointer(preview, 'pointerdown', 100, 100);
        pointer(preview, 'pointermove', 110, 100);
        pointer(preview, 'pointerup', 110, 100);
      }).not.toThrow();
      expect(emitsOf('view:pan')).toEqual([]);
    });

    it('fuori da pan il pointerdown non avvia nulla', () => {
      setServer();
      const { preview } = mount();
      setGeometry();
      pointer(preview, 'pointerdown', 100, 100);
      pointer(preview, 'pointermove', 110, 100);
      expect(capture).not.toHaveBeenCalled();
      expect(emitsOf('view:pan')).toEqual([]);
    });
  });

  describe('(c) zoom locale', () => {
    it('pinch: distanza x2 porta scale da 1 a 2; salvato solo a fine gesto', () => {
      setServer();
      const { preview } = mount();
      act(() => get().forceMode('zoom'));
      pointer(preview, 'pointerdown', 150, 150, 1);
      expect(preview.classList.contains('zoom-dragging')).toBe(true);
      pointer(preview, 'pointerdown', 250, 150, 2);
      pointer(preview, 'pointermove', 50, 150, 1);
      pointer(preview, 'pointermove', 350, 150, 2); // 100 -> 300: x3, ma prima x2
      // Primo move: dist (250-50)=200 -> x2; secondo: 300 -> x3.
      expect(get().localZoom.scale).toBe(3);
      pointer(preview, 'pointermove', 50, 150, 2); // dist 0 -> clamp a 1
      expect(get().localZoom.scale).toBe(1);
      pointer(preview, 'pointermove', 250, 150, 2); // dist 200 -> x2
      expect(get().localZoom.scale).toBe(2);
      expect(localStorage.getItem('zoomLocalState')).toBeNull();
      pointer(preview, 'pointerup', 250, 150, 2);
      expect(localStorage.getItem('zoomLocalState')).toBeNull();
      pointer(preview, 'pointerup', 50, 150, 1);
      expect(JSON.parse(localStorage.getItem('zoomLocalState')!)).toEqual(get().localZoom);
      expect(get().localZoom.scale).toBe(2);
      expect(preview.classList.contains('zoom-dragging')).toBe(false);
    });

    it('pinch clampato a 5', () => {
      setServer();
      const { preview } = mount();
      act(() => get().forceMode('zoom'));
      pointer(preview, 'pointerdown', 190, 150, 1);
      pointer(preview, 'pointerdown', 210, 150, 2);
      pointer(preview, 'pointermove', 400, 150, 2);
      expect(get().localZoom.scale).toBe(5);
    });

    it('con scale===1 un drag singolo non cambia x,y', () => {
      setServer();
      const { preview } = mount();
      act(() => get().forceMode('zoom'));
      pointer(preview, 'pointerdown', 100, 100);
      pointer(preview, 'pointermove', 160, 140);
      pointer(preview, 'pointerup', 160, 140);
      expect(get().localZoom).toEqual({ scale: 1, x: 0, y: 0 });
    });

    it('con scale>1 il drag sposta x,y, clampato', () => {
      setServer();
      act(() => get().setLocalZoom({ scale: 2, x: 0, y: 0 }));
      const { preview } = mount();
      act(() => get().forceMode('zoom'));
      pointer(preview, 'pointerdown', 100, 100);
      pointer(preview, 'pointermove', 130, 120);
      expect(get().localZoom).toEqual({ scale: 2, x: 30, y: 20 });
      pointer(preview, 'pointermove', 1000, 1000); // max: 200 x 150
      expect(get().localZoom).toEqual({ scale: 2, x: 200, y: 150 });
    });

    it('rotellina: +0.1, preventDefault, salvata', () => {
      setServer();
      const { preview } = mount();
      act(() => get().forceMode('zoom'));
      const ev = new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true });
      act(() => { preview.dispatchEvent(ev); });
      expect(ev.defaultPrevented).toBe(true);
      expect(get().localZoom.scale).toBe(1.1);
      expect(JSON.parse(localStorage.getItem('zoomLocalState')!).scale).toBe(1.1);
      act(() => { preview.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true })); });
      expect(get().localZoom.scale).toBe(1);
    });

    it('listener wheel registrato con passive:false', () => {
      const spy = vi.spyOn(HTMLElement.prototype, 'addEventListener');
      setServer();
      const { preview } = mount();
      const i = spy.mock.calls.findIndex((c, k) => c[0] === 'wheel' && spy.mock.contexts[k] === preview);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(spy.mock.calls[i][2]).toMatchObject({ passive: false });
    });

    it('fuori da zoom la rotellina non fa nulla', () => {
      setServer();
      const { preview } = mount();
      const ev = new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true });
      act(() => { preview.dispatchEvent(ev); });
      expect(ev.defaultPrevented).toBe(false);
      expect(get().localZoom.scale).toBe(1);
    });
  });

  describe('(d) cambio modalita a meta gesto', () => {
    it('forceMode(null) durante un drag di pan: un pointermove successivo non emette', () => {
      setServer();
      const { preview } = mount();
      setGeometry();
      act(() => get().forceMode('pan'));
      pointer(preview, 'pointerdown', 100, 100);
      act(() => get().forceMode(null));
      pointer(preview, 'pointermove', 120, 100);
      act(() => get().forceMode('pan'));
      pointer(preview, 'pointermove', 140, 100);
      expect(emitsOf('view:pan')).toEqual([]);
    });

    it('uscire da zoom a meta gesto azzera puntatori e classe zoom-dragging', () => {
      setServer();
      act(() => get().setLocalZoom({ scale: 2, x: 0, y: 0 }));
      const { preview } = mount();
      act(() => get().forceMode('zoom'));
      pointer(preview, 'pointerdown', 100, 100);
      act(() => get().forceMode(null));
      expect(preview.classList.contains('zoom-dragging')).toBe(false);
      act(() => get().forceMode('zoom'));
      pointer(preview, 'pointermove', 150, 150);
      expect(get().localZoom).toEqual({ scale: 2, x: 0, y: 0 });
    });
  });

  describe('(e) aggiornamento remoto durante il drag', () => {
    it('state:update a meta pan non interrompe il gesto', () => {
      setServer();
      const { preview } = mount();
      setGeometry();
      act(() => get().forceMode('pan'));
      pointer(preview, 'pointerdown', 100, 100);
      pointer(preview, 'pointermove', 110, 100);
      setServer({ locations: [loc('L1', { liveView: { scale: 1, offsetX: 5, offsetY: 0 } }), loc('L2')] });
      pointer(preview, 'pointermove', 120, 100);
      expect(emitsOf('view:pan')).toHaveLength(2);
    });

    it('state:update a meta pinch non interrompe il gesto', () => {
      setServer();
      const { preview } = mount();
      act(() => get().forceMode('zoom'));
      pointer(preview, 'pointerdown', 150, 150, 1);
      pointer(preview, 'pointerdown', 250, 150, 2);
      setServer({ locations: [loc('L1', { liveView: { scale: 1, offsetX: 5, offsetY: 0 } }), loc('L2')] });
      pointer(preview, 'pointermove', 350, 150, 2);
      expect(get().localZoom.scale).toBe(2);
    });
  });
  describe('(f) ping', () => {
    function fitBox(container: HTMLElement) {
      return container.querySelector('#map-fit-box') as HTMLDivElement;
    }
    beforeEach(() => {
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
        { left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, x: 0, y: 0, toJSON: () => ({}) } as DOMRect,
      );
    });
    const pings = () => emitsOf('ping:show').map((c) => c[1] as { locationId: string; x: number; y: number; strokeId: string });

    it('tap: un solo emit con locationId, coordinate in % e strokeId; capture sul fit-box', () => {
      setServer();
      const { container } = mount();
      act(() => get().forceMode('ping'));
      const fit = fitBox(container);
      pointer(fit, 'pointerdown', 40, 30);
      pointer(fit, 'pointerup', 40, 30);
      expect(pings()).toHaveLength(1);
      const p = pings()[0];
      expect(p.locationId).toBe('L1');
      expect(p.x).toBeCloseTo(10);
      expect(p.y).toBeCloseTo(10);
      expect(typeof p.strokeId).toBe('string');
      expect(capture).toHaveBeenCalledTimes(1);
      expect(capture.mock.instances[0]).toBe(fit);
    });

    it('drag: emette solo oltre 1.5% dall ultimo punto emesso, stesso strokeId', () => {
      setServer();
      const { container } = mount();
      act(() => get().forceMode('ping'));
      const fit = fitBox(container);
      pointer(fit, 'pointerdown', 40, 30);
      pointer(fit, 'pointermove', 44, 30); // +1% -> no
      pointer(fit, 'pointermove', 46, 30); // +1.5% dal down -> si
      pointer(fit, 'pointermove', 50, 30); // +1% dall ultimo emesso -> no
      pointer(fit, 'pointermove', 60, 30); // +3.5% -> si
      pointer(fit, 'pointerup', 60, 30);
      pointer(fit, 'pointermove', 100, 30); // dopo up: nulla
      const ps = pings();
      expect(ps.map((p) => Math.round(p.x * 10) / 10)).toEqual([10, 11.5, 15]);
      expect(new Set(ps.map((p) => p.strokeId)).size).toBe(1);
    });

    it('un nuovo gesto ha uno strokeId diverso', () => {
      setServer();
      const { container } = mount();
      act(() => get().forceMode('ping'));
      const fit = fitBox(container);
      pointer(fit, 'pointerdown', 40, 30);
      pointer(fit, 'pointerup', 40, 30);
      pointer(fit, 'pointerdown', 42, 30);
      pointer(fit, 'pointerup', 42, 30);
      const ps = pings();
      expect(ps).toHaveLength(2);
      expect(ps[0].strokeId).not.toBe(ps[1].strokeId);
    });

    it('fuori da ping o con ping non disponibile non emette', () => {
      setServer();
      const { container } = mount();
      const fit = fitBox(container);
      pointer(fit, 'pointerdown', 40, 30);
      pointer(fit, 'pointerup', 40, 30);
      // Anteprima di un'altra location (mode forzato a ping per testare la guardia del gesto).
      act(() => useControlStore.setState({ mode: 'ping', previewLocationId: 'L2' }));
      pointer(fit, 'pointerdown', 40, 30);
      pointer(fit, 'pointerup', 40, 30);
      // Immagine mostrata al posto della mappa.
      setServer({ activeImageId: 'IMG' });
      act(() => useControlStore.setState({ mode: 'ping', previewLocationId: 'L1' }));
      pointer(fit, 'pointerdown', 40, 30);
      expect(pings()).toEqual([]);
      expect(capture).not.toHaveBeenCalled();
    });

    it('cambio modalita a meta gesto non lascia drag appesi', () => {
      setServer();
      const { container } = mount();
      act(() => get().forceMode('ping'));
      const fit = fitBox(container);
      pointer(fit, 'pointerdown', 40, 30);
      act(() => get().forceMode(null));
      act(() => get().forceMode('ping'));
      pointer(fit, 'pointermove', 100, 30);
      expect(pings()).toHaveLength(1);
    });
  });
});
