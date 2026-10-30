import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { VttState } from '@/types';
import { audioUsage, uploadAudioFiles } from './audio-library';

const row = (id: string, audioId: string) => ({ id, audioId, name: 'x', file: 'x.mp3', icon: 'music', volume: 0.7, handout: false });
const loc = (name: string, background: unknown[], oneshot: unknown[] = []) =>
  ({ id: name, name, archived: false, images: [], map: { audio: { background, oneshot } } });

describe('audioUsage', () => {
  it('nomi delle location che usano l\'audio, una volta sola, nell\'ordine delle location', () => {
    const s = { activeLocationId: null, locations: [
      loc('Taverna', [row('a', 'P'), row('b', 'P')], [row('c', 'P')]),
      loc('Bosco', [row('d', 'Q')]),
      loc('Cripta', [], [row('e', 'P')]),
    ] } as unknown as VttState;
    expect(audioUsage(s, 'P')).toEqual(['Taverna', 'Cripta']);
    expect(audioUsage(s, 'Z')).toEqual([]);
  });
});

describe('uploadAudioFiles', () => {
  const fetchMock = vi.fn();
  beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });

  it('senza location carica solo nell\'archivio, in sequenza, e riporta i falliti', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true });
    const failed = await uploadAudioFiles([new File(['a'], 'uno.mp3'), new File(['b'], 'due.ogg')]);
    expect(failed).toEqual(['uno.mp3']);
    const body = fetchMock.mock.calls[1][1].body as FormData;
    expect(body.get('name')).toBe('due');
    expect(body.get('locationId')).toBeNull();
    expect(body.get('kind')).toBeNull();
  });

  it('con location e kind li inoltra', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    await uploadAudioFiles([new File(['a'], 'uno.mp3')], { locationId: 'L1', kind: 'oneshot' });
    const body = fetchMock.mock.calls[0][1].body as FormData;
    expect(body.get('locationId')).toBe('L1');
    expect(body.get('kind')).toBe('oneshot');
  });
});
