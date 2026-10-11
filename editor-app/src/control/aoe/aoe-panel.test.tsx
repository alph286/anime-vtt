// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/socket', () => ({
  socket: { on: vi.fn(), off: vi.fn(), emit: vi.fn(), connected: false },
}));

import { socket } from '@/lib/socket';
import { useControlStore } from '../store/control-store';
import type { ControlState } from '../types';
import { AoePanel } from './AoePanel';

const GRID = {
  enabled: true, cellSize: 50, baseCellSize: 50, divisions: 1,
  offsetX: 0, offsetY: 0, color: '#fff', lineWidth: 0.4, opacity: 0.8,
};
const aoe = (over: Record<string, unknown> = {}) => ({
  id: 'A', shape: 'cone', color: 'red', x: 25, y: 25, sizeM: 3, rotation: 0, cast: false, shaderOverride: null, ...over,
});
function setServer(aoes: unknown[]) {
  act(() => useControlStore.getState().receiveState({
    activeLocationId: 'L1', activeImageId: null, displayViewport: { width: 1000, height: 500 },
    locations: [{
      id: 'L1', name: 'L1', archived: false, images: [],
      map: {
        file: 'm.png', type: 'image', scale: 1, flip180: false, rotate90: false, grid: GRID,
        polygons: [], shaders: [], aoes, compass: { visible: false, x: 50, y: 50, rotation: 0 },
        liveView: { scale: 1, offsetX: 0, offsetY: 0 },
      },
    }],
  } as unknown as ControlState));
}
const get = () => useControlStore.getState();
const emitsOf = (ev: string) => vi.mocked(socket.emit).mock.calls.filter((c) => c[0] === ev).map((c) => c[1] as Record<string, unknown>);
const click = (el: Element) => act(() => { fireEvent.click(el); });

beforeEach(() => {
  vi.mocked(socket.emit).mockClear();
  useControlStore.setState({
    server: null, previewLocationId: null, mode: null, selectedAoeId: null,
    aoeShape: 'cone', aoeColor: 'red', aoeSize: 1.5, aoeWidth: 1.5, aoeShaderOverride: null, aoeShaderMenuOpen: false,
    geometry: { imageRect: null, rotation: 0, naturalW: 800, naturalH: 600, previewW: 400, previewH: 300 },
  });
});
afterEach(() => vi.useRealTimers());

describe('AoePanel', () => {
  it('1. senza selezione: la forma cambia solo lo store, le swatch mostrano il colore', () => {
    setServer([]);
    render(<AoePanel />);
    click(screen.getByTitle('Cubo'));
    expect(get().aoeShape).toBe('cube');
    expect(socket.emit).not.toHaveBeenCalled();
    for (const [name, title] of [['red', 'Rosso'], ['green', 'Verde'], ['white', 'Bianco'], ['yellow', 'Giallo']]) {
      expect((screen.getByTitle(title) as HTMLElement).style.getPropertyValue('--aoe-color')).toBe(aoeColorHex(name));
    }
  });

  it('2. con selezione: barra forme nascosta, etichetta, colore emette (e azzera override)', () => {
    setServer([aoe({ shaderOverride: 'web_area' })]);
    act(() => get().selectAoe('A'));
    render(<AoePanel />);
    expect(screen.queryByTitle('Cubo')).toBeNull();
    expect(screen.getByText('Modifica: Cono 3,0m')).toBeTruthy();
    click(screen.getByTitle('Verde'));
    expect(emitsOf('aoe:setColor')).toEqual([{ locationId: 'L1', aoeId: 'A', color: 'green' }]);
    expect(emitsOf('aoe:setShaderOverride')).toEqual([{ locationId: 'L1', aoeId: 'A', shaderOverride: null }]);
  });

  it('2b. con selezione senza override: solo setColor', () => {
    setServer([aoe()]);
    act(() => get().selectAoe('A'));
    render(<AoePanel />);
    click(screen.getByTitle('Verde'));
    expect(emitsOf('aoe:setShaderOverride')).toEqual([]);
  });

  it('2c. senza selezione il colore azzera l\'override di default', () => {
    setServer([]);
    act(() => get().patchAoeDefaults({ shaderOverride: 'web_area' }));
    render(<AoePanel />);
    click(screen.getByTitle('Giallo'));
    expect(get().aoeColor).toBe('yellow');
    expect(get().aoeShaderOverride).toBeNull();
  });

  it('3. menu "···": apre inline, sceglie, richiude, toggle senza colore', () => {
    setServer([aoe()]);
    act(() => get().selectAoe('A'));
    render(<AoePanel />);
    const more = screen.getByTitle('Altri shader');
    expect(screen.queryByText('Zona ragnatela')).toBeNull();
    click(more);
    expect(get().aoeShaderMenuOpen).toBe(true);
    click(screen.getByText('Viola Cornelia'));
    expect(emitsOf('aoe:setShaderOverride')).toEqual([{ locationId: 'L1', aoeId: 'A', shaderOverride: 'purple_fire' }]);
    expect(emitsOf('aoe:setColor')).toEqual([{ locationId: 'L1', aoeId: 'A', color: AOE_SHADER_OVERRIDE_DEFAULT_COLOR.purple_fire }]);
    expect(get().aoeShaderMenuOpen).toBe(false);

    // Riscegliere la stessa voce: next=null, nessun setColor.
    vi.mocked(socket.emit).mockClear();
    setServer([aoe({ shaderOverride: 'purple_fire', color: 'purple' })]);
    click(screen.getByTitle('Altri shader'));
    click(screen.getByText('Viola Cornelia'));
    expect(emitsOf('aoe:setShaderOverride')).toEqual([{ locationId: 'L1', aoeId: 'A', shaderOverride: null }]);
    expect(emitsOf('aoe:setColor')).toEqual([]);
  });

  it('3b. senza selezione aggiorna i default; "···" active con override', () => {
    setServer([]);
    render(<AoePanel />);
    expect(screen.getByTitle('Altri shader').className).not.toMatch(/\bactive\b/);
    click(screen.getByTitle('Altri shader'));
    click(screen.getByText('Zona ragnatela'));
    expect(get().aoeShaderOverride).toBe('web_area');
    expect(get().aoeColor).toBe(AOE_SHADER_OVERRIDE_DEFAULT_COLOR.web_area);
    expect(socket.emit).not.toHaveBeenCalled();
    expect(screen.getByTitle('Altri shader').className).toMatch(/\bactive\b/);
  });

  it('4. taglia: default ±1.5 con minimo, selezione emette resize, larghezza solo per linea', () => {
    setServer([]);
    render(<AoePanel />);
    expect(screen.getByText('Lunghezza: 1,5 m')).toBeTruthy();
    click(screen.getByTitle('Riduci lunghezza'));
    expect(get().aoeSize).toBe(1.5);
    click(screen.getByTitle('Aumenta lunghezza'));
    expect(get().aoeSize).toBe(3);
    expect(screen.queryByTitle('Aumenta larghezza')).toBeNull();
    click(screen.getByTitle('Linea'));
    click(screen.getByTitle('Aumenta larghezza'));
    expect(get().aoeWidth).toBe(3);
    expect(socket.emit).not.toHaveBeenCalled();
  });

  it('4b. con selezione: resize col payload di resizePayload; etichetta Raggio', () => {
    setServer([aoe({ shape: 'sphere' })]);
    act(() => get().selectAoe('A'));
    render(<AoePanel />);
    expect(screen.getByText('Raggio: 3,0 m')).toBeTruthy();
    click(screen.getByTitle('Aumenta raggio'));
    const sent = emitsOf('aoe:resize');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ locationId: 'L1', aoeId: 'A', sizeM: 4.5 });
  });

  it('5. lista: pillole, selezione, arma-conferma, timeout, cambio selezione', () => {
    vi.useFakeTimers();
    setServer([aoe(), aoe({ id: 'B', shape: 'cube', sizeM: 1.5 })]);
    render(<AoePanel />);
    expect(screen.getByText('Cono 3,0m')).toBeTruthy();
    expect(screen.getByText('Cubo 1,5m')).toBeTruthy();
    click(screen.getByText('Cono 3,0m'));
    expect(get().selectedAoeId).toBe('A');
    click(screen.getByText('Cono 3,0m'));
    expect(get().selectedAoeId).toBeNull();

    const del = () => screen.getAllByTitle(/Rimuovi|Tocca di nuovo/)[0];
    click(del());
    expect(del().getAttribute('title')).toBe('Tocca di nuovo per confermare');
    expect(del().className).toMatch(/confirm/);
    expect(socket.emit).not.toHaveBeenCalled();
    click(del()); // bottone corrente del DOM, dopo il rerender
    expect(emitsOf('aoe:remove')).toEqual([{ locationId: 'L1', aoeId: 'A' }]);

    vi.mocked(socket.emit).mockClear();
    click(del());
    act(() => { vi.advanceTimersByTime(2600); });
    expect(del().getAttribute('title')).toBe('Rimuovi');
    click(del());
    click(screen.getByText('Cubo 1,5m')); // cambio selezione disarma
    expect(screen.getAllByTitle(/Rimuovi|Tocca di nuovo/)[0].getAttribute('title')).toBe('Rimuovi');
    expect(emitsOf('aoe:remove')).toEqual([]);
  });

  it('6. fulmine per pillola emette setCast invertito', () => {
    setServer([aoe(), aoe({ id: 'B', cast: true })]);
    render(<AoePanel />);
    const bolts = screen.getAllByTitle(/Lancia incantesimo|Interrompi incantesimo/);
    click(bolts[0]);
    click(bolts[1]);
    expect(emitsOf('aoe:setCast')).toEqual([
      { locationId: 'L1', aoeId: 'A', cast: true },
      { locationId: 'L1', aoeId: 'B', cast: false },
    ]);
  });
});
