import { describe, expect, it } from 'vitest';
import { clamp, parseClamped } from './numbers';

describe('parseClamped', () => {
  it('stringa vuota o non numerica → null', () => {
    expect(parseClamped('', 0, 10)).toBeNull();
    expect(parseClamped('abc', 0, 10)).toBeNull();
  });
  it('limita ai bordi', () => {
    expect(parseClamped('15', 0, 10)).toBe(10);
    expect(parseClamped('-5', 0, 10)).toBe(0);
    expect(parseClamped('3.5', 0, 10)).toBe(3.5);
  });
});
describe('clamp', () => {
  it('limita', () => {
    expect(clamp(120, 0, 100)).toBe(100);
    expect(clamp(-1, 0, 100)).toBe(0);
  });
});
