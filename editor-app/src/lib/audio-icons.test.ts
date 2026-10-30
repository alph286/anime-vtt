import { describe, expect, it } from 'vitest';
import { AUDIO_ICONS, DEFAULT_AUDIO_ICON, audioIcon } from './audio-icons';

describe('audio-icons', () => {
  it('slug unici e conformi', () => {
    const slugs = AUDIO_ICONS.map((i) => i.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9-]{1,40}$/);
  });
  it('contiene music e zap, con default corretti', () => {
    const slugs = AUDIO_ICONS.map((i) => i.slug);
    expect(slugs).toContain('music');
    expect(slugs).toContain('zap');
    expect(DEFAULT_AUDIO_ICON).toEqual({ background: 'music', oneshot: 'zap' });
  });
  it('slug sconosciuto o assente: ripiego su music', () => {
    expect(audioIcon('boh')).toBe(audioIcon('music'));
    expect(audioIcon(undefined)).toBe(audioIcon('music'));
    expect(audioIcon('zap')).not.toBe(audioIcon('music'));
  });
});
