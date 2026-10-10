import { useEffect } from 'react';
import { selectActiveLocation, useEditorStore } from '@/store/editor-store';
import type { MapMedia } from './MapStage';

export function useShaderLoop(mediaRef: React.MutableRefObject<MapMedia | null>) {
  useEffect(() => {
    const canvas = document.getElementById('map-shader-canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    const layer = new ShaderLayer(canvas);
    let raf = 0;
    let running = true;

    const step = () => {
      const loc = selectActiveLocation(useEditorStore.getState());
      const media = mediaRef.current;
      let shaders = loc?.map.shaders ?? [];
      if (loc && loc.map.file && media) {
        layer.render(shaders, loc.map.grid, mediaW(media), mediaH(media));
      } else {
        shaders = [];
      }
      if (!shaders.length) { running = false; return; }
      raf = requestAnimationFrame(step);
    };

    const kick = () => {
      const loc = selectActiveLocation(useEditorStore.getState());
      if ((loc?.map.shaders?.length ?? 0) > 0 && !running) {
        running = true;
        raf = requestAnimationFrame(step);
      }
    };

    raf = requestAnimationFrame(step);
    const unsubscribe = useEditorStore.subscribe(kick);
    return () => { cancelAnimationFrame(raf); unsubscribe(); running = false; };
  }, [mediaRef]);
}
