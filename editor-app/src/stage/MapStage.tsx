import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { clamp } from '@/lib/numbers';
import { selectActiveLocation, useEditorStore } from '@/store/editor-store';
import { stageRefs } from './stage-refs';

export type MapMedia = HTMLImageElement | HTMLVideoElement;

export function MapStage({
  children,
  wrapChildren,
  mediaRef,
}: {
  children?: React.ReactNode;
  wrapChildren?: React.ReactNode;
  mediaRef: React.MutableRefObject<MapMedia | null>;
}) {
  const location = useEditorStore(selectActiveLocation);
  const editorZoom = useEditorStore((s) => s.editorZoom);
  const uploadWarning = useEditorStore((s) => s.uploadWarning);

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<HTMLDivElement>(null);
  const mediaWrapRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const placeholderRef = useRef<HTMLDivElement>(null);
  const gridSvgRef = useRef<SVGSVGElement>(null);

  const recompute = useCallback(() => {
    const canvas = canvasRef.current;
    const zoom = zoomRef.current;
    const wrap = mediaWrapRef.current;
    const overlay = overlayRef.current;
    const media = mediaRef.current;
    if (!canvas || !zoom || !wrap || !overlay) return;
    const s = useEditorStore.getState();
    const loc = selectActiveLocation(s);
    const scale = loc?.map.scale || 1;
    zoom.style.width = `${canvas.clientWidth * s.editorZoom * scale}px`;
    zoom.style.height = `${canvas.clientHeight * s.editorZoom * scale}px`;
    if (!loc) {
      if (gridSvgRef.current) gridSvgRef.current.innerHTML = '';
      s.setGeometry({ imageRect: null, rotation: 0, naturalW: 0, naturalH: 0 });
      return;
    }
    const nw = media ? mediaW(media) : 0;
    const nh = media ? mediaH(media) : 0;
    const rotation = loc.map.file && nw ? computeTotalRotation(nw, nh, loc.map.flip180, loc.map.rotate90) : 0;
    const effective = layoutMapWrap(zoom, wrap, rotation);
    const imageRect = loc.map.file && nw
      ? fitRect(effective.width, effective.height, nw, nh)
      : { left: 0, top: 0, width: effective.width, height: effective.height };
    positionFitBox(overlay, imageRect);
    if (gridSvgRef.current) renderGridSvg(gridSvgRef.current, loc.map.grid, nw, nh);
    s.setGeometry({ imageRect, rotation, naturalW: nw, naturalH: nh });
  }, [mediaRef]);

  useLayoutEffect(() => {
    stageRefs.canvas = canvasRef.current;
    stageRefs.wrap = wrapRef.current;
    return () => { stageRefs.canvas = null; stageRefs.wrap = null; };
  }, [recompute]);

  // Caricamento del media attivo (immagine o video).
  useLayoutEffect(() => {
    const img = imgRef.current;
    const video = videoRef.current;
    const placeholder = placeholderRef.current;
    if (!img || !video || !placeholder) return;
    if (location?.map.file) {
      mediaRef.current = loadMapMedia(img, video, location.map.file, `/storage/maps/${location.map.file}`, recompute);
      placeholder.hidden = true;
    } else {
      img.hidden = true;
      video.hidden = true;
      placeholder.hidden = false;
      mediaRef.current = img;
    }
    recompute();
  }, [location?.id, location?.map.file, mediaRef, recompute]);

  // Ricalcolo quando cambia ciò che influenza la geometria.
  useLayoutEffect(() => {
    recompute();
  }, [recompute, editorZoom, location?.map.scale, location?.map.flip180, location?.map.rotate90, location?.map.grid]);

  useEffect(() => {
    window.addEventListener('resize', recompute);
    return () => window.removeEventListener('resize', recompute);
  }, [recompute]);

  // Zoom con la rotella: listener nativo non passivo (React registrerebbe uno passivo).
  useEffect(() => {
    const canvas = canvasRef.current;
    const zoom = zoomRef.current;
    if (!canvas || !zoom) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const cursorX = e.clientX - rect.left + canvas.scrollLeft;
      const cursorY = e.clientY - rect.top + canvas.scrollTop;
      const ratioX = cursorX / zoom.offsetWidth;
      const ratioY = cursorY / zoom.offsetHeight;
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const s = useEditorStore.getState();
      s.setEditorZoom(clamp(s.editorZoom * factor, 0.5, 4));
      recompute();
      canvas.scrollLeft = ratioX * zoom.offsetWidth - (e.clientX - rect.left);
      canvas.scrollTop = ratioY * zoom.offsetHeight - (e.clientY - rect.top);
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [recompute]);

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      {uploadWarning && <p className="px-4 py-2 text-sm text-amber-400">{uploadWarning}</p>}
      <div ref={wrapRef} id="map-canvas-wrap" className="map-canvas-wrap">
        <div ref={canvasRef} id="map-canvas" className="map-canvas">
          <div ref={zoomRef} className="map-canvas-zoom">
            <div ref={mediaWrapRef} className="media-wrap">
              <div ref={overlayRef} id="overlay-box" className="overlay-box fit-box" onDragStart={(e) => e.preventDefault()}>
                <img ref={imgRef} className="map-canvas-img" draggable={false} alt="" />
                <video ref={videoRef} className="map-canvas-img" draggable={false} muted loop playsInline disablePictureInPicture />
                <div ref={placeholderRef} className="map-canvas-placeholder" />
                <canvas id="map-shader-canvas" />
                <svg ref={gridSvgRef} id="grid-svg" viewBox="0 0 100 100" preserveAspectRatio="none" />
                {children}
              </div>
            </div>
          </div>
        </div>
        {wrapChildren}
      </div>
    </section>
  );
}
