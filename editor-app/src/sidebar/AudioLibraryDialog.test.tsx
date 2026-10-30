// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/socket', () => ({
  socket: { on: vi.fn(), off: vi.fn(), emit: vi.fn(), connected: false },
}));

import { socket } from '@/lib/socket';
import { useEditorStore } from '@/store/editor-store';
import type { VttState } from '@/types';
import { AudioLibraryDialog } from './AudioLibraryDialog';

const row = (id: string, audioId: string) => ({ id, audioId, name: 'x', file: 'x.mp3', icon: 'music', volume: 0.7, handout: false });
const loc = (id: string, name: string, background: unknown[]) =>
  ({ id, name, archived: false, images: [], map: { polygons: [], shaders: [], audio: { background, oneshot: [] } } });
function state(): VttState {
  return {
    activeLocationId: 'L1',
    audioLibrary: [
      { id: 'P', name: 'Pioggia', icon: 'music', file: 'p.mp3' },
      { id: 'C', name: 'Corvi', icon: 'zap', file: 'c.mp3' },
    ],
    locations: [loc('L1', 'Taverna', [row('a', 'P')]), loc('L2', 'Cripta', [row('b', 'P')])],
  } as unknown as VttState;
}
const emitsOf = (ev: string) => vi.mocked(socket.emit).mock.calls.filter((c) => c[0] === ev);
const fetchMock = vi.fn();

beforeEach(() => {
  vi.mocked(socket.emit).mockClear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  act(() => useEditorStore.getState().receiveState(state()));
});

describe('AudioLibraryDialog', () => {
  it('elenca le voci ordinate per nome con l\'uso', () => {
    render(<AudioLibraryDialog open onOpenChange={() => {}} />);
    const names = screen.getAllByPlaceholderText('nome').map((i) => (i as HTMLInputElement).value);
    expect(names).toEqual(['Corvi', 'Pioggia']);
    expect(screen.getByText('Usato in 2 location')).toBeTruthy();
    expect(screen.getByText('Non usato')).toBeTruthy();
  });

  it('cambio nome emette audioLibrary:update', () => {
    render(<AudioLibraryDialog open onOpenChange={() => {}} />);
    const input = screen.getByDisplayValue('Pioggia');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Temporale' } });
    fireEvent.blur(input);
    expect(emitsOf('audioLibrary:update')).toEqual([['audioLibrary:update', { audioId: 'P', name: 'Temporale' }]]);
  });

  it('scelta icona emette audioLibrary:update', async () => {
    render(<AudioLibraryDialog open onOpenChange={() => {}} />);
    const btn = screen.getAllByTitle('Scegli icona')[1];
    await act(async () => { fireEvent.pointerDown(btn, { button: 0, pointerType: 'mouse' }); fireEvent.click(btn); });
    fireEvent.click(await screen.findByTitle('Fuoco'));
    expect(emitsOf('audioLibrary:update')).toEqual([['audioLibrary:update', { audioId: 'P', icon: 'flame' }]]);
  });

  it('elimina un audio non usato: due click', () => {
    render(<AudioLibraryDialog open onOpenChange={() => {}} />);
    fireEvent.click(screen.getAllByTitle("Elimina dall'archivio")[0]);
    expect(emitsOf('audioLibrary:delete')).toHaveLength(0);
    fireEvent.click(screen.getByTitle('Click di nuovo per confermare'));
    expect(emitsOf('audioLibrary:delete')).toEqual([['audioLibrary:delete', { audioId: 'C' }]]);
  });

  it('elimina un audio usato: avviso con le location, Annulla non emette, Elimina sì', () => {
    render(<AudioLibraryDialog open onOpenChange={() => {}} />);
    fireEvent.click(screen.getAllByTitle("Elimina dall'archivio")[1]);
    expect(screen.getByText('Usato in: Taverna, Cripta — verrà tolto da tutte le location.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Annulla' }));
    expect(emitsOf('audioLibrary:delete')).toHaveLength(0);
    expect(screen.queryByText(/verrà tolto da tutte/)).toBeNull();
    fireEvent.click(screen.getAllByTitle("Elimina dall'archivio")[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Elimina' }));
    expect(emitsOf('audioLibrary:delete')).toEqual([['audioLibrary:delete', { audioId: 'P' }]]);
  });

  it('Carica manda i file all\'archivio senza location', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    render(<AudioLibraryDialog open onOpenChange={() => {}} />);
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { files: [new File(['a'], 'gufo.mp3')] } }); });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect((fetchMock.mock.calls[0][1].body as FormData).get('locationId')).toBeNull();
  });
});
