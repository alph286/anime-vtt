// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/socket', () => ({
  socket: { on: vi.fn(), off: vi.fn(), emit: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), connected: false },
}));

import { socket } from '@/lib/socket';
import { useControlStore } from '../store/control-store';
import type { ControlState } from '../types';
import { useControlSocket } from './use-control-socket';

const get = () => useControlStore.getState();
const handlers: Record<string, (...a: unknown[]) => void> = {};

describe('useControlSocket', () => {
  beforeEach(() => {
    for (const k of Object.keys(handlers)) delete handlers[k];
    vi.mocked(socket.on).mockReset().mockImplementation(((ev: string, fn: (...a: unknown[]) => void) => {
      handlers[ev] = fn;
      return socket;
    }) as never);
    vi.mocked(socket.off).mockClear();
    vi.mocked(socket.emit).mockClear();
    vi.mocked(socket.connect).mockClear();
    vi.mocked(socket.disconnect).mockClear();
    (socket as { connected: boolean }).connected = false;
    useControlStore.setState({ server: null, socketConnected: false });
  });

  it('connect emette hello control e segna connesso', () => {
    renderHook(() => useControlSocket());
    handlers.connect();
    expect(socket.emit).toHaveBeenCalledWith('hello', { role: 'control' });
    expect(get().socketConnected).toBe(true);
  });

  it('gia connesso al mount senza stato: si riconnette per ricevere lo state:update iniziale perso', () => {
    (socket as { connected: boolean }).connected = true;
    renderHook(() => useControlSocket());
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
    expect(socket.connect).toHaveBeenCalledTimes(1);
  });

  it('gia connesso al mount con stato gia ricevuto: nessuna riconnessione', () => {
    (socket as { connected: boolean }).connected = true;
    useControlStore.setState({ server: { activeLocationId: null, activeImageId: null, locations: [] } as unknown as ControlState });
    renderHook(() => useControlSocket());
    expect(socket.disconnect).not.toHaveBeenCalled();
    expect(socket.connect).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith('hello', { role: 'control' });
  });

  it('non ancora connesso al mount: nessuna riconnessione forzata', () => {
    renderHook(() => useControlSocket());
    expect(socket.disconnect).not.toHaveBeenCalled();
    expect(socket.connect).not.toHaveBeenCalled();
  });
});
