// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/socket', () => ({
  socket: { on: vi.fn(), off: vi.fn(), emit: vi.fn(), connected: false },
}));

import { socket } from '@/lib/socket';
import { useEditorStore } from '@/store/editor-store';
import type { VttState } from '@/types';
import { HandoutLibraryDialog } from './HandoutLibraryDialog';

const loc = (id: string, name: string, handoutDefaultId: string | null) =>
  ({ id, name, archived: false, images: [], handoutDefaultId, map: { polygons: [], shaders: [], audio: { background: [], oneshot: [] } } });
function state(): VttState {
  return {
    activeLocationId: 'L1',
    handoutLibrary: [
      { id: 'H', name: 'Mappa', file: 'h.png' },
      { id: 'K', name: 'Copertina', file: 'k.png' },
    ],
    handout: { defaultId: null },
    locations: [loc('L1', 'Taverna', 'H'), loc('L2', 'Cripta', null)],
  } as unknown as VttState;
}
const emitsOf = (ev: string) => vi.mocked(socket.emit).mock.calls.filter((c) => c[0] === ev);
const L1 = { locationId: 'L1', label: 'Taverna' };

beforeEach(() => {
  vi.mocked(socket.emit).mockClear();
  act(() => useEditorStore.getState().receiveState(state()));
});

describe('HandoutLibraryDialog', () => {
  it('Usa imposta il default della location', () => {
    const onOpenChange = vi.fn();
    render(<HandoutLibraryDialog open onOpenChange={onOpenChange} target={L1} />);
    // Ordinate per nome: Copertina, Mappa.
    fireEvent.click(screen.getAllByRole('button', { name: 'Usa' })[0]);
    expect(emitsOf('handout:setDefault')).toEqual([['handout:setDefault', { locationId: 'L1', id: 'K' }]]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('target globale manda locationId null', () => {
    render(<HandoutLibraryDialog open onOpenChange={() => {}} target={{ locationId: null, label: 'globale' }} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Usa' })[1]);
    expect(emitsOf('handout:setDefault')).toEqual([['handout:setDefault', { locationId: null, id: 'H' }]]);
  });

  it('Nessuno toglie il default', () => {
    render(<HandoutLibraryDialog open onOpenChange={() => {}} target={L1} />);
    fireEvent.click(screen.getByRole('button', { name: 'Nessuno' }));
    expect(emitsOf('handout:setDefault')).toEqual([['handout:setDefault', { locationId: 'L1', id: null }]]);
  });

  it('elimina una voce usata: avviso con le location, poi Elimina', () => {
    render(<HandoutLibraryDialog open onOpenChange={() => {}} target={L1} />);
    fireEvent.click(screen.getAllByTitle("Elimina dall'archivio")[1]);
    expect(screen.getByText('Usato in: Taverna — verrà tolto da tutte.')).toBeTruthy();
    expect(emitsOf('handoutLibrary:delete')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Elimina' }));
    expect(emitsOf('handoutLibrary:delete')).toEqual([['handoutLibrary:delete', { id: 'H' }]]);
  });

  it('elimina una voce non usata: due click', () => {
    render(<HandoutLibraryDialog open onOpenChange={() => {}} target={L1} />);
    fireEvent.click(screen.getAllByTitle("Elimina dall'archivio")[0]);
    expect(emitsOf('handoutLibrary:delete')).toHaveLength(0);
    fireEvent.click(screen.getByTitle('Click di nuovo per confermare'));
    expect(emitsOf('handoutLibrary:delete')).toEqual([['handoutLibrary:delete', { id: 'K' }]]);
  });

  it('rinomina emette handoutLibrary:update', () => {
    render(<HandoutLibraryDialog open onOpenChange={() => {}} target={L1} />);
    const input = screen.getByDisplayValue('Mappa');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Mondo' } });
    fireEvent.blur(input);
    expect(emitsOf('handoutLibrary:update')).toEqual([['handoutLibrary:update', { id: 'H', name: 'Mondo' }]]);
  });
});
