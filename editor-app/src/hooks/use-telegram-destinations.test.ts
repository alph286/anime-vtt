import { describe, expect, it } from 'vitest';
import { sanitizeDestinations } from './use-telegram-destinations';

describe('sanitizeDestinations', () => {
  it('scarta risposte non array', () => {
    expect(sanitizeDestinations(null)).toEqual([]);
    expect(sanitizeDestinations({ error: 'x' })).toEqual([]);
  });
  it('tiene solo destinazioni con nome stringa non vuoto', () => {
    expect(sanitizeDestinations([{ name: 'A' }, { name: '' }, { name: 3 }, null, 'x', {}])).toEqual([{ name: 'A' }]);
  });
});
