// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/socket', () => ({
  socket: { on: vi.fn(), off: vi.fn(), emit: vi.fn(), connected: false },
}));

import { socket } from '@/lib/socket';
import MapTab from '../map/MapTab';
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
      grid: GRID,
      polygons: [
        { id: 'P1', name: 'A', points: [[0, 0], [50, 0], [50, 50]], revealed: true },
        { id: 'P2', name: 'B', points: [[0, 0], [50, 0], [50, 50]], revealed: false },
        { id: 'P3', name: 'C', points: [[0, 0], [50, 0], [50, 50]], revealed: false },
      ],
      shaders: [], aoes: [], compass: { visible: false, x: 50, y: 50, rotation: 270 },
      liveView: { scale: 2, offsetX: 0, offsetY: 0 },
      ...map,
    },
  };
}
function setServer(over: Record<string, unknown> = {}, map: Record<string, unknown> = {}) {
  act(() => useControlStore.getState().receiveState({
    activeLocationId: 'L1', activeImageId: null, displayViewport: { width: 1000, height: 500 },
    locations: [loc('L1', map)], ...over,
  } as unknown as ControlState));
}
const get = () => useControlStore.getState();
const emit = () => vi.mocked(socket.emit);
const emitsOf = (ev: string) => emit().mock.calls.filter((c) => c[0] === ev);
const click = (el: Element) => act(() => (el as HTMLElement).click());
const btn = (title: string) => screen.getByTitle(title);

beforeEach(() => {
  vi.spyOn(globalThis as unknown as { renderGridSvg: () => void }, 'renderGridSvg').mockImplementation(() => {});
  localStorage.clear();
  emit().mockClear();
  useControlStore.setState({
    server: null, previewLocationId: null, mode: null, fogOpacity: 0.45,
    dmGridOpacity: 0.5, dmGridVisible: true, localZoom: { scale: 1, x: 0, y: 0 },
    geometry: { imageRect: null, rotation: 0, naturalW: 0, naturalH: 0, previewW: 0, previewH: 0 },
  });
});

describe('un solo box per modalita', () => {
  it('nessun box senza modalita; ognuna mostra solo il proprio', () => {
    setServer();
    render(<MapTab />);
    const titles = () => ['Controlli', 'Fog of war', 'Zoom locale', 'Rosa dei venti'].filter((t) => screen.queryByRole('heading', { name: t }));
    expect(titles()).toEqual([]);
    act(() => get().forceMode('pan'));
    expect(titles()).toEqual(['Controlli']);
    act(() => get().forceMode('fog'));
    expect(titles()).toEqual(['Fog of war']);
    act(() => get().forceMode('zoom'));
    expect(titles()).toEqual(['Zoom locale']);
    act(() => get().forceMode('ping'));
    expect(titles()).toEqual(['Rosa dei venti']);
  });
});

describe('PanBox', () => {
  beforeEach(() => { setServer(); act(() => get().forceMode('pan')); });

  it('pad: view:pan con step 20/scale', () => {
    render(<MapTab />);
    click(screen.getByText('▲'));
    click(screen.getByText('◀'));
    expect(emitsOf('view:pan')).toEqual([
      ['view:pan', { locationId: 'L1', dx: 0, dy: 10 }],
      ['view:pan', { locationId: 'L1', dx: 10, dy: 0 }],
    ]);
  });

  it('zoom +/- con clamp e arrotondamento, reset', () => {
    render(<MapTab />);
    click(btn('Aumenta zoom'));
    click(btn('Riduci zoom'));
    click(btn('Reset vista'));
    expect(emitsOf('view:zoom')).toEqual([
      ['view:zoom', { locationId: 'L1', scale: 2.2 }],
      ['view:zoom', { locationId: 'L1', scale: 1.8 }],
    ]);
    expect(emitsOf('view:reset')).toEqual([['view:reset', { locationId: 'L1' }]]);
  });

  it('clamp dello zoom a 4', () => {
    setServer({}, { liveView: { scale: 4, offsetX: 0, offsetY: 0 } });
    render(<MapTab />);
    click(btn('Aumenta zoom'));
    expect(emitsOf('view:zoom')[0][1]).toEqual({ locationId: 'L1', scale: 4 });
  });

  it('griglia giocatori emette, griglia DM no, occhio persiste', () => {
    render(<MapTab />);
    click(btn('Riduci opacità griglia'));
    click(btn('Aumenta opacità griglia'));
    expect(emitsOf('grid:update')).toEqual([
      ['grid:update', { locationId: 'L1', opacity: 0.7 }],
      ['grid:update', { locationId: 'L1', opacity: 0.9 }],
    ]);
    emit().mockClear();
    click(btn('Riduci opacità griglia (solo per te)'));
    expect(get().dmGridOpacity).toBe(0.4);
    expect(emit()).not.toHaveBeenCalled();
    click(btn('Mostra/nascondi la griglia solo nella tua vista'));
    expect(get().dmGridVisible).toBe(false);
    expect(localStorage.getItem('dmGridVisible')).toBe('false');
  });

  it('righe griglia assenti con griglia disabilitata', () => {
    setServer({}, { grid: { ...GRID, enabled: false } });
    render(<MapTab />);
    expect(screen.queryByText('Griglia (giocatori)')).toBeNull();
    expect(screen.queryByText('Griglia (tu)')).toBeNull();
  });

  it('nascosto con immagine mostrata (non in anteprima)', () => {
    setServer({ activeImageId: 'IMG' });
    render(<MapTab />);
    expect(screen.queryByRole('heading', { name: 'Controlli' })).toBeNull();
  });
});

describe('FogBox', () => {
  beforeEach(() => { setServer(); act(() => get().forceMode('fog')); });

  it('opacita +-0.1 e progresso', () => {
    const { container } = render(<MapTab />);
    click(btn('Riduci opacità fog'));
    expect(get().fogOpacity).toBe(0.4);
    click(btn('Aumenta opacità fog'));
    click(btn('Aumenta opacità fog'));
    expect(get().fogOpacity).toBe(0.6);
    expect(screen.getByText('1/3')).toBeTruthy();
    const fill = container.querySelector('#fog-progress-fill') as HTMLElement;
    expect(fill.style.transform).toBe(`scaleX(${1 / 3})`);
  });

  it('progresso nascosto con 0 poligoni', () => {
    setServer({}, { polygons: [] });
    render(<MapTab />);
    expect(screen.queryByText('Rivelate')).toBeNull();
  });
});

describe('ZoomBox', () => {
  it("il pulsante imposta e persiste lo zoom locale; rect null: nulla", () => {
    setServer();
    act(() => get().forceMode('zoom'));
    render(<MapTab />);
    click(screen.getByText("Zooma sull'area dei PG"));
    expect(get().localZoom).toEqual({ scale: 1, x: 0, y: 0 });
    expect(localStorage.getItem('zoomLocalState')).toBeNull();

    act(() => get().setGeometry({
      imageRect: { left: 0, top: 0, width: 400, height: 300 }, rotation: 0,
      naturalW: 800, naturalH: 600, previewW: 400, previewH: 300,
    }));
    click(screen.getByText("Zooma sull'area dei PG"));
    expect(get().localZoom.scale).toBeGreaterThan(1);
    expect(localStorage.getItem('zoomLocalState')).not.toBeNull();
  });
});

describe('PingBox', () => {
  beforeEach(() => { setServer(); act(() => get().forceMode('ping')); });

  it('toggle visibile, nudge clampato, rotazione', () => {
    setServer({}, { compass: { visible: false, x: 99, y: 1, rotation: 270 } });
    render(<MapTab />);
    click(btn('Mostra/nascondi rosa dei venti'));
    click(btn('Sposta a destra'));
    click(btn('Sposta su'));
    click(btn('Ruota 90°'));
    expect(emitsOf('compass:update').map((c) => c[1])).toEqual([
      { locationId: 'L1', visible: true },
      { locationId: 'L1', x: 100, y: 1 },
      { locationId: 'L1', x: 99, y: 0 },
      { locationId: 'L1', rotation: 0 },
    ]);
  });

  it('il toggle e attivo quando la bussola e visibile', () => {
    setServer({}, { compass: { visible: true, x: 50, y: 50, rotation: 0 } });
    render(<MapTab />);
    expect(btn('Mostra/nascondi rosa dei venti').getAttribute('aria-pressed')).toBe('true');
  });
});
