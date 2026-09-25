function polygonClipPath(points) {
  return `polygon(${points.map(([x, y]) => `${x}% ${y}%`).join(', ')})`;
}

// User-provided names (polygons, locations, images) get interpolated into
// innerHTML templates — a name containing `"` or `<` would break the markup.
function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function fitRect(containerW, containerH, naturalW, naturalH) {
  if (!naturalW || !naturalH || !containerW || !containerH) {
    return { left: 0, top: 0, width: containerW, height: containerH };
  }
  const containerRatio = containerW / containerH;
  const imageRatio = naturalW / naturalH;
  let width, height;
  if (imageRatio > containerRatio) {
    width = containerW;
    height = containerW / imageRatio;
  } else {
    height = containerH;
    width = containerH * imageRatio;
  }
  return { left: (containerW - width) / 2, top: (containerH - height) / 2, width, height };
}

function positionFitBox(fitBoxEl, rect) {
  fitBoxEl.style.position = 'absolute';
  fitBoxEl.style.left = `${rect.left}px`;
  fitBoxEl.style.top = `${rect.top}px`;
  fitBoxEl.style.width = `${rect.width}px`;
  fitBoxEl.style.height = `${rect.height}px`;
}

/**
 * Loads `src` into `imgEl` and calls `onReady` once natural dimensions are available,
 * handling both the fresh-load and already-cached/complete cases.
 */
function loadImageThen(imgEl, src, onReady) {
  imgEl.onload = onReady;
  imgEl.src = src;
  if (imgEl.complete && imgEl.naturalWidth) {
    onReady();
  }
}

const VIDEO_EXTENSIONS = ['mp4', 'webm', 'ogv', 'ogg', 'mov', 'm4v', 'mkv', 'avi', 'wmv', 'flv'];

function isVideoFile(filename) {
  if (!filename) return false;
  const ext = filename.split('.').pop().toLowerCase();
  return VIDEO_EXTENSIONS.includes(ext);
}

// Works on whichever kind of element is actually active — an <img> has no
// videoWidth, a <video> has no naturalWidth, so exactly one side is ever set.
function mediaW(el) {
  return el.videoWidth || el.naturalWidth || 0;
}
function mediaH(el) {
  return el.videoHeight || el.naturalHeight || 0;
}

/**
 * Shows whichever of `imgEl`/`videoEl` matches `filename`'s type and hides the
 * other, loading `src` into it and calling `onReady` once its dimensions are
 * known (both for a fresh load and for an already-loaded/unchanged source).
 * A map video is a silent looping backdrop, never a piece of media with its
 * own transport: muted/loop/playsInline are (re)asserted on every call so
 * that autoplay is never blocked by the browser and audio never plays.
 * Returns the element that is now active — callers must read its size via
 * mediaW/mediaH instead of assuming it's always the <img>.
 */
function loadMapMedia(imgEl, videoEl, filename, src, onReady) {
  const wantVideo = isVideoFile(filename);
  const el = wantVideo ? videoEl : imgEl;
  const other = wantVideo ? imgEl : videoEl;

  other.hidden = true;
  if (other.dataset.mapSrc) {
    other.removeAttribute('src');
    delete other.dataset.mapSrc;
  }

  el.hidden = false;

  if (wantVideo) {
    el.muted = true;
    el.defaultMuted = true;
    el.loop = true;
    el.playsInline = true;
  }

  const alreadyLoaded = el.dataset.mapSrc === src;
  if (!alreadyLoaded) {
    el.dataset.mapSrc = src;
    if (wantVideo) {
      el.onloadeddata = onReady;
    } else {
      el.onload = onReady;
    }
    el.src = src;
  }

  const ready = wantVideo ? el.readyState >= 1 && el.videoWidth : el.complete && el.naturalWidth;
  if (alreadyLoaded && ready) onReady();
  if (wantVideo) el.play().catch(() => {});

  return el;
}

/**
 * A map taller than it is wide leaves large empty bars on a landscape TV; rotating
 * it 90° lets it fill far more of the screen. Computed live from the image's own
 * pixel dimensions — never stored, never user-controlled, applied consistently
 * across display/control/editor so what you edit matches what's shown. Two
 * independent user-controlled flags compose on top of this: a 180° flip
 * (location.map.flip180) for maps where the automatic 90° choice ends up upside
 * down, and a 90° rotation (location.map.rotate90) for maps that need an
 * orientation the auto-detection alone can't reach. Together the two flags cover
 * all 4 orientations from either auto-detected starting point.
 */
function computeAutoRotation(naturalW, naturalH) {
  return naturalH > naturalW ? 90 : 0;
}

function computeTotalRotation(naturalW, naturalH, flip180, rotate90) {
  return (computeAutoRotation(naturalW, naturalH) + (flip180 ? 180 : 0) + (rotate90 ? 90 : 0)) % 360;
}

// Polygon/grid points are always stored relative to the map image's own
// (unrotated) pixel space — this IS the local coordinate frame that content is
// rendered in; the CSS `rotate()` transform on the ancestor wrap element handles
// turning that local rendering into the correct on-screen appearance by itself,
// so rendering code should use stored points directly and never call
// rotatePointFromBase. The only place a transform is actually needed is the
// reverse direction: converting a click's screen-relative position (which
// getBoundingClientRect reports in on-screen/rotated space) back into the local
// base space the data is stored in.
function rotatePointToBase([rx, ry], rotation) {
  const ru = rx / 100;
  const rv = ry / 100;
  let u, v;
  switch (rotation) {
    case 90: u = rv; v = 1 - ru; break;
    case 180: u = 1 - ru; v = 1 - rv; break;
    case 270: u = 1 - rv; v = ru; break;
    default: u = ru; v = rv;
  }
  return [u * 100, v * 100];
}

/**
 * Sizes/rotates `wrapEl` to fill `container`, accounting for a 90°/270° rotation
 * swapping the effective width/height. Returns the effective (pre-rotation) box
 * size, to be used as the containerW/H for a subsequent fitRect() call.
 */
function layoutMapWrap(container, wrapEl, rotation) {
  const containerW = container.clientWidth;
  const containerH = container.clientHeight;
  const swapped = rotation === 90 || rotation === 270;
  const effectiveW = swapped ? containerH : containerW;
  const effectiveH = swapped ? containerW : containerH;

  wrapEl.style.position = 'absolute';
  wrapEl.style.top = '50%';
  wrapEl.style.left = '50%';
  wrapEl.style.width = `${effectiveW}px`;
  wrapEl.style.height = `${effectiveH}px`;
  wrapEl.style.transform = `translate(-50%, -50%) rotate(${rotation}deg)`;

  return { width: effectiveW, height: effectiveH };
}

/**
 * Draws the grid overlay into `svgEl` (a 0-100 viewBox SVG) from `grid`
 * ({enabled, cellSize, offsetX, offsetY, color, lineWidth, opacity} —
 * cellSize/offsetX/Y are in the map image's own natural pixel units). Shared
 * by editor and display
 * so the two always render identically. Points are in base (unrotated) space —
 * same rule as polygons — the ancestor's CSS rotation handles the rest.
 */
function renderGridSvg(svgEl, grid, naturalW, naturalH) {
  svgEl.innerHTML = '';
  if (!grid || !grid.enabled || !naturalW || !naturalH) return;

  svgEl.style.opacity = grid.opacity === undefined ? 1 : grid.opacity;

  const cellSize = Math.max(4, grid.cellSize || 100);
  const stepXPct = (cellSize / naturalW) * 100;
  const stepYPct = (cellSize / naturalH) * 100;
  const offXPct = (((grid.offsetX || 0) % cellSize + cellSize) % cellSize / naturalW) * 100;
  const offYPct = (((grid.offsetY || 0) % cellSize + cellSize) % cellSize / naturalH) * 100;
  const color = grid.color || '#ffffff';
  const lineWidth = grid.lineWidth || 0.3;

  const addLine = (x1, y1, x2, y2) => {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    line.setAttribute('stroke', color);
    line.setAttribute('stroke-width', lineWidth);
    line.setAttribute('vector-effect', 'non-scaling-stroke');
    svgEl.appendChild(line);
  };

  for (let x = offXPct; x <= 100; x += stepXPct) {
    addLine(x, 0, x, 100);
  }
  for (let y = offYPct; y <= 100; y += stepYPct) {
    addLine(0, y, 100, y);
  }
}

const AOE_METERS_PER_CELL = 1.5;

// Ruota il vettore (x,y) di angleDeg, con la stessa convenzione di segno
// della funzione CSS rotate() (verificato empiricamente: rotate(90deg) porta
// (1,0) a (0,1), cioè orario in un sistema con Y verso il basso — lo stesso
// usato da display.css). Usare DOMMatrix invece di una matrice scritta a
// mano elimina il rischio di sbagliare il segno per le rotazioni 90/270.
function rotateVector(x, y, angleDeg) {
  // In browser: use DOMMatrix. In Node.js: use math.
  if (typeof DOMMatrix !== 'undefined' && typeof DOMPoint !== 'undefined') {
    const p = new DOMMatrix().rotate(angleDeg).transformPoint(new DOMPoint(x, y));
    return [p.x, p.y];
  } else {
    // Fallback math implementation for Node.js: rotation matrix
    const rad = (angleDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return [x * cos - y * sin, x * sin + y * cos];
  }
}

function aoePixelsPerMeter(grid) {
  const cellSize = (grid && grid.cellSize) || 100;
  return cellSize / AOE_METERS_PER_CELL;
}

// Punti della forma in pixel reali della mappa, centrati sull'origine locale
// (0,0), PRIMA di ogni rotazione -- il chiamante ruota e trasla. Il cono ha
// il vertice in (0,0) e si apre verso -Y (largo quanto la distanza
// dall'origine, regola ufficiale D&D); la linea parte da (0,0) verso -Y; il
// cubo è centrato sull'origine (mai ruotato: resta allineato agli assi); la
// sfera è approssimata con un poligono a 32 lati (necessario per un contorno
// disegnabile con clip-path/SVG, non distorce percettibilmente un cerchio).
function aoeShapePointsPx(shape, sizeM, widthM, grid) {
  const ppm = aoePixelsPerMeter(grid);
  const size = sizeM * ppm;
  switch (shape) {
    case 'cone':
      return [[0, 0], [-size / 2, -size], [size / 2, -size]];
    case 'cube': {
      const h = size / 2;
      return [[-h, -h], [h, -h], [h, h], [-h, h]];
    }
    case 'line': {
      const width = (widthM || AOE_METERS_PER_CELL) * ppm;
      const w = width / 2;
      return [[-w, 0], [w, 0], [w, -size], [-w, -size]];
    }
    case 'sphere': {
      const r = size;
      const SIDES = 32;
      const points = [];
      for (let i = 0; i < SIDES; i++) {
        const a = (i / SIDES) * Math.PI * 2;
        points.push([r * Math.sin(a), -r * Math.cos(a)]);
      }
      return points;
    }
    default:
      return [];
  }
}

// Punti del contorno in percentuale, spazio locale (pre-rotazione mappa) --
// stesso sistema dei punti dei poligoni fog. La conversione pixel->percento
// è fatta separatamente per asse X e Y (mai un unico fattore): un'immagine
// non quadrata deformerebbe la forma se si usasse un solo rapporto.
function aoeOutlinePoints(aoe, grid, naturalW, naturalH) {
  const localPx = aoeShapePointsPx(aoe.shape, aoe.sizeM, aoe.widthM, grid);
  return localPx.map(([lx, ly]) => {
    const [rx, ry] = rotateVector(lx, ly, aoe.rotation || 0);
    return [aoe.x + (rx / naturalW) * 100, aoe.y + (ry / naturalH) * 100];
  });
}

// Test punto-in-poligono per ray casting (pari/dispari). `point` e `polygon`
// devono essere nello stesso spazio a scala uniforme (pixel reali, mai
// percentuale grezza su un'immagine non quadrata).
function pointInPolygon([px, py], polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersects = (yi > py) !== (yj > py) &&
      px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

// Celle della griglia il cui CENTRO ricade dentro la forma -- regola
// ufficiale D&D per il gioco su griglia. Tutta la matematica lavora in
// pixel reali della mappa (isotropi), mai in percentuale, per evitare la
// stessa distorsione descritta sopra per aoeOutlinePoints.
function aoeAffectedCells(aoe, grid, naturalW, naturalH) {
  const cellSize = Math.max(4, (grid && grid.cellSize) || 100);
  const offsetX = (grid && grid.offsetX) || 0;
  const offsetY = (grid && grid.offsetY) || 0;

  const originPxX = (aoe.x / 100) * naturalW;
  const originPxY = (aoe.y / 100) * naturalH;

  const localPolygon = aoeShapePointsPx(aoe.shape, aoe.sizeM, aoe.widthM, grid)
    .map(([lx, ly]) => rotateVector(lx, ly, aoe.rotation || 0));

  const xs = localPolygon.map(([x]) => x);
  const ys = localPolygon.map(([, y]) => y);
  const minX = originPxX + Math.min(...xs);
  const maxX = originPxX + Math.max(...xs);
  const minY = originPxY + Math.min(...ys);
  const maxY = originPxY + Math.max(...ys);

  const firstCol = Math.floor((minX - offsetX) / cellSize) - 1;
  const lastCol = Math.ceil((maxX - offsetX) / cellSize) + 1;
  const firstRow = Math.floor((minY - offsetY) / cellSize) - 1;
  const lastRow = Math.ceil((maxY - offsetY) / cellSize) + 1;

  const worldPolygon = localPolygon.map(([lx, ly]) => [originPxX + lx, originPxY + ly]);

  const cells = [];
  for (let col = firstCol; col <= lastCol; col++) {
    for (let row = firstRow; row <= lastRow; row++) {
      const centerX = offsetX + (col + 0.5) * cellSize;
      const centerY = offsetY + (row + 0.5) * cellSize;
      if (pointInPolygon([centerX, centerY], worldPolygon)) {
        cells.push({ col, row });
      }
    }
  }
  return cells;
}

// Rettangolo (in percentuale) di una singola cella della griglia -- stessa
// conversione per-asse di aoeOutlinePoints, adatta a un <rect> SVG o a un
// div posizionato in percentuale.
function cellRectPercent(col, row, grid, naturalW, naturalH) {
  const cellSize = Math.max(4, (grid && grid.cellSize) || 100);
  const offsetX = (grid && grid.offsetX) || 0;
  const offsetY = (grid && grid.offsetY) || 0;
  const leftPx = offsetX + col * cellSize;
  const topPx = offsetY + row * cellSize;
  return {
    leftPct: (leftPx / naturalW) * 100,
    topPct: (topPx / naturalH) * 100,
    widthPct: (cellSize / naturalW) * 100,
    heightPct: (cellSize / naturalH) * 100
  };
}

// Esporta per i test (`node --test`); non ha alcun effetto nel browser,
// dove `module` non è definito e questo blocco non viene mai eseguito.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    AOE_METERS_PER_CELL,
    rotateVector,
    aoePixelsPerMeter,
    aoeShapePointsPx,
    aoeOutlinePoints,
    pointInPolygon,
    aoeAffectedCells,
    cellRectPercent
  };
}
