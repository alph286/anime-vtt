// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
});
