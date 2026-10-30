// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/socket', () => ({
  socket: { on: vi.fn(), off: vi.fn(), emit: vi.fn(), connected: false },
}));

import { socket } from '@/lib/socket';
import { useEditorStore } from '@/store/editor-store';
import type { VttState } from '@/types';
import { AudioPanel } from './AudioPanel';

const GRID = { enabled: false, cellSize: 100, baseCellSize: 100, divisions: 1, offsetX: 0, offsetY: 0, color: '#fff', lineWidth: 0.3, opacity: 1 };
function state(): VttState {
  return {
    activeLocationId: 'L1',
    audioLibrary: [
      { id: 'A1', name: 'Pioggia', icon: 'music', file: 'b.mp3' },
      { id: 'A2', name: 'Tuono', icon: 'zap', file: 'o.mp3' },
      { id: 'A3', name: 'Corvi', icon: 'bird', file: 'c.mp3' },
    ],
    locations: [{
      id: 'L1', name: 'L1', archived: false, images: [],
      map: {
        file: null, type: 'image', scale: 1, flip180: false, rotate90: false, grid: GRID, polygons: [], shaders: [],
        audio: {
          background: [{ id: 'B1', audioId: 'A1', name: 'Pioggia', file: 'b.mp3', icon: 'music', volume: 0.7, handout: false, restartOnStop: false, on: false }],
          oneshot: [{ id: 'O1', audioId: 'A2', name: 'Tuono', file: 'o.mp3', icon: 'zap', volume: 0.7, handout: true }],
        },
      },
    }, {
      id: 'L2', name: 'Cripta', archived: false, images: [],
      map: { file: null, type: 'image', scale: 1, flip180: false, rotate90: false, grid: GRID, polygons: [], shaders: [],
        audio: { background: [{ id: 'B9', audioId: 'A3', name: 'Corvi', file: 'c.mp3', icon: 'bird', volume: 0.7, handout: false, restartOnStop: false, on: false }], oneshot: [] } },
    }, {
      id: 'L3', name: 'Vuota', archived: false, images: [],
      map: { file: null, type: 'image', scale: 1, flip180: false, rotate90: false, grid: GRID, polygons: [], shaders: [],
        audio: { background: [], oneshot: [] } },
    }],
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

describe('AudioPanel', () => {
  it('mostra le sezioni Background e One-shot con le righe', () => {
    render(<AudioPanel />);
    expect(screen.getByText('Background')).toBeTruthy();
    expect(screen.getByText('One-shot')).toBeTruthy();
    expect((screen.getByDisplayValue('Pioggia') as HTMLInputElement)).toBeTruthy();
    expect(screen.getByDisplayValue('Tuono')).toBeTruthy();
  });

  it('cambio nome emette audioLibrary:update e lo dice', () => {
    render(<AudioPanel />);
    const input = screen.getByDisplayValue('Pioggia');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Temporale' } });
    fireEvent.blur(input);
    expect(emitsOf('audioLibrary:update')).toEqual([['audioLibrary:update', { audioId: 'A1', name: 'Temporale' }]]);
    expect(screen.getByText('Nome e icona valgono in tutte le location')).toBeTruthy();
  });

  it('scelta icona dal popover emette audioLibrary:update', async () => {
    render(<AudioPanel />);
    const btns = screen.getAllByTitle('Scegli icona');
    await act(async () => { fireEvent.pointerDown(btns[0], { button: 0, pointerType: 'mouse' }); fireEvent.click(btns[0]); });
    const flame = await screen.findByTitle('Fuoco');
    fireEvent.click(flame);
    expect(emitsOf('audioLibrary:update')).toEqual([['audioLibrary:update', { audioId: 'A1', icon: 'flame' }]]);
  });

  it('checkbox restartOnStop solo nei background', () => {
    render(<AudioPanel />);
    const boxes = screen.getAllByLabelText("Riparti dall'inizio quando lo spegni");
    expect(boxes).toHaveLength(1);
    fireEvent.click(boxes[0]);
    expect(emitsOf('audio:update')).toEqual([['audio:update', { locationId: 'L1', trackId: 'B1', restartOnStop: true }]]);
  });

  it('checkbox handout in background e one-shot', () => {
    render(<AudioPanel />);
    const boxes = screen.getAllByLabelText('Suona anche su /handout');
    expect(boxes).toHaveLength(2);
    fireEvent.click(boxes[0]);
    fireEvent.click(boxes[1]);
    expect(emitsOf('audio:update')).toEqual([
      ['audio:update', { locationId: 'L1', trackId: 'B1', handout: true }],
      ['audio:update', { locationId: 'L1', trackId: 'O1', handout: false }],
    ]);
  });

  it('togli dalla location richiede due click', () => {
    render(<AudioPanel />);
    const del = screen.getAllByTitle('Togli da questa location')[1];
    fireEvent.click(del);
    expect(emitsOf('audio:delete')).toHaveLength(0);
    fireEvent.click(screen.getByTitle('Click di nuovo per confermare'));
    expect(emitsOf('audio:delete')).toEqual([['audio:delete', { locationId: 'L1', trackId: 'O1' }]]);
  });

  const openAdd = async (n: number) => {
    const btn = screen.getAllByRole('button', { name: 'Aggiungi' })[n];
    await act(async () => { fireEvent.pointerDown(btn, { button: 0, pointerType: 'mouse' }); fireEvent.click(btn); });
  };

  it('Aggiungi elenca l\'archivio; scegliere una voce emette audio:add e la lista resta aperta', async () => {
    render(<AudioPanel />);
    await openAdd(0);
    fireEvent.click(await screen.findByRole('button', { name: 'Corvi' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tuono' }));
    expect(emitsOf('audio:add')).toEqual([
      ['audio:add', { locationId: 'L1', kind: 'background', audioId: 'A3' }],
      ['audio:add', { locationId: 'L1', kind: 'background', audioId: 'A2' }],
    ]);
  });

  it('Carica nuovo… nella sezione One-shot manda location e kind oneshot', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    render(<AudioPanel />);
    await openAdd(1);
    await screen.findByText('Carica nuovo…');
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { files: [new File(['a'], 'x.mp3')] } }); });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = fetchMock.mock.calls[0][1].body as FormData;
    expect(body.get('kind')).toBe('oneshot');
    expect(body.get('locationId')).toBe('L1');
  });

  it('Copia audio da… elenca solo le altre location con audio ed emette audio:copyFrom', async () => {
    render(<AudioPanel />);
    const btn = screen.getByRole('button', { name: 'Copia audio da…' });
    await act(async () => { fireEvent.pointerDown(btn, { button: 0, pointerType: 'mouse' }); fireEvent.click(btn); });
    fireEvent.click(await screen.findByRole('button', { name: 'Cripta' }));
    expect(screen.queryByRole('button', { name: 'Vuota' })).toBeNull();
    expect(emitsOf('audio:copyFrom')).toEqual([['audio:copyFrom', { locationId: 'L1', fromLocationId: 'L2' }]]);
  });

  it('Archivio apre la finestra dell\'archivio', async () => {
    render(<AudioPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Archivio' }));
    expect(await screen.findByText('Archivio audio')).toBeTruthy();
  });
});
