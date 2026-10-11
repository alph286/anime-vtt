// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/socket', () => ({
  socket: { on: vi.fn(), off: vi.fn(), emit: vi.fn(), connected: false },
}));
const dest = vi.hoisted(() => ({ value: null as { name: string }[] | null }));
vi.mock('@/hooks/use-telegram-destinations', () => ({
  useTelegramDestinations: () => dest.value,
}));

import { socket } from '@/lib/socket';
import { AudioBox } from '../boxes/AudioBox';
import { useControlStore } from '../store/control-store';
import type { ControlState } from '../types';
import ImagesTab from './ImagesTab';

const GRID = {
  enabled: true, cellSize: 50, baseCellSize: 50, divisions: 1,
  offsetX: 0, offsetY: 0, color: '#fff', lineWidth: 0.4, opacity: 0.8,
};
const track = (file: string | null, volume?: number) => ({ name: 'x', file, volume });
function loc(id: string, images: unknown[], audio?: unknown) {
  return {
    id, name: id, archived: false, images,
    map: {
      file: null, type: 'image', scale: 1, flip180: false, rotate90: false, grid: GRID,
      polygons: [], shaders: [], aoes: [], audio: audio ?? { main: track(null), special: track(null) },
    },
  };
}
const IMG = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: `N-${id}`, file: `${id}.png`, ...extra });
function setServer(over: Record<string, unknown> = {}, locs?: unknown[]) {
  act(() => useControlStore.getState().receiveState({
    activeLocationId: 'L1', activeImageId: null, activeAudioTrack: 'main', audioState: 'stopped',
    displayViewport: null,
    locations: locs ?? [loc('L1', [IMG('I1', { caption: 'cap', telegramDestination: 'Gruppo' }), IMG('I2')])],
    ...over,
  } as unknown as ControlState));
}
const emitsOf = (ev: string) => vi.mocked(socket.emit).mock.calls.filter((c) => c[0] === ev);
const click = (el: Element) => act(() => (el as HTMLElement).click());

beforeEach(() => {
  vi.mocked(socket.emit).mockClear();
  dest.value = [{ name: 'Gruppo' }, { name: 'Altro' }];
  useControlStore.setState({
    server: null, previewLocationId: null, previewImageId: null, telegramPending: false, telegramFeedback: null,
  });
});

describe('ImagesTab', () => {
  it('lista vuota: testo di aiuto, nessun dettaglio', () => {
    setServer({}, [loc('L1', [])]);
    render(<ImagesTab />);
    expect(screen.getByText('nessuna immagine per questa location')).toBeTruthy();
    expect(screen.queryByText('Mostra')).toBeNull();
  });

  it('usa la location ATTIVA, non l\'anteprima; classi active/selected', () => {
    setServer({ activeImageId: 'I1' }, [loc('L1', [IMG('I1'), IMG('I2')]), loc('L2', [IMG('X1')])]);
    act(() => useControlStore.getState().setPreviewLocation('L2'));
    act(() => useControlStore.getState().setPreviewImage('I2'));
    render(<ImagesTab />);
    expect(screen.queryByText('N-X1')).toBeNull();
    const t1 = screen.getByText('N-I1').closest('button')!;
    const t2 = screen.getByText('N-I2').closest('button')!;
    expect(t1.className).toContain('active');
    expect(t1.className).toContain('--vtt-accent');
    expect(t1.className).not.toContain('selected');
    expect(t2.className).toContain('selected');
    expect(t1.querySelector('img')!.getAttribute('src')).toBe('/storage/images/I1.png');
  });

  it('click miniatura seleziona e mostra il dettaglio', () => {
    setServer();
    render(<ImagesTab />);
    expect(screen.queryByText('Mostra')).toBeNull();
    click(screen.getByText('N-I1').closest('button')!);
    expect(useControlStore.getState().previewImageId).toBe('I1');
    expect(screen.getByText('Mostra')).toBeTruthy();
  });

  it('didascalia: emit solo al commit e solo se cambiata', () => {
    setServer();
    act(() => useControlStore.getState().setPreviewImage('I1'));
    render(<ImagesTab />);
    const input = screen.getByPlaceholderText('didascalia per Telegram') as HTMLInputElement;
    expect(input.value).toBe('cap');
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(emitsOf('image:caption')).toHaveLength(0);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'nuova' } });
    expect(emitsOf('image:caption')).toHaveLength(0);
    fireEvent.blur(input);
    expect(emitsOf('image:caption')).toEqual([['image:caption', { locationId: 'L1', imageId: 'I1', caption: 'nuova' }]]);
  });

  it('select destinazione: opzioni e payload', () => {
    setServer();
    act(() => useControlStore.getState().setPreviewImage('I1'));
    render(<ImagesTab />);
    const sel = screen.getByLabelText('Destinazione Telegram') as HTMLSelectElement;
    expect([...sel.options].map((o) => o.text)).toEqual(['— scegli destinazione —', 'Gruppo', 'Altro']);
    expect(sel.value).toBe('Gruppo');
    fireEvent.change(sel, { target: { value: 'Altro' } });
    fireEvent.change(sel, { target: { value: '' } });
    expect(emitsOf('image:destination')).toEqual([
      ['image:destination', { locationId: 'L1', imageId: 'I1', destination: 'Altro' }],
      ['image:destination', { locationId: 'L1', imageId: 'I1', destination: null }],
    ]);
  });

  it('destinazioni in caricamento / non disponibili: select disabilitata', () => {
    setServer();
    act(() => useControlStore.getState().setPreviewImage('I1'));
    dest.value = null;
    const { unmount } = render(<ImagesTab />);
    let sel = screen.getByLabelText('Destinazione Telegram') as HTMLSelectElement;
    expect(sel.disabled).toBe(true);
    expect(sel.options[0].text).toBe('Caricamento…');
    unmount();
    dest.value = [];
    render(<ImagesTab />);
    sel = screen.getByLabelText('Destinazione Telegram') as HTMLSelectElement;
    expect(sel.disabled).toBe(true);
    expect(sel.options[0].text).toBe('Destinazioni non disponibili');
  });

  it('Mostra / Ritorna alla mappa', () => {
    setServer({ activeImageId: null });
    act(() => useControlStore.getState().setPreviewImage('I1'));
    render(<ImagesTab />);
    expect((screen.getByText('Ritorna alla mappa') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Mostra').className).not.toContain('is-live');
    click(screen.getByText('Mostra'));
    expect(emitsOf('image:show')).toEqual([['image:show', { imageId: 'I1' }]]);
    setServer({ activeImageId: 'I1' });
    expect(screen.getByText('Mostra').className).toContain('is-live');
    expect(screen.getByText('Mostra').className).toContain('--vtt-accent');
    click(screen.getByText('Ritorna alla mappa'));
    expect(emitsOf('image:hide')).toEqual([['image:hide']]);
  });

  it('Invia: disabilitato senza destinazione, imposta pending e azzera feedback', () => {
    setServer();
    act(() => useControlStore.getState().setPreviewImage('I2'));
    const { unmount } = render(<ImagesTab />);
    expect((screen.getByText('Invia') as HTMLButtonElement).disabled).toBe(true);
    unmount();
    act(() => useControlStore.getState().setPreviewImage('I1'));
    act(() => useControlStore.getState().setTelegram({ feedback: { imageId: 'I1', ok: false, error: 'boom' } }));
    render(<ImagesTab />);
    expect(screen.getByText('boom').className).toContain('error');
    click(screen.getByText('Invia'));
    expect(emitsOf('image:sendTelegram')).toEqual([['image:sendTelegram', { locationId: 'L1', imageId: 'I1' }]]);
    expect(useControlStore.getState().telegramPending).toBe(true);
    expect(useControlStore.getState().telegramFeedback).toBeNull();
    const b = screen.getByText('Invio…') as HTMLButtonElement;
    expect(b.disabled).toBe(true);
  });

  it('feedback solo per l\'immagine corrente; "Inviata ✓" senza classe error', () => {
    setServer();
    act(() => useControlStore.getState().setPreviewImage('I1'));
    act(() => useControlStore.getState().setTelegram({ feedback: { imageId: 'I2', ok: true } }));
    const { unmount } = render(<ImagesTab />);
    expect(screen.queryByText('Inviata ✓')).toBeNull();
    unmount();
    act(() => useControlStore.getState().setTelegram({ feedback: { imageId: 'I1', ok: true } }));
    render(<ImagesTab />);
    expect(screen.getByText('Inviata ✓').className).not.toContain('error');
  });
});

describe('AudioBox', () => {
  const audio = (m: string | null, s: string | null, mv?: number) => ({ main: track(m, mv), special: track(s) });
  const L = (a: unknown) => [loc('L1', [], a)];

  it('nascosto senza tracce', () => {
    setServer({}, L(audio(null, null)));
    const { container } = render(<AudioBox />);
    expect(container.innerHTML).toBe('');
  });

  it('solo speciale: riga speciale, nessun playback se la traccia attiva e vuota', () => {
    setServer({ activeAudioTrack: 'main' }, L(audio(null, 's.mp3')));
    render(<AudioBox />);
    click(screen.getByTitle('Fai partire la traccia speciale'));
    expect(emitsOf('audio:playSpecial')).toEqual([['audio:playSpecial', {}]]);
    expect(screen.queryByTitle('Stop')).toBeNull();
  });

  it('solo principale: nessuna riga speciale; etichette e play/pausa', () => {
    setServer({}, L(audio('m.mp3', null)));
    render(<AudioBox />);
    expect(screen.queryByTitle('Fai partire la traccia speciale')).toBeNull();
    expect(screen.getByText('Principale')).toBeTruthy();
    const pp = screen.getByTitle('Play/Pausa');
    expect(pp.className).not.toContain('active');
    click(pp);
    expect(emitsOf('audio:play')).toEqual([['audio:play', {}]]);
    setServer({ audioState: 'playing', activeAudioTrack: 'main' }, L(audio('m.mp3', null)));
    expect(screen.getByTitle('Play/Pausa').className).toContain('active');
    expect(screen.getByTitle('Play/Pausa').className).toContain('--vtt-accent');
    click(screen.getByTitle('Play/Pausa'));
    expect(emitsOf('audio:pause')).toEqual([['audio:pause', {}]]);
    click(screen.getByTitle('Stop'));
    expect(emitsOf('audio:stop')).toEqual([['audio:stop', {}]]);
  });

  it('traccia speciale attiva: etichetta Speciale', () => {
    setServer({ activeAudioTrack: 'special' }, L(audio('m.mp3', 's.mp3')));
    render(<AudioBox />);
    expect(screen.getByText('Speciale')).toBeTruthy();
  });

  it('volume: default 70%, passo 0.1, clamp 0..1', () => {
    setServer({}, L(audio('m.mp3', null)));
    const { unmount } = render(<AudioBox />);
    expect(screen.getByText('70%')).toBeTruthy();
    click(screen.getByTitle('Riduci volume'));
    click(screen.getByTitle('Aumenta volume'));
    expect(emitsOf('audio:volume')).toEqual([['audio:volume', { volume: 0.6 }], ['audio:volume', { volume: 0.8 }]]);
    unmount();
    vi.mocked(socket.emit).mockClear();
    setServer({}, L(audio('m.mp3', null, 1)));
    render(<AudioBox />);
    click(screen.getByTitle('Aumenta volume'));
    expect(emitsOf('audio:volume')).toEqual([['audio:volume', { volume: 1 }]]);
    setServer({}, L(audio('m.mp3', null, 0.05)));
    vi.mocked(socket.emit).mockClear();
    click(screen.getByTitle('Riduci volume'));
    expect(emitsOf('audio:volume')).toEqual([['audio:volume', { volume: 0 }]]);
  });

  it('riflette la location ATTIVA, non l\'anteprima', () => {
    setServer({}, [loc('L1', [], audio(null, null)), loc('L2', [], audio('m.mp3', null))]);
    act(() => useControlStore.getState().setPreviewLocation('L2'));
    const { container } = render(<AudioBox />);
    expect(container.innerHTML).toBe('');
  });
});
