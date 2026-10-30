// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/socket', () => ({
  socket: { on: vi.fn(), off: vi.fn(), emit: vi.fn(), connected: false },
}));

import { socket } from '@/lib/socket';
import { useControlStore } from '../store/control-store';
import type { ControlState } from '../types';
import AudioTab from './AudioTab';

const bg = (id: string, over: Record<string, unknown> = {}) => ({
  id, name: `BG-${id}`, file: `${id}.mp3`, icon: 'music', volume: 0.7, restartOnStop: false, on: false, ...over,
});
const os = (id: string, over: Record<string, unknown> = {}) => ({
  id, name: `OS-${id}`, file: `${id}.mp3`, icon: 'zap', volume: 0.7, ...over,
});
function loc(id: string, name: string, audio: unknown) {
  return { id, name, archived: false, images: [], map: { file: null, aoes: [], audio } };
}
function setServer(audio: unknown, over: Record<string, unknown> = {}) {
  act(() => useControlStore.getState().receiveState({
    activeLocationId: 'L1', activeImageId: null, audioOneshots: {}, displayViewport: null,
    locations: [loc('L1', 'Taverna', audio), loc('L2', 'Foresta', { background: [], oneshot: [] })],
    ...over,
  } as unknown as ControlState));
}
const emitsOf = (ev: string) => vi.mocked(socket.emit).mock.calls.filter((c) => c[0] === ev);
const btn = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;
const click = (el: Element) => act(() => (el as HTMLElement).click());

beforeEach(() => {
  vi.mocked(socket.emit).mockClear();
  useControlStore.setState({ server: null, previewLocationId: null, displayConnected: true });
});

describe('AudioTab', () => {
  it('intestazione con la location attiva e righe vuote', () => {
    setServer({ background: [], oneshot: [] });
    render(<AudioTab />);
    expect(screen.getByText('Audio di: Taverna')).toBeTruthy();
    expect(screen.getByText(/nessun audio di background per questa location/)).toBeTruthy();
    expect(screen.getByText(/nessun one-shot per questa location/)).toBeTruthy();
  });

  it('background acceso ha classe active; click emette audio:toggle', () => {
    setServer({ background: [bg('a', { on: true }), bg('b')], oneshot: [] });
    render(<AudioTab />);
    expect(btn('BG-a').className).toContain('active');
    expect(btn('BG-b').className).not.toContain('active');
    click(btn('BG-b'));
    expect(emitsOf('audio:toggle')[0][1]).toEqual({ trackId: 'b' });
  });

  it('stepper volume: + 0.7 -> 0.8, - a 0 resta 0, mostra 70%', () => {
    setServer({ background: [bg('a'), bg('z', { volume: 0 })], oneshot: [] });
    render(<AudioTab />);
    expect(screen.getAllByText('70%').length).toBe(1);
    click(screen.getAllByRole('button', { name: 'Aumenta volume' })[0]);
    expect(emitsOf('audio:volume')[0][1]).toEqual({ locationId: 'L1', trackId: 'a', volume: 0.8 });
    click(screen.getAllByRole('button', { name: 'Riduci volume' })[1]);
    expect(emitsOf('audio:volume')[1][1]).toEqual({ locationId: 'L1', trackId: 'z', volume: 0 });
  });

  it('one-shot in corso e active; display non connesso li disabilita', () => {
    setServer({ background: [bg('a')], oneshot: [os('s')] }, { audioOneshots: { s: 1 } });
    render(<AudioTab />);
    expect(btn('OS-s').className).toContain('active');
    expect(btn('OS-s').disabled).toBe(false);
    click(btn('OS-s'));
    expect(emitsOf('audio:toggle')[0][1]).toEqual({ trackId: 's' });
    act(() => useControlStore.getState().setDisplayConnected(false));
    expect(btn('OS-s').disabled).toBe(true);
    expect(btn('OS-s').title).toBe('display non connesso');
    expect(btn('BG-a').disabled).toBe(false);
  });

  it('errore del display: bordo distruttivo e title', () => {
    setServer({ background: [bg('a')], oneshot: [] }, { displayAudio: { blocked: false, errors: ['a'], playing: [] } });
    render(<AudioTab />);
    expect(btn('BG-a').className).toContain('border-destructive');
    expect(btn('BG-a').title).toBe('file non trovato o illeggibile');
  });

  it('riga di stato del display', () => {
    setServer({ background: [], oneshot: [] }, { displayAudio: { blocked: false, errors: [], playing: [] } });
    const { rerender } = render(<AudioTab />);
    expect(screen.getByTestId('display-audio-status').textContent).toBe('Display: fermo');
    setServer({ background: [], oneshot: [] }, { displayAudio: { blocked: false, errors: [], playing: ['a'] } });
    rerender(<AudioTab />);
    expect(screen.getByTestId('display-audio-status').textContent).toBe('Display: in riproduzione');
    setServer({ background: [], oneshot: [] }, { displayAudio: { blocked: true, errors: [], playing: [] } });
    rerender(<AudioTab />);
    const el = screen.getByTestId('display-audio-status');
    expect(el.textContent).toBe('Display: audio bloccato dal browser');
    expect(el.className).toContain('text-destructive');
    act(() => useControlStore.getState().setDisplayConnected(false));
    expect(screen.getByTestId('display-audio-status').textContent).toBe('Display: non connesso');
  });

  it('in anteprima di un altra location mostra comunque la attiva', () => {
    setServer({ background: [bg('a')], oneshot: [] });
    act(() => useControlStore.getState().setPreviewLocation('L2'));
    render(<AudioTab />);
    expect(screen.getByText('Audio di: Taverna')).toBeTruthy();
  });
});
