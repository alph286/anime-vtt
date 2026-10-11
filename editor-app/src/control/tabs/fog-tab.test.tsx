// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/socket', () => ({
  socket: { on: vi.fn(), off: vi.fn(), emit: vi.fn(), connected: false },
}));

import { socket } from '@/lib/socket';
import { useControlStore } from '../store/control-store';
import type { ControlState } from '../types';
import FogTab from './FogTab';

const GRID = {
  enabled: true, cellSize: 50, baseCellSize: 50, divisions: 1,
  offsetX: 0, offsetY: 0, color: '#fff', lineWidth: 0.4, opacity: 0.8,
};
function setServer(polygons: unknown[]) {
  act(() => useControlStore.getState().receiveState({
    activeLocationId: 'L1', activeImageId: null, displayViewport: null,
    locations: [{
      id: 'L1', name: 'L1', archived: false, images: [],
      map: {
        file: 'm.png', type: 'image', scale: 1, flip180: false, rotate90: false, grid: GRID,
        polygons, shaders: [], aoes: [], compass: { visible: false, x: 50, y: 50, rotation: 0 },
        liveView: { scale: 1, offsetX: 0, offsetY: 0 },
      },
    }],
  } as unknown as ControlState));
}
const polys = [
  { id: 'P1', name: 'Sala', revealed: true, points: [] },
  { id: 'P2', name: 'Cripta', revealed: false, points: [] },
];
const emits = (ev: string) => vi.mocked(socket.emit).mock.calls.filter((c) => c[0] === ev).map((c) => c[1]);
const click = (el: Element) => act(() => { fireEvent.click(el); });

beforeEach(() => {
  vi.mocked(socket.emit).mockClear();
  useControlStore.setState({ server: null, previewLocationId: null });
});
afterEach(() => vi.useRealTimers());

describe('FogTab', () => {
  it('elenca le zone con stato e classe revealed, più il testo guida', () => {
    setServer(polys);
    render(<FogTab />);
    expect(screen.getByText('Tocca una zona per rivelarla o nasconderla.')).toBeTruthy();
    const sala = screen.getByText('Sala').closest('button')!;
    const cripta = screen.getByText('Cripta').closest('button')!;
    expect(sala.className).toContain('revealed');
    expect(sala.textContent).toContain('rivelata');
    expect(cripta.className).not.toContain('revealed');
    expect(cripta.textContent).toContain('nascosta');
  });

  it('click su una riga emette fow:toggle', () => {
    setServer(polys);
    render(<FogTab />);
    click(screen.getByText('Cripta'));
    expect(emits('fow:toggle')).toEqual([{ locationId: 'L1', polygonId: 'P2' }]);
  });

  it('Nascondi tutto emette fow:setAll revealed:false', () => {
    setServer(polys);
    render(<FogTab />);
    click(screen.getByText('Nascondi tutto'));
    expect(emits('fow:setAll')).toEqual([{ locationId: 'L1', revealed: false }]);
  });

  it('Rivela tutto: arma, poi conferma entro 2,5 s', () => {
    vi.useFakeTimers();
    setServer(polys);
    render(<FogTab />);
    click(screen.getByText('Rivela tutto'));
    expect(emits('fow:setAll')).toEqual([]);
    const armed = screen.getByText('Click di nuovo per confermare');
    expect(armed.className).toContain('confirm');
    act(() => { vi.advanceTimersByTime(1000); });
    click(screen.getByText('Click di nuovo per confermare'));
    expect(emits('fow:setAll')).toEqual([{ locationId: 'L1', revealed: true }]);
    expect(screen.getByText('Rivela tutto')).toBeTruthy();
  });

  it('Rivela tutto: a timeout torna il testo originale e non emette', () => {
    vi.useFakeTimers();
    setServer(polys);
    render(<FogTab />);
    click(screen.getByText('Rivela tutto'));
    act(() => { vi.advanceTimersByTime(2600); });
    expect(screen.getByText('Rivela tutto').className).not.toContain('confirm');
    click(screen.getByText('Rivela tutto'));
    expect(emits('fow:setAll')).toEqual([]);
  });

  it('senza previewLocationId nessuna emissione e nessun errore', () => {
    render(<FogTab />);
    click(screen.getByText('Nascondi tutto'));
    click(screen.getByText('Rivela tutto'));
    expect(screen.getByText('Rivela tutto')).toBeTruthy();
    expect(socket.emit).not.toHaveBeenCalled();
  });

  it('lista vuota non lancia', () => {
    setServer([]);
    expect(() => render(<FogTab />)).not.toThrow();
  });
});
