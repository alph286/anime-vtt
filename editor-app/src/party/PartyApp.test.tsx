// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/socket', () => ({
  socket: { on: vi.fn(), off: vi.fn(), emit: vi.fn(), connected: false },
}));

import { socket } from '@/lib/socket';
import type { ControlState } from '../control/types';
import { useControlStore } from '../control/store/control-store';
import PartyApp from './PartyApp';
import { syncPartyState } from './use-party-socket';

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
const aoe = (over: Record<string, unknown> = {}) => ({
  id: 'A', shape: 'cone', color: 'red', x: 25, y: 25, sizeM: 3, widthM: 1.5, rotation: 0, cast: false, shaderOverride: null, ...over,
});
function serverState(over: Record<string, unknown> = {}, aoes: unknown[] = [aoe()]): ControlState {
  return {
    activeLocationId: 'L1', activeImageId: null, displayViewport: { width: 1000, height: 500 },
    locations: [{
      id: 'L1', name: 'Taverna', archived: false, images: [],
      map: {
        file: 'm.png', type: 'image', scale: 1, flip180: false, rotate90: false, grid: GRID,
        polygons: [], shaders: [], aoes, compass: { visible: false, x: 50, y: 50, rotation: 0 },
        liveView: { scale: 1, offsetX: 0, offsetY: 0 },
      },
    }],
    ...over,
  } as unknown as ControlState;
}
const load = (s: ControlState) => act(() => syncPartyState(s));
const emitsOf = (ev: string) => vi.mocked(socket.emit).mock.calls.filter((c) => c[0] === ev).map((c) => c[1] as Record<string, unknown>);
const click = (el: Element) => act(() => { fireEvent.click(el); });
const ptr = (el: Element, type: string, x: number, y: number) =>
  act(() => { el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1 })); });

beforeEach(() => {
  localStorage.clear();
  vi.mocked(socket.emit).mockClear();
  useControlStore.setState({
    server: null, previewLocationId: null, previewImageId: null, mode: null, selectedAoeId: null,
    socketConnected: false, displayConnected: false,
  });
  (HTMLElement.prototype as unknown as { setPointerCapture: unknown }).setPointerCapture = vi.fn();
  (HTMLElement.prototype as unknown as { releasePointerCapture: unknown }).releasePointerCapture = vi.fn();
});

describe('PartyApp', () => {
  it('a) senza server: pallino, nome vuoto, nessun selettore, pannello AOE', () => {
    render(<PartyApp />);
    expect(screen.getByTestId('wifi-dot')).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(document.querySelector('header span')?.textContent).toBe('');
    expect(screen.getByText("Area d'effetto")).toBeTruthy();
  });

  it('b) nome della location attiva; pallino bad/ok secondo il solo socket', () => {
    render(<PartyApp />);
    load(serverState());
    expect(screen.getByText('Taverna')).toBeTruthy();
    const dot = screen.getByTestId('wifi-dot');
    expect(dot.classList.contains('bad')).toBe(true);
    act(() => useControlStore.getState().setConnected(true));
    expect(dot.classList.contains('ok')).toBe(true);
    expect(dot.classList.contains('bad')).toBe(false);
  });

  it('c) nessuna modalita o controllo del DM', () => {
    render(<PartyApp />);
    load(serverState());
    for (const t of ['Pan', 'Ping', 'Zoom', 'Fog', 'Immagini', 'Audio']) expect(screen.queryByText(t)).toBeNull();
    expect(screen.getByText("Area d'effetto")).toBeTruthy();
  });

  it('d) lista aree: elimina arma-poi-conferma, nessun fulmine per pillola', () => {
    render(<PartyApp />);
    load(serverState());
    expect(screen.queryByTitle(/lancia/i)).toBeNull();
    click(screen.getByTitle('Rimuovi'));
    expect(emitsOf('aoe:remove')).toHaveLength(0);
    click(screen.getByTitle('Tocca di nuovo per confermare'));
    expect(emitsOf('aoe:remove')).toEqual([{ locationId: 'L1', aoeId: 'A' }]);
  });

  it('e) pad con area selezionata: FIRE e posizione con chiave dedicata', () => {
    render(<PartyApp />);
    load(serverState());
    expect(screen.queryByTestId('aoe-nudge-overlay')).toBeNull();
    act(() => useControlStore.getState().selectAoe('A'));
    click(screen.getByText('FIRE'));
    expect(emitsOf('aoe:setCast')).toHaveLength(1);
    const handle = screen.getByTitle('Trascina per spostare il pannello');
    ptr(handle, 'pointerdown', 210, 310);
    ptr(handle, 'pointermove', 110, 160);
    ptr(handle, 'pointerup', 110, 160);
    expect(localStorage.getItem('partyAoeNudgeOverlayPos')).not.toBeNull();
    expect(localStorage.getItem('aoeNudgeOverlayPos')).toBeNull();
  });

  it('f) con un\'immagine mostrata pannello e pad restano utilizzabili', () => {
    render(<PartyApp />);
    load(serverState({ activeImageId: 'img1' }));
    act(() => useControlStore.getState().selectAoe('A'));
    expect(screen.getByTestId('aoe-nudge-overlay')).toBeTruthy();
    click(screen.getByTitle('Verde'));
    expect(emitsOf('aoe:setColor')).toEqual([{ locationId: 'L1', aoeId: 'A', color: 'green' }]);
  });

  it('g) nessuna location attiva: render senza eccezioni', () => {
    render(<PartyApp />);
    expect(() => load(serverState({ activeLocationId: null, locations: [] }))).not.toThrow();
    expect(screen.getByTestId('wifi-dot')).toBeTruthy();
  });
});
