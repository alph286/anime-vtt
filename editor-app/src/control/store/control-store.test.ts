// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  selectPingAvailable, selectAoeAvailable, selectSelectedAoe, useControlStore,
} from './control-store';
import type { ControlState } from '../types';

function loc(id: string, extra: Record<string, unknown> = {}) {
  return {
    id, name: id, archived: false, images: [{ id: 'img1' }],
    map: { file: 'm.png', aoes: [{ id: 'a1' }] },
    ...extra,
  };
}
function st(over: Record<string, unknown> = {}): ControlState {
  return {
    activeLocationId: 'L1', activeImageId: null,
    locations: [loc('L1'), loc('L2')],
    ...over,
  } as unknown as ControlState;
}
const get = () => useControlStore.getState();

describe('control-store', () => {
  beforeEach(() => {
    localStorage.clear();
    useControlStore.setState({
      server: null, previewLocationId: null, previewImageId: null, mode: null,
      selectedAoeId: null, localZoom: { scale: 1, x: 0, y: 0 },
    });
  });

  it('a) preview nulla -> location attiva', () => {
    get().receiveState(st());
    expect(get().previewLocationId).toBe('L1');
  });
  it('b) preview archiviata/cancellata -> attiva', () => {
    get().receiveState(st());
    get().setPreviewLocation('L2');
    get().receiveState(st({ locations: [loc('L1'), loc('L2', { archived: true })] }));
    expect(get().previewLocationId).toBe('L1');
    get().setPreviewLocation('L2');
    get().receiveState(st({ locations: [loc('L1')] }));
    expect(get().previewLocationId).toBe('L1');
  });
  it('c) previewImageId inesistente -> null', () => {
    get().receiveState(st());
    get().setPreviewImage('img1');
    get().receiveState(st());
    expect(get().previewImageId).toBe('img1');
    get().receiveState(st({ locations: [loc('L1', { images: [] }), loc('L2')] }));
    expect(get().previewImageId).toBeNull();
  });
  it('d) selectedAoeId inesistente -> null', () => {
    get().receiveState(st());
    get().selectAoe('a1');
    expect(selectSelectedAoe(get())?.id).toBe('a1');
    get().receiveState(st({ locations: [loc('L1', { map: { file: 'm.png', aoes: [] } }), loc('L2')] }));
    expect(get().selectedAoeId).toBeNull();
  });
  it('e) setMode ping con gating falso resta null', () => {
    get().receiveState(st({ activeImageId: 'x' }));
    expect(selectPingAvailable(get())).toBe(false);
    get().setMode('ping');
    expect(get().mode).toBeNull();
  });
  it('f) setMode pan due volte -> null', () => {
    get().receiveState(st());
    get().setMode('pan');
    expect(get().mode).toBe('pan');
    get().setMode('pan');
    expect(get().mode).toBeNull();
  });
  it('g) entrare in pan azzera zoom ma non lo storage', () => {
    get().receiveState(st());
    get().setMode('zoom');
    get().setLocalZoom({ scale: 2, x: 5, y: 5 }, { persist: true });
    get().setMode('pan');
    expect(get().localZoom).toEqual({ scale: 1, x: 0, y: 0 });
    expect(JSON.parse(localStorage.getItem('zoomLocalState')!).scale).toBe(2);
  });
  it('h) immagine mostrata con mode ping -> null', () => {
    get().receiveState(st());
    get().setMode('ping');
    expect(get().mode).toBe('ping');
    get().receiveState(st({ activeImageId: 'img1' }));
    expect(get().mode).toBeNull();
  });
  it('i) selectAoe set/get', () => {
    get().selectAoe('zz');
    expect(get().selectedAoeId).toBe('zz');
  });
  it('j) setPreviewLocation azzera localZoom', () => {
    get().receiveState(st());
    get().setLocalZoom({ scale: 3, x: 1, y: 1 });
    get().setPreviewLocation('L2');
    expect(get().localZoom.scale).toBe(1);
  });
  it('aoe disponibile richiede file mappa', () => {
    get().receiveState(st());
    expect(selectAoeAvailable(get())).toBe(true);
    get().receiveState(st({ locations: [loc('L1', { map: { file: null, aoes: [] } })] }));
    expect(selectAoeAvailable(get())).toBe(false);
  });
});
