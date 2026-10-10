// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useArmConfirm } from './use-arm-confirm';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useArmConfirm', () => {
  it('il primo press arma, il secondo conferma', () => {
    const { result } = renderHook(() => useArmConfirm());
    const onConfirm = vi.fn();
    act(() => result.current.press('a', onConfirm));
    expect(result.current.isArmed('a')).toBe(true);
    expect(onConfirm).not.toHaveBeenCalled();
    act(() => result.current.press('a', onConfirm));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(result.current.armedKey).toBeNull();
  });

  it('si disarma da solo dopo 2.5 s', () => {
    const { result } = renderHook(() => useArmConfirm());
    act(() => result.current.press('a', vi.fn()));
    act(() => { vi.advanceTimersByTime(2500); });
    expect(result.current.armedKey).toBeNull();
  });

  it('armare un’altra chiave non conferma la prima', () => {
    const { result } = renderHook(() => useArmConfirm());
    const onConfirm = vi.fn();
    act(() => result.current.press('a', onConfirm));
    act(() => result.current.press('b', onConfirm));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(result.current.isArmed('b')).toBe(true);
  });
});
