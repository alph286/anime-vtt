// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/socket', () => ({
  socket: { on: vi.fn(), off: vi.fn(), emit: vi.fn(), connected: false },
}));

import { socket } from '@/lib/socket';
import { useControlStore } from '../control/store/control-store';
import type { ControlState } from '../control/types';
import { usePartySocket } from './use-party-socket';

const get = () => useControlStore.getState();
const handlers: Record<string, (...a: unknown[]) => void> = {};

function loc(id: string, extra: Record<string, unknown> = {}) {
  return { id, name: id, archived: false, images: [], map: { file: 'm.png', aoes: [] }, ...extra };
}
function state(over: Record<string, unknown> = {}): ControlState {
  return { activeLocationId: 'L1', activeImageId: null, locations: [loc('L1'), loc('L2')], ...over } as unknown as ControlState;
}

describe('usePartySocket', () => {
  beforeEach(() => {
    localStorage.clear();
    for (const k of Object.keys(handlers)) delete handlers[k];
    vi.mocked(socket.on).mockReset().mockImplementation(((ev: string, fn: (...a: unknown[]) => void) => {
      handlers[ev] = fn;
      return socket;
    }) as never);
    vi.mocked(socket.off).mockClear();
    vi.mocked(socket.emit).mockClear();
    useControlStore.setState({
      server: null, previewLocationId: null, previewImageId: null, mode: null,
      selectedAoeId: null, socketConnected: false,
      localZoom: { scale: 1, x: 0, y: 0 },
    });
  });

  it('registra solo connect, disconnect e state:update', () => {
    renderHook(() => usePartySocket());
    expect(Object.keys(handlers).sort()).toEqual(['connect', 'disconnect', 'state:update']);
    expect(handlers['ping:show']).toBeUndefined();
    expect(handlers['display:status']).toBeUndefined();
  });

  it('connect emette hello party, disconnect azzera', () => {
    renderHook(() => usePartySocket());
    handlers.connect();
    expect(socket.emit).toHaveBeenCalledWith('hello', { role: 'party' });
    expect(get().socketConnected).toBe(true);
    handlers.disconnect();
    expect(get().socketConnected).toBe(false);
  });

  it('state:update imposta anteprima = location attiva e mode aoe anche con immagine mostrata', () => {
    renderHook(() => usePartySocket());
    handlers['state:update'](state({ activeImageId: 'i' }));
    expect(get().previewLocationId).toBe('L1');
    expect(get().mode).toBe('aoe');
  });

  it('mode resta aoe se la mappa non ha file', () => {
    renderHook(() => usePartySocket());
    handlers['state:update'](state({ locations: [loc('L1', { map: { aoes: [] } })] }));
    expect(get().mode).toBe('aoe');
  });

  it('Review Focus 2: selectedAoeId stantio azzerato al cambio location', () => {
    renderHook(() => usePartySocket());
    handlers['state:update'](state({ locations: [loc('L1', { map: { file: 'm.png', aoes: [{ id: 'A' }] } }), loc('L2')] }));
    useControlStore.setState({ selectedAoeId: 'A' });
    handlers['state:update'](state({ activeLocationId: 'L2', locations: [loc('L1', { map: { file: 'm.png', aoes: [{ id: 'A' }] } }), loc('L2')] }));
    expect(get().selectedAoeId).toBeNull();
  });

  it('Review Focus 4: lo zoom locale si azzera in memoria senza toccare localStorage', () => {
    const raw = JSON.stringify({ scale: 3, x: 10, y: 10 });
    localStorage.setItem('zoomLocalState', raw);
    useControlStore.setState({ localZoom: { scale: 3, x: 10, y: 10 } });
    renderHook(() => usePartySocket());
    expect(get().localZoom).toEqual({ scale: 1, x: 0, y: 0 });
    expect(localStorage.getItem('zoomLocalState')).toBe(raw);
  });

  it('Review Focus 5: nessuna location attiva non lancia', () => {
    renderHook(() => usePartySocket());
    expect(() => handlers['state:update'](state({ activeLocationId: null, locations: [] }))).not.toThrow();
    expect(get().previewLocationId).toBeNull();
  });

  it('allo smontaggio fa off di ogni handler registrato', () => {
    const { unmount } = renderHook(() => usePartySocket());
    const registered = { ...handlers };
    unmount();
    for (const [ev, fn] of Object.entries(registered)) expect(socket.off).toHaveBeenCalledWith(ev, fn);
  });
});
