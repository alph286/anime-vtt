// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/socket', () => ({
  socket: { on: vi.fn(), off: vi.fn(), emit: vi.fn(), connected: false },
}));

import { socket } from '@/lib/socket';
import { useControlStore } from '../store/control-store';
import type { ControlState } from '../types';
import { AoeNudgePad } from './AoeNudgePad';

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
const aoe = (over: Record<string, unknown> = {}) => ({
  id: 'A', shape: 'cone', color: 'red', x: 25, y: 25, sizeM: 3, widthM: 1.5, rotation: 0, cast: false, shaderOverride: null, ...over,
});
function setServer(aoes: unknown[], grid = GRID) {
  act(() => useControlStore.getState().receiveState({
    activeLocationId: 'L1', activeImageId: null, displayViewport: { width: 1000, height: 500 },
    locations: [{
      id: 'L1', name: 'L1', archived: false, images: [],
      map: {
        file: 'm.png', type: 'image', scale: 1, flip180: false, rotate90: false, grid,
        polygons: [], shaders: [], aoes, compass: { visible: false, x: 50, y: 50, rotation: 0 },
        liveView: { scale: 1, offsetX: 0, offsetY: 0 },
      },
    }],
  } as unknown as ControlState));
}
const emitsOf = (ev: string) => vi.mocked(socket.emit).mock.calls.filter((c) => c[0] === ev).map((c) => c[1] as Record<string, unknown>);
const click = (el: Element) => act(() => { fireEvent.click(el); });
const ptr = (el: Element, type: string, x: number, y: number) =>
  act(() => { el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1 })); });

function open(over: Record<string, unknown> = {}, grid = GRID) {
  setServer([aoe(over)], grid);
  act(() => { useControlStore.getState().selectAoe('A'); useControlStore.setState({ mode: 'aoe' }); });
}
const padEl = () => screen.getByTestId('aoe-nudge-overlay');

let capture: ReturnType<typeof vi.fn>;
beforeEach(() => {
  localStorage.clear();
  vi.mocked(socket.emit).mockClear();
  useControlStore.setState({
    server: null, previewLocationId: null, mode: null, selectedAoeId: null,
    geometry: { imageRect: null, rotation: 0, naturalW: 800, naturalH: 600, previewW: 400, previewH: 300 },
  });
  capture = vi.fn();
  (HTMLElement.prototype as unknown as { setPointerCapture: unknown }).setPointerCapture = capture;
  (HTMLElement.prototype as unknown as { releasePointerCapture: unknown }).releasePointerCapture = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

describe('AoeNudgePad', () => {
  it('1. visibile solo in modalita aoe con un\'area selezionata', () => {
    setServer([aoe()]);
    const { container } = render(<AoeNudgePad />);
    expect(container.firstChild).toBeNull();
    act(() => useControlStore.setState({ mode: 'aoe' }));
    expect(container.firstChild).toBeNull();
    act(() => useControlStore.getState().selectAoe('A'));
    expect(padEl()).toBeTruthy();
    act(() => useControlStore.setState({ mode: 'ping' }));
    expect(container.firstChild).toBeNull();
  });

  it('2. ordine dei 12 pulsanti come nel pannello originale', () => {
    open();
    render(<AoeNudgePad />);
    const titles = Array.from(padEl().querySelectorAll('button')).map((b) => b.title);
    expect(titles).toEqual([
      'Ruota in senso antiorario', 'Sposta su di una cella', 'Ruota in senso orario',
      'Sposta a sinistra di una cella', 'Cambia colore', 'Sposta a destra di una cella',
      'Aumenta taglia', 'Sposta giù di una cella', 'Riduci taglia',
      'Aumenta larghezza', 'Trascina per spostare il pannello', 'Riduci larghezza',
      'Lancia incantesimo',
    ]);
  });

  it('3. disabled: frecce senza griglia, rotazione fuori da cono/linea, larghezza fuori da linea', () => {
    open({ shape: 'cube' }, { ...GRID, enabled: false });
    const { unmount } = render(<AoeNudgePad />);
    for (const t of ['Sposta su di una cella', 'Sposta giù di una cella', 'Sposta a sinistra di una cella', 'Sposta a destra di una cella',
      'Ruota in senso orario', 'Ruota in senso antiorario', 'Aumenta larghezza', 'Riduci larghezza']) {
      expect((screen.getByTitle(t) as HTMLButtonElement).disabled).toBe(true);
    }
    expect((screen.getByTitle('Aumenta taglia') as HTMLButtonElement).disabled).toBe(false);
    unmount();
    open({ shape: 'line' });
    render(<AoeNudgePad />);
    expect((screen.getByTitle('Ruota in senso orario') as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByTitle('Aumenta larghezza') as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByTitle('Sposta su di una cella') as HTMLButtonElement).disabled).toBe(false);
  });

  it('4. rotazione ∓15 emette aoe:rotate', () => {
    open({ rotation: 0 });
    render(<AoeNudgePad />);
    click(screen.getByTitle('Ruota in senso orario'));
    click(screen.getByTitle('Ruota in senso antiorario'));
    const e = emitsOf('aoe:rotate');
    expect(e).toHaveLength(2);
    expect(e[0]).toMatchObject({ locationId: 'L1', aoeId: 'A', rotation: 15 });
    expect(e[1]).toMatchObject({ locationId: 'L1', aoeId: 'A', rotation: 345 });
    expect(e[0]).toHaveProperty('x');
    expect(e[0]).toHaveProperty('y');
  });

  it('5. le frecce emettono aoe:move di una cella', () => {
    open({ shape: 'cube', x: 50, y: 50 });
    render(<AoeNudgePad />);
    click(screen.getByTitle('Sposta a destra di una cella'));
    click(screen.getByTitle('Sposta su di una cella'));
    const e = emitsOf('aoe:move');
    expect(e).toHaveLength(2);
    expect(e[0].x as number).toBeGreaterThan(50);
    expect(e[1].y as number).toBeLessThan(50);
    expect(e[0]).toMatchObject({ locationId: 'L1', aoeId: 'A' });
  });

  it('6. colore: emette il prossimo del ciclo e mostra lo sfondo del colore corrente', () => {
    open({ color: 'red' });
    render(<AoeNudgePad />);
    const btn = screen.getByTitle('Cambia colore') as HTMLElement;
    expect(btn.style.background).not.toBe('');
    click(btn);
    expect(emitsOf('aoe:setColor')).toEqual([{ locationId: 'L1', aoeId: 'A', color: 'green' }]);
  });

  it('7. taglia e larghezza emettono aoe:resize', () => {
    open({ shape: 'line', sizeM: 3, widthM: 1.5 });
    render(<AoeNudgePad />);
    click(screen.getByTitle('Aumenta taglia'));
    click(screen.getByTitle('Aumenta larghezza'));
    const e = emitsOf('aoe:resize');
    expect(e).toHaveLength(2);
    expect(e[0]).toMatchObject({ locationId: 'L1', aoeId: 'A', sizeM: 4.5, widthM: 1.5 });
    expect(e[1]).toMatchObject({ aoeId: 'A', sizeM: 3, widthM: 3 });
  });

  it('8. FIRE / UN-FIRE', () => {
    open({ cast: false });
    const { unmount } = render(<AoeNudgePad />);
    const fire = screen.getByText('FIRE');
    expect(fire.title).toBe('Lancia incantesimo');
    expect(fire.classList.contains('active')).toBe(false);
    click(fire);
    expect(emitsOf('aoe:setCast')).toEqual([{ locationId: 'L1', aoeId: 'A', cast: true }]);
    unmount();
    open({ cast: true });
    render(<AoeNudgePad />);
    const un = screen.getByText('UN-FIRE');
    expect(un.title).toBe('Interrompi incantesimo');
    expect(un.classList.contains('active')).toBe(true);
    click(un);
    expect(emitsOf('aoe:setCast').pop()).toEqual({ locationId: 'L1', aoeId: 'A', cast: false });
  });

  it('storageKey personalizzata: la posizione va solo in quella chiave', () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(400);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      { left: 200, top: 300, right: 360, bottom: 510, width: 160, height: 210, x: 200, y: 300, toJSON() {} } as DOMRect);
    open();
    render(<AoeNudgePad storageKey="altraChiave" />);
    const handle = screen.getByTitle('Trascina per spostare il pannello');
    ptr(handle, 'pointerdown', 210, 310);
    ptr(handle, 'pointermove', 110, 160);
    ptr(handle, 'pointerup', 110, 160);
    expect(JSON.parse(localStorage.getItem('altraChiave') as string)).toEqual({ left: 0, top: 0 }); // jsdom: offsetLeft/Top = 0
    expect(localStorage.getItem('aoeNudgeOverlayPos')).toBeNull();
  });

  it('9. drag della maniglia: cattura il puntatore, fissa left/top, clampa, salva a fine drag', () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(400);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      { left: 200, top: 300, right: 360, bottom: 510, width: 160, height: 210, x: 200, y: 300, toJSON() {} } as DOMRect);
    open();
    render(<AoeNudgePad />);
    const handle = screen.getByTitle('Trascina per spostare il pannello');
    ptr(handle, 'pointerdown', 210, 310);
    expect(capture).toHaveBeenCalledWith(1);
    // un tap fissa il pad dov'e
    expect(padEl().style.left).toBe('200px');
    expect(padEl().style.top).toBe('300px');
    expect(padEl().style.right).toBe('auto');
    ptr(handle, 'pointermove', 110, 160);
    expect(padEl().style.left).toBe('100px');
    expect(padEl().style.top).toBe('150px');
    ptr(handle, 'pointermove', 9999, 9999);
    expect(padEl().style.left).toBe('240px'); // 400 - 160
    expect(padEl().style.top).toBe('390px'); // 600 - 210
    ptr(handle, 'pointermove', -500, -500);
    expect(padEl().style.left).toBe('0px');
    expect(localStorage.getItem('aoeNudgeOverlayPos')).toBeNull();
    ptr(handle, 'pointerup', -500, -500);
    expect(JSON.parse(localStorage.getItem('aoeNudgeOverlayPos') as string)).toEqual({ left: 0, top: 0 });
    // dopo il rilascio il movimento non conta piu
    ptr(handle, 'pointermove', 100, 100);
    expect(padEl().style.left).toBe('0px');
  });

  it('10. posizione salvata applicata alla prima comparsa e non riscritta dai render', () => {
    localStorage.setItem('aoeNudgeOverlayPos', JSON.stringify({ left: 30, top: 40 }));
    open();
    render(<AoeNudgePad />);
    expect(padEl().style.left).toBe('30px');
    expect(padEl().style.top).toBe('40px');
    // spostamento manuale dello stile (simula un drag), poi un aggiornamento dello stato
    padEl().style.left = '77px';
    setServer([aoe({ cast: true })]);
    expect(padEl().style.left).toBe('77px');
  });

  it('10b. la posizione trascinata resta dopo nascondi -> mostra (deseleziona e rientra)', () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(400);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      { left: 200, top: 300, right: 360, bottom: 510, width: 160, height: 210, x: 200, y: 300, toJSON() {} } as DOMRect);
    open();
    render(<AoeNudgePad />);
    const handle = screen.getByTitle('Trascina per spostare il pannello');
    ptr(handle, 'pointerdown', 210, 310);
    ptr(handle, 'pointermove', 110, 160);
    ptr(handle, 'pointerup', 110, 160);
    expect(padEl().style.left).toBe('100px');
    act(() => useControlStore.getState().selectAoe(null));
    expect(screen.queryByTestId('aoe-nudge-overlay')).toBeNull();
    act(() => useControlStore.getState().selectAoe('A'));
    expect(padEl().style.left).toBe('100px');
    expect(padEl().style.top).toBe('150px');
    // anche uscendo e rientrando dalla modalita aoe
    act(() => useControlStore.setState({ mode: 'ping' }));
    act(() => useControlStore.setState({ mode: 'aoe' }));
    expect(padEl().style.left).toBe('100px');
    expect(padEl().style.top).toBe('150px');
  });

  it('10c. se il pad si nasconde a meta trascinamento salva l\'ultima posizione', () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(400);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      { left: 200, top: 300, right: 360, bottom: 510, width: 160, height: 210, x: 200, y: 300, toJSON() {} } as DOMRect);
    open();
    render(<AoeNudgePad />);
    const handle = screen.getByTitle('Trascina per spostare il pannello');
    ptr(handle, 'pointerdown', 210, 310);
    ptr(handle, 'pointermove', 110, 160);
    act(() => useControlStore.getState().selectAoe(null)); // nessun pointerup
    expect(JSON.parse(localStorage.getItem('aoeNudgeOverlayPos') as string)).toEqual({ left: 100, top: 150 });
  });

  it('11. senza posizione salvata resta sul default CSS (nessun left/top)', () => {
    open();
    render(<AoeNudgePad />);
    expect(padEl().style.left).toBe('');
    expect(padEl().style.top).toBe('');
  });
});
