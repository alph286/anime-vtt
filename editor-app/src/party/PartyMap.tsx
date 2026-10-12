import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useMapGeometry } from '../control/hooks/use-map-geometry';
import { useShaderLoop } from '../control/hooks/use-shader-loop';
import { AoeOverlays } from '../control/map/AoeOverlays';
import { mapRefs, type MapMedia } from '../control/map/map-refs';
import { useAoeGesture } from '../control/map/use-aoe-gesture';
import {
  selectPreviewLocation, selectShowingImage, useControlStore, type ControlStore,
} from '../control/store/control-store';
import { followsDisplay, gridLineWidth, liveTransform, transformCss } from './follow-math';

// Con un'immagine mostrata dal DM la mappa non e quella che vedono i giocatori:
// niente piazzamento ne spostamento di aree dal box.
export const partyGestureActive = (s: ControlStore): boolean => !selectShowingImage(s);

// Mappa di /party: replica in scala di #viewport di /display. Il box assume la
// proporzione dello schermo del display (--map-aspect) e #map-layer riceve lo
// stesso pan/zoom live. Niente riquadro giallo, bussola, canvas ping ne zoom
// locale: l'unico gesto e quello delle aree AOE.
export default function PartyMap() {
  const location = useControlStore(selectPreviewLocation);
  const displayViewport = useControlStore((s) => s.server?.displayViewport ?? null);
  const naturalW = useControlStore((s) => s.geometry.naturalW);
  const naturalH = useControlStore((s) => s.geometry.naturalH);
  const previewW = useControlStore((s) => s.geometry.previewW);
  const grid = location?.map.grid;
  const polygons = location?.map.polygons;
  const file = location?.map.file ?? null;

  const previewRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
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
  const aspect = followsDisplay(displayViewport) ? `${displayViewport!.width} / ${displayViewport!.height}` : null;
  const { recompute } = useMapGeometry(refs, { aspect });

  useLayoutEffect(() => {
    mapRefs.preview = previewRef.current;
    mapRefs.fitBox = fitBoxRef.current;
    return () => {
      mapRefs.preview = null;
      mapRefs.fitBox = null;
      mapRefs.media = null;
    };
  }, []);

  // Dopo il layout effect sopra (scrive mapRefs.fitBox).
  useAoeGesture({ isActive: partyGestureActive });
  useShaderLoop();

  // Caricamento del media al cambio location/file (come MapPreview).
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

  const t = useMemo(
    () => liveTransform(location?.map, displayViewport, previewW),
    [location?.map, displayViewport, previewW],
  );
  useLayoutEffect(() => {
    if (layerRef.current) layerRef.current.style.transform = transformCss(t);
  }, [t]);

  // Griglia: opacita condivisa coi giocatori (grid.opacity), mai le preferenze
  // locali del DM (dmGridOpacity/dmGridVisible).
  const scale = t?.scale ?? 1;
  useEffect(() => {
    const svg = gridSvgRef.current;
    if (!svg) return;
    if (!grid) {
      svg.innerHTML = '';
      return;
    }
    renderGridSvg(svg, { ...grid, lineWidth: gridLineWidth(grid.lineWidth, scale) }, naturalW, naturalH);
  }, [grid, scale, naturalW, naturalH]);

  return (
    <div ref={previewRef} id="map-preview" className="map-preview">
      <div ref={layerRef} id="map-layer">
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
            <div className="fog-layer" id="map-fog-layer">
              {(polygons ?? []).filter((p) => !p.revealed).map((p) => (
                <div key={p.id} className="fog-overlay" style={{ clipPath: polygonClipPath(p.points) }} />
              ))}
            </div>
            <svg ref={gridSvgRef} id="map-grid-svg" className="grid-layer" viewBox="0 0 100 100" preserveAspectRatio="none" />
            <canvas id="map-aoe-shader-canvas" className="shader-layer aoe-shader-layer" />
            <AoeOverlays />
          </div>
        </div>
      </div>
    </div>
  );
}
