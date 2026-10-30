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
    locations: [{
      id: 'L1', name: 'L1', archived: false, images: [],
      map: {
        file: null, type: 'image', scale: 1, flip180: false, rotate90: false, grid: GRID, polygons: [], shaders: [],
        audio: {
          background: [{ id: 'B1', name: 'Pioggia', file: 'b.mp3', icon: 'music', volume: 0.7, handout: false, restartOnStop: false, on: false }],
          oneshot: [{ id: 'O1', name: 'Tuono', file: 'o.mp3', icon: 'zap', volume: 0.7, handout: true }],
        },
      },
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

  it('cambio nome emette audio:update', () => {
    render(<AudioPanel />);
    const input = screen.getByDisplayValue('Pioggia');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Temporale' } });
    fireEvent.blur(input);
    expect(emitsOf('audio:update')).toEqual([['audio:update', { locationId: 'L1', trackId: 'B1', name: 'Temporale' }]]);
  });

  it('scelta icona dal popover emette audio:update', async () => {
    render(<AudioPanel />);
    const btns = screen.getAllByTitle('Scegli icona');
    await act(async () => { fireEvent.pointerDown(btns[0], { button: 0, pointerType: 'mouse' }); fireEvent.click(btns[0]); });
    const flame = await screen.findByTitle('Fuoco');
    fireEvent.click(flame);
    expect(emitsOf('audio:update')).toEqual([['audio:update', { locationId: 'L1', trackId: 'B1', icon: 'flame' }]]);
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

  it('elimina richiede due click', () => {
    render(<AudioPanel />);
    const del = screen.getAllByTitle('Elimina traccia')[1];
    fireEvent.click(del);
    expect(emitsOf('audio:delete')).toHaveLength(0);
    fireEvent.click(screen.getByTitle('Click di nuovo per confermare'));
    expect(emitsOf('audio:delete')).toEqual([['audio:delete', { locationId: 'L1', trackId: 'O1' }]]);
  });

  it('upload di 2 file in sequenza; il fallimento del primo non ferma il secondo e viene segnalato', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'no' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    const { container } = render(<AudioPanel />);
    const input = container.querySelectorAll('input[type=file]')[0] as HTMLInputElement;
    const f1 = new File(['a'], 'uno.mp3', { type: 'audio/mpeg' });
    const f2 = new File(['b'], 'due.mp3', { type: 'audio/mpeg' });
    await act(async () => { fireEvent.change(input, { target: { files: [f1, f2] } }); });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[0][0]).toBe('/api/upload/audio');
    const b1 = fetchMock.mock.calls[0][1].body as FormData;
    expect(b1.get('kind')).toBe('background');
    expect(b1.get('locationId')).toBe('L1');
    expect((b1.get('file') as File).name).toBe('uno.mp3');
    expect((fetchMock.mock.calls[1][1].body as FormData).get('file')).toBe(f2);
    await waitFor(() => expect(screen.getByText(/uno\.mp3/)).toBeTruthy());
  });

  it('upload nella sezione One-shot usa kind oneshot', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    const { container } = render(<AudioPanel />);
    const input = container.querySelectorAll('input[type=file]')[1] as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { files: [new File(['a'], 'x.mp3')] } }); });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect((fetchMock.mock.calls[0][1].body as FormData).get('kind')).toBe('oneshot');
  });
});
