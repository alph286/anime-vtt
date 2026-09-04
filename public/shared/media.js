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
 * ({enabled, cellSize, offsetX, offsetY, color, lineWidth} — cellSize/offsetX/Y
 * are in the map image's own natural pixel units). Shared by editor and display
 * so the two always render identically. Points are in base (unrotated) space —
 * same rule as polygons — the ancestor's CSS rotation handles the rest.
 */
function renderGridSvg(svgEl, grid, naturalW, naturalH) {
  svgEl.innerHTML = '';
  if (!grid || !grid.enabled || !naturalW || !naturalH) return;

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
