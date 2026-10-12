import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { Geometry } from '../store/control-store';
import { selectPreviewLocation, useControlStore } from '../store/control-store';
import type { MapMedia } from '../map/map-refs';

export interface MapGeometryRefs {
  preview: React.RefObject<HTMLDivElement | null>;
  mediaWrap: React.RefObject<HTMLDivElement | null>;
  fitBox: React.RefObject<HTMLDivElement | null>;
  media: React.RefObject<MapMedia | null>;
}

function sameGeometry(a: Geometry, b: Geometry): boolean {
  const ra = a.imageRect, rb = b.imageRect;
  const sameRect = ra === rb || (!!ra && !!rb && ra.left === rb.left && ra.top === rb.top && ra.width === rb.width && ra.height === rb.height);
  return sameRect && a.rotation === b.rotation && a.naturalW === b.naturalW && a.naturalH === b.naturalH
    && a.previewW === b.previewW && a.previewH === b.previewH;
}

// Porta la parte "geometrica" di renderMapPreview (control.js): forma del
// riquadro, layout del wrap ruotato, fit-box della mappa. Scrive il
// risultato in `geometry` nello store, da cui leggono griglia, riquadro
// giallo, zoom locale e (nei task successivi) gesti e shader.
// Restituisce `recompute` (sincrono) e `schedule` (raggruppato in un
// requestAnimationFrame, per resize/ResizeObserver: evita di leggere e
// scrivere il layout piu volte nello stesso frame).
export function useMapGeometry(refs: MapGeometryRefs, opts: { aspect?: string | null } = {}) {
  // Aspect imposta dall'esterno (es. /party replica lo schermo del display):
  // se presente vince su quella derivata dal media.
  const aspectRef = useRef(opts.aspect ?? null);
  aspectRef.current = opts.aspect ?? null;
  const recompute = useCallback(() => {
    const preview = refs.preview.current;
    const wrap = refs.mediaWrap.current;
    const fit = refs.fitBox.current;
    if (!preview || !wrap || !fit) return;
    const s = useControlStore.getState();
    const location = selectPreviewLocation(s);
    const media = refs.media.current;
    const hasFile = Boolean(location?.map.file);
    // Media non ancora caricato (o assente): dimensioni 0, si ripiega sul
    // riquadro pieno come nel ramo "senza file" dell'originale.
    const nw = hasFile && media ? mediaW(media) : 0;
    const nh = hasFile && media ? mediaH(media) : 0;

    let rotation = 0;
    if (location && hasFile && nw && nh) {
      rotation = computeTotalRotation(nw, nh, location.map.flip180, location.map.rotate90);
      // Il contenitore deve avere la forma del contenuto DOPO la rotazione,
      // non quella grezza dell'immagine: altrimenti una mappa verticale
      // auto-ruotata di 90° lascerebbe due bande vuote ai lati del fit.
      const swapped = rotation === 90 || rotation === 270;
      preview.style.setProperty('--map-aspect', swapped ? `${nh} / ${nw}` : `${nw} / ${nh}`);
    } else {
      preview.style.removeProperty('--map-aspect');
    }
    if (aspectRef.current) preview.style.setProperty('--map-aspect', aspectRef.current);

    const effective = layoutMapWrap(preview, wrap, rotation);
    const imageRect = nw && nh
      ? fitRect(effective.width, effective.height, nw, nh)
      : { left: 0, top: 0, width: effective.width, height: effective.height };
    positionFitBox(fit, imageRect);

    const next: Geometry = {
      imageRect, rotation, naturalW: nw, naturalH: nh,
      previewW: preview.clientWidth, previewH: preview.clientHeight,
    };
    if (!sameGeometry(s.geometry, next)) s.setGeometry(next);
  }, [refs]);

  const rafRef = useRef(0);
  const schedule = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      recompute();
    });
  }, [recompute]);
  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
  }, []);

  const location = useControlStore(selectPreviewLocation);
  const tab = useControlStore((s) => s.tab);

  // Cambiano scala/rotazioni: ricalcolo immediato (prima del paint).
  useLayoutEffect(() => {
    recompute();
  }, [recompute, location?.map.scale, location?.map.flip180, location?.map.rotate90, opts.aspect]);

  // Resize della finestra e del riquadro stesso (es. cambio aspect-ratio,
  // pannello che passa da display:none a visibile).
  useEffect(() => {
    window.addEventListener('resize', schedule);
    const preview = refs.preview.current;
    const ro = typeof ResizeObserver !== 'undefined' && preview ? new ResizeObserver(() => schedule()) : null;
    if (ro && preview) ro.observe(preview);
    return () => {
      window.removeEventListener('resize', schedule);
      ro?.disconnect();
    };
  }, [refs, schedule]);

  // Cambio scheda: su mobile il pannello Mappa torna visibile solo ora.
  useEffect(() => {
    schedule();
  }, [tab, schedule]);

  return { recompute, schedule };
}
