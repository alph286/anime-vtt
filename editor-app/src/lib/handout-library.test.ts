import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VttState } from '@/types';
import { handoutUsage, uploadHandoutFiles } from './handout-library';

function state(): VttState {
  return {
    activeLocationId: 'L1',
    handoutLibrary: [{ id: 'H', name: 'Mappa', file: 'h.png' }, { id: 'K', name: 'Altro', file: 'k.png' }],
    handout: { defaultId: 'H' },
    locations: [
      { id: 'L1', name: 'Taverna', handoutDefaultId: 'H' },
      { id: 'L2', name: 'Cripta', handoutDefaultId: 'H' },
      { id: 'L3', name: 'Bosco', handoutDefaultId: null },
    ],
  } as unknown as VttState;
}

describe('handoutUsage', () => {
  it('elenca le location e il default globale', () => {
    expect(handoutUsage(state(), 'H')).toEqual(['Taverna', 'Cripta', 'default globale']);
  });
  it('vuoto se non usato', () => {
    expect(handoutUsage(state(), 'K')).toEqual([]);
  });
});

describe('uploadHandoutFiles', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('un upload per file, ritorna quelli falliti', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false });
    const failed = await uploadHandoutFiles([new File(['a'], 'a.png'), new File(['b'], 'b.png')]);
    expect(failed).toEqual(['b.png']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/upload/handout');
    expect((fetchMock.mock.calls[0][1].body as FormData).get('name')).toBe('a');
  });
});
