import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { clampLocalZoomPan } from '../lib/local-zoom';
import { useMapGeometry } from '../hooks/use-map-geometry';
import { useShaderLoop } from '../hooks/use-shader-loop';
import { selectPreviewLocation, useControlStore } from '../store/control-store';
import { AoeOverlays } from './AoeOverlays';
import { CompassMarker } from './CompassMarker';
import { FogOverlays } from './FogOverlays';
import { mapRefs, type MapMedia } from './map-refs';
import { ViewportRect } from './ViewportRect';
import { useAoeGesture } from './use-aoe-gesture';
import { useFogTap } from './use-fog-tap';
import { useLocalZoomGesture } from './use-local-zoom-gesture';
import { usePanGesture } from './use-pan-gesture';
import { usePingGesture } from './use-ping-gesture';

const MODE_CLASSES = ['pan', 'fog', 'ping', 'zoom', 'aoe'] as const;

// Anteprima mappa del DM. Stessa gerarchia di layer del pannello vanilla
// (public/control/index.html): dentro .fit-box media, placeholder, canvas
// Portale, fog, griglia, canvas shader AOE, svg AOE, canvas ping -- in
// quest'ordine, che e anche l'ordine di sovrapposizione. Riquadro giallo e
// bussola stanno FUORI da #map-local-zoom-wrap: restano in spazio schermo
// stabile, non seguono lo zoom locale. I tre canvas li disegna useShaderLoop;
// l'svg AOE lo possiede AoeOverlays.
export default function MapPreview() {
  const location = useControlStore(selectPreviewLocation);
  const grid = location?.map.grid;
  const dmGridOpacity = useControlStore((s) => s.dmGridOpacity);
  const dmGridVisible = useControlStore((s) => s.dmGridVisible);
  const localZoom = useControlStore((s) => s.localZoom);
  const naturalW = useControlStore((s) => s.geometry.naturalW);
  const naturalH = useControlStore((s) => s.geometry.naturalH);
  const previewW = useControlStore((s) => s.geometry.previewW);
  const mode = useControlStore((s) => s.mode);

  const previewRef = useRef<HTMLDivElement>(null);
  const zoomWrapRef = useRef<HTMLDivElement>(null);
  const mediaWrapRef = useRef<HTMLDivElement>(null);
  const fitBoxRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const placeholderRef = useRef<HTMLDivElement>(null);
  const gridSvgRef = useRef<SVGSVGElement>(null);
  const mediaRef = useRef<MapMedia | null>(null);

  const refs = useMemo(
    () => ({ preview: previewRef, mediaWrap: mediaWrapRef, fitBox: fitBoxRef, media: mediaRef }),
    [],
  );
  const { recompute } = useMapGeometry(refs);

  useLayoutEffect(() => {
    mapRefs.preview = previewRef.current;
    mapRefs.fitBox = fitBoxRef.current;
    return () => {
      mapRefs.preview = null;
      mapRefs.fitBox = null;
      mapRefs.media = null;
    };
  }, []);

  // Gesti: listener nativi sul preview, montati DOPO il layout effect sopra
  // (che scrive mapRefs.preview).
  usePanGesture();
  useFogTap();
  useLocalZoomGesture();
  usePingGesture();
  useAoeGesture();
  // Loop WebGL (Portale, AOE lanciate, ping): stesso vincolo, legge i
  // canvas da mapRefs.fitBox.
  useShaderLoop();

  // Classi di modalita via classList, non via className: il gesto di zoom
  // aggiunge/toglie da se 'zoom-dragging' e un re-render non deve cancellarla.
  useEffect(() => {
    const preview = previewRef.current;
    if (!preview) return;
    for (const m of MODE_CLASSES) preview.classList.toggle(`mode-${m}`, mode === m);
  }, [mode]);

  // Caricamento del media (immagine o video) al cambio location/file. Senza
  // file: placeholder e src svuotati, cosi un vecchio video non resta a
  // girare nascosto.
  const file = location?.map.file ?? null;
  useLayoutEffect(() => {
    const img = imgRef.current;
    const video = videoRef.current;
    const placeholder = placeholderRef.current;
    if (!img || !video || !placeholder) return;
    if (file) {
      placeholder.hidden = true;
      mediaRef.current = loadMapMedia(img, video, file, `/storage/maps/${file}`, recompute);
    } else {
      img.hidden = true;
      video.hidden = true;
      if (img.dataset.mapSrc) {
        img.removeAttribute('src');
        delete img.dataset.mapSrc;
      }
      if (video.dataset.mapSrc) {
        video.removeAttribute('src');
        video.load();
        delete video.dataset.mapSrc;
      }
      placeholder.hidden = false;
      mediaRef.current = null;
    }
    mapRefs.media = mediaRef.current;
    recompute();
  }, [location?.id, file, recompute]);

  // Griglia sulla PROPRIA anteprima del DM: opacita/visibilita locali
  // (dmGridOpacity/dmGridVisible), non quelle condivise coi giocatori. Lo
  // spessore e diviso per lo zoom locale, altrimenti il transform del wrap
  // lo ingrosserebbe zoomando.
  useEffect(() => {
    const svg = gridSvgRef.current;
    if (!svg) return;
    if (!grid) {
      svg.innerHTML = '';
      return;
    }
    renderGridSvg(
      svg,
      {
        ...grid,
        lineWidth: (grid.lineWidth || 0.3) / Math.max(localZoom.scale, 0.01),
        enabled: grid.enabled && dmGridVisible,
        opacity: dmGridOpacity,
      },
      naturalW,
      naturalH,
    );
  }, [grid, dmGridOpacity, dmGridVisible, localZoom.scale, naturalW, naturalH]);

  // Zoom locale applicato via ref (nessuno stato React per frame).
  useLayoutEffect(() => {
    const wrap = zoomWrapRef.current;
    if (!wrap) return;
    const { scale, x, y } = localZoom;
    wrap.style.transform = scale === 1 && !x && !y ? '' : `translate(${x}px, ${y}px) scale(${scale})`;
  }, [localZoom]);

  // Lo zoom ripristinato da localStorage va clampato una sola volta, appena
  // l'anteprima ha dimensioni reali (prima il clamp non avrebbe senso). Non
  // si risalva: e un aggiustamento, non una scelta dell'utente.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current || previewW <= 0) return;
    restoredRef.current = true;
    const s = useControlStore.getState();
    const clamped = clampLocalZoomPan(s.localZoom, s.geometry.previewW, s.geometry.previewH);
    if (clamped.x !== s.localZoom.x || clamped.y !== s.localZoom.y) s.setLocalZoom(clamped, { persist: false });
  }, [previewW]);

  return (
    <div ref={previewRef} id="map-preview" className="map-preview">
      <div ref={zoomWrapRef} id="map-local-zoom-wrap">
        <div ref={mediaWrapRef} className="media-wrap" id="map-media-wrap">
          <div ref={fitBoxRef} className="fit-box" id="map-fit-box">
            <img ref={imgRef} id="map-img" className="media-img" draggable={false} alt="" hidden />
            <video
              ref={videoRef}
              id="map-video"
              className="media-img"
              muted
              loop
              playsInline
              disablePictureInPicture
              hidden
            />
            <div ref={placeholderRef} className="map-placeholder" id="map-placeholder" hidden />
            <canvas id="map-shader-canvas" className="shader-layer" />
            <FogOverlays />
            <svg ref={gridSvgRef} id="map-grid-svg" className="grid-layer" viewBox="0 0 100 100" preserveAspectRatio="none" />
            <canvas id="map-aoe-shader-canvas" className="shader-layer aoe-shader-layer" />
            <AoeOverlays />
            <canvas id="map-ping-canvas" className="ping-layer" />
          </div>
        </div>
      </div>
      <ViewportRect />
      <CompassMarker />
    </div>
  );
}
