// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadDmGridOpacity, loadDmGridVisible, loadNudgePos,
  saveDmGridOpacity, saveDmGridVisible, saveNudgePos,
} from './prefs';

describe('prefs', () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

  it('valori assenti -> default', () => {
    expect(loadDmGridOpacity()).toBe(1);
    expect(loadDmGridVisible()).toBe(true);
    expect(loadNudgePos()).toBeNull();
  });
  it('valori corrotti -> default', () => {
    localStorage.setItem('dmGridOpacity', 'abc');
    localStorage.setItem('aoeNudgeOverlayPos', '{rotto');
    expect(loadDmGridOpacity()).toBe(1);
    expect(loadNudgePos()).toBeNull();
    localStorage.setItem('aoeNudgeOverlayPos', JSON.stringify({ left: 'x', top: 3 }));
    expect(loadNudgePos()).toBeNull();
  });
  it('opacita fuori range -> clampata', () => {
    localStorage.setItem('dmGridOpacity', '5');
    expect(loadDmGridOpacity()).toBe(1);
    localStorage.setItem('dmGridOpacity', '-2');
    expect(loadDmGridOpacity()).toBe(0);
  });
  it('round-trip', () => {
    saveDmGridOpacity(0.3);
    saveDmGridVisible(false);
    saveNudgePos({ left: 12, top: 34 });
    expect(loadDmGridOpacity()).toBe(0.3);
    expect(loadDmGridVisible()).toBe(false);
    expect(loadNudgePos()).toEqual({ left: 12, top: 34 });
  });
  it('localStorage che lancia -> default, nessuna eccezione', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('no'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('no'); });
    expect(loadDmGridOpacity()).toBe(1);
    expect(loadDmGridVisible()).toBe(true);
    expect(loadNudgePos()).toBeNull();
    expect(() => saveDmGridOpacity(0.5)).not.toThrow();
    expect(() => saveDmGridVisible(true)).not.toThrow();
    expect(() => saveNudgePos({ left: 1, top: 1 })).not.toThrow();
  });
});
