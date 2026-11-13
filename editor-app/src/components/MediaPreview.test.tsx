// @vitest-environment jsdom
import { StrictMode } from 'react';
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MediaPreview } from './MediaPreview';

describe('MediaPreview', () => {
  it('immagine: <img> con src di storage', () => {
    const { container } = render(<MediaPreview file="a.png" name="A" />);
    expect(container.querySelector('video')).toBeNull();
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/storage/images/a.png');
  });

  it('video: <video> muto; ferma sul primo fotogramma senza playing', () => {
    const { container } = render(<MediaPreview file="b.MP4" />);
    const v = container.querySelector('video')!;
    expect(container.querySelector('img')).toBeNull();
    expect(v.muted).toBe(true);
    expect(v.loop).toBe(false);
    expect(v.getAttribute('src')).toBe('/storage/images/b.MP4#t=0.1');
  });

  it('video con playing: loop e autoplay', () => {
    const { container } = render(<MediaPreview file="b.webm" playing />);
    const v = container.querySelector('video')!;
    expect(v.loop).toBe(true);
    expect(v.autoplay).toBe(true);
    expect(v.getAttribute('src')).toBe('/storage/images/b.webm');
  });

  // Cambiando location le miniature video vengono smontate: senza un rilascio
  // esplicito il browser tiene decoder e fotogrammi (memoria GPU) finché non
  // distrugge il player, molto dopo. Crash di Chrome su NVIDIA il 13 nov 2026.
  describe('rilascio del video allo smontaggio', () => {
    afterEach(() => vi.restoreAllMocks());

    it('toglie src e chiama load() quando la miniatura viene smontata', () => {
      const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
      vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
      const { container, unmount } = render(<MediaPreview file="b.mp4" />);
      const v = container.querySelector('video')!;
      load.mockClear();
      unmount();
      expect(v.hasAttribute('src')).toBe(false);
      expect(load).toHaveBeenCalledTimes(1);
    });

    it('in StrictMode (attacca, stacca, riattacca) la miniatura resta con il suo src', () => {
      vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
      vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
      const { container } = render(<StrictMode><MediaPreview file="b.mp4" /></StrictMode>);
      expect(container.querySelector('video')!.getAttribute('src')).toBe('/storage/images/b.mp4#t=0.1');
    });

    it('cambiando file sullo stesso elemento resta il src nuovo', () => {
      vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
      vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
      const { container, rerender } = render(<MediaPreview file="b.mp4" />);
      rerender(<MediaPreview file="c.mp4" />);
      expect(container.querySelector('video')!.getAttribute('src')).toBe('/storage/images/c.mp4#t=0.1');
    });
  });
});
