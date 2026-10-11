import { useLayoutEffect, useRef } from 'react';
import { AOE_CELL_FILL_OPACITY } from '../aoe/constants';
import { selectPreviewLocation, useControlStore } from '../store/control-store';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Svg delle aree d'effetto (#map-aoe-svg). Scelta: React possiede SOLO
// l'elemento <svg>, mai i suoi figli -- li ricostruisce da zero un layout
// effect con createElementNS, porting 1:1 di renderAoeOverlays in
// control.js. Cosi il marker d'origine resta quello imperativo condiviso
// (appendAoeOriginMarker in media.js, che appende all'svg) senza che React
// e codice imperativo si contendano gli stessi nodi.
//
// Per ogni area: prima le celle colpite (sotto) poi il contorno (sopra),
// altrimenti il contorno sparirebbe sotto il riempimento. Le celle restano
// SEMPRE visibili, anche ad area lanciata (aoe.cast): lo shader e il
// bagliore sopra, ma le celle vanno lette comunque con precisione. Il
// contorno invece sparisce (stroke "none") con shapeVisible:false o ad
// area lanciata -- il poligono resta nel DOM con la sua geometria, cosi
// l'area resta trascinabile (pointer-events:all in modalita aoe, vedi
// control.css).
export function AoeOverlays() {
  const location = useControlStore(selectPreviewLocation);
  const aoes = location?.map.aoes;
  const grid = location?.map.grid;
  const naturalW = useControlStore((s) => s.geometry.naturalW);
  const naturalH = useControlStore((s) => s.geometry.naturalH);
  const zoomScale = useControlStore((s) => s.localZoom.scale);
  const selectedAoeId = useControlStore((s) => s.selectedAoeId);
  const svgRef = useRef<SVGSVGElement>(null);

  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.replaceChildren();
    if (!naturalW || !naturalH || !aoes || !grid) return;
    // vector-effect non-scaling-stroke protegge il tratto solo dal viewBox,
    // non dal transform CSS dello zoom locale: senza questa divisione il
    // contorno (e il mirino "+") si ingrosserebbero zoomando.
    const zoomComp = Math.max(zoomScale, 0.01);
    for (const aoe of aoes) {
      const color = aoeColorHex(aoe.color);
      const darkColor = aoeColorDarkHex(aoe.color);
      for (const { col, row } of aoeAffectedCells(aoe, grid, naturalW, naturalH)) {
        const r = cellRectPercent(col, row, grid, naturalW, naturalH);
        const el = document.createElementNS(SVG_NS, 'rect');
        el.setAttribute('x', String(r.leftPct));
        el.setAttribute('y', String(r.topPct));
        el.setAttribute('width', String(r.widthPct));
        el.setAttribute('height', String(r.heightPct));
        el.setAttribute('class', 'aoe-cell-highlight');
        el.setAttribute('fill', color);
        el.setAttribute('fill-opacity', String(AOE_CELL_FILL_OPACITY));
        el.setAttribute('stroke', 'none');
        svg.appendChild(el);
      }

      const selected = aoe.id === selectedAoeId;
      const outlineVisible = aoe.shapeVisible !== false && !aoe.cast;
      const poly = document.createElementNS(SVG_NS, 'polygon');
      poly.setAttribute('points', aoeOutlinePoints(aoe, grid, naturalW, naturalH).map(([x, y]) => `${x},${y}`).join(' '));
      poly.setAttribute('class', selected ? 'aoe-shape-overlay selected' : 'aoe-shape-overlay');
      poly.setAttribute('fill', 'none');
      poly.setAttribute('stroke', outlineVisible ? darkColor : 'none');
      // Spessore inline (2, o 3 se selezionata) compensato per lo zoom:
      // un valore calcolato a runtime, non esprimibile in una regola CSS.
      poly.style.strokeWidth = String((selected ? 3 : 2) / zoomComp);
      poly.dataset.id = aoe.id;
      svg.appendChild(poly);

      // Marker "+" sull'origine (solo Sfera e Cubo, lo decide
      // appendAoeOriginMarker): stessa visibilita del contorno.
      appendAoeOriginMarker(svg, aoe, outlineVisible ? darkColor : 'none', 1.5 / zoomComp, naturalW, naturalH);
    }
  }, [aoes, grid, naturalW, naturalH, zoomScale, selectedAoeId]);

  return <svg ref={svgRef} id="map-aoe-svg" className="aoe-svg" viewBox="0 0 100 100" preserveAspectRatio="none" />;
}
