// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/socket', () => ({
  socket: { on: vi.fn(), off: vi.fn(), emit: vi.fn(), connected: false },
}));

import { socket } from '@/lib/socket';
import ControlApp from './ControlApp';
import { useControlStore } from './store/control-store';
import type { ControlState } from './types';

// jsdom non implementa queste API usate da Radix Select.
beforeEach(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});

function loc(id: string, name: string, extra: Record<string, unknown> = {}) {
  return {
    id, name, archived: false, images: [{ id: 'img1', name: 'Mappa del tesoro' }],
    map: { file: 'm.png', aoes: [] }, ...extra,
  };
}
function fixture(over: Record<string, unknown> = {}): ControlState {
  return {
    activeLocationId: 'L1', activeImageId: null,
    locations: [loc('L1', 'Taverna'), loc('L2', 'Foresta'), loc('L3', 'Vecchia', { archived: true })],
    ...over,
  } as unknown as ControlState;
}
const get = () => useControlStore.getState();

async function pickLocation(name: string) {
  const trigger = screen.getByRole('combobox');
  fireEvent.keyDown(trigger, { key: 'Enter' });
  const opt = await screen.findByRole('option', { name });
  fireEvent.click(opt);
}

describe('ControlApp', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(socket.emit).mockClear();
    useControlStore.setState({
      server: null, previewLocationId: null, previewImageId: null, mode: null, tab: 'mappa',
      socketConnected: false, displayConnected: false,
    });
  });

  it('a) con server=null rende lo shell con placeholder', () => {
    render(<ControlApp />);
    expect(screen.getByRole('combobox').textContent).toContain('— nessuna location —');
    expect(screen.getByTestId('map-tab')).toBeTruthy();
    expect(screen.queryByText(/Anteprima:/)).toBeNull();
  });

  it('b) la select elenca solo location non archiviate, valore = previewLocationId', async () => {
    useControlStore.getState().receiveState(fixture());
    render(<ControlApp />);
    const trigger = screen.getByRole('combobox');
    expect(trigger.textContent).toContain('Taverna');
    fireEvent.keyDown(trigger, { key: 'Enter' });
    const options = await screen.findAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Taverna', 'Foresta']);
  });

  it('c) scegliere un\'altra location mostra il banner anteprima e i pulsanti', async () => {
    get().receiveState(fixture());
    render(<ControlApp />);
    await pickLocation('Foresta');
    expect(get().previewLocationId).toBe('L2');
    expect(screen.getByText(/non visibile ai giocatori/)).toBeTruthy();
    expect(screen.getByText('Foresta', { selector: 'strong' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Invia al display' }));
    expect(socket.emit).toHaveBeenCalledWith('location:set', { locationId: 'L2' });
    fireEvent.click(screen.getByRole('button', { name: 'Annulla anteprima' }));
    expect(get().previewLocationId).toBe('L1');
    expect(screen.queryByText(/non visibile ai giocatori/)).toBeNull();
  });

  it('d) con activeImageId valido mostra "Stai mostrando X ai giocatori"', () => {
    get().receiveState(fixture({ activeImageId: 'img1' }));
    render(<ControlApp />);
    expect(screen.getByText('Mappa del tesoro', { selector: 'strong' })).toBeTruthy();
    expect(screen.getByText(/Stai mostrando/)).toBeTruthy();
  });

  it('e) tab Media disabilitata in anteprima; se attiva torna a mappa', async () => {
    get().receiveState(fixture());
    render(<ControlApp />);
    const imgTab = screen.getByRole('tab', { name: /Media/ });
    expect((imgTab as HTMLButtonElement).disabled).toBe(false);
    act(() => get().setTab('immagini'));
    expect(get().tab).toBe('immagini');
    act(() => get().setPreviewLocation('L2'));
    expect((screen.getByRole('tab', { name: /Media/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(get().tab).toBe('mappa');
  });

  it('f) pallino wifi ok solo con socket e display connessi', () => {
    render(<ControlApp />);
    const dot = () => screen.getByTestId('wifi-dot');
    expect(dot().className).toContain('bad');
    act(() => get().setConnected(true));
    expect(dot().className).toContain('bad');
    act(() => get().setDisplayConnected(true));
    expect(dot().className).toContain('ok');
    expect(dot().className).not.toContain('bad');
  });

  it('tiene montati tutti e tre i pannelli', () => {
    render(<ControlApp />);
    expect(screen.getByTestId('map-tab')).toBeTruthy();
    expect(screen.getByTestId('fog-tab')).toBeTruthy();
    expect(screen.getByTestId('images-tab')).toBeTruthy();
  });
});
