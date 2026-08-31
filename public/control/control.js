const socket = io();
let state = null;
let fogOpacity = 0.45;
let currentImageRect = null;

const locationSelect = document.getElementById('location-select');
const mapPreview = document.getElementById('map-preview');
const mapMediaWrap = document.getElementById('map-media-wrap');
const mapFitBox = document.getElementById('map-fit-box');
const mapImg = document.getElementById('map-img');
const mapVideo = document.getElementById('map-video');
let activeMapEl = mapImg;
const mapPlaceholder = document.getElementById('map-placeholder');
const mapFogLayer = document.getElementById('map-fog-layer');
const fogOpacityInput = document.getElementById('fog-opacity');
const fowList = document.getElementById('fow-list');
const imagesList = document.getElementById('images-list');
const backToMapBtn = document.getElementById('back-to-map');
const panZoomSection = document.getElementById('pan-zoom-section');
const zoomRange = document.getElementById('zoom-range');
const fowHideAllBtn = document.getElementById('fow-hide-all');
const fowRevealAllBtn = document.getElementById('fow-reveal-all');
const viewportRect = document.getElementById('viewport-rect');
const panModeToggle = document.getElementById('pan-mode-toggle');

socket.on('connect', () => socket.emit('hello', { role: 'control' }));
socket.on('state:update', (s) => {
  state = s;
  render();
});

window.addEventListener('resize', () => {
  if (state) renderMapPreview(getActiveLocation());
});

function getActiveLocation() {
  return state.locations.find((l) => l.id === state.activeLocationId);
}

function render() {
  const location = getActiveLocation();
  const showingImage = Boolean(state.activeImageId);

  locationSelect.innerHTML =
    (state.activeLocationId ? '' : '<option value="" selected disabled hidden>— nessuna location —</option>') +
    state.locations
      .filter((l) => !l.archived)
      .map((l) => `<option value="${l.id}" ${l.id === state.activeLocationId ? 'selected' : ''}>${escapeHtml(l.name)}</option>`)
      .join('');

  renderMapPreview(location);

  fowList.innerHTML = ((location && location.map.polygons) || [])
    .map(
      (poly) => `
        <button class="fow-row ${poly.revealed ? 'revealed' : ''}" data-id="${poly.id}">
          <span>${escapeHtml(poly.name)}</span>
          <span class="fow-state">${poly.revealed ? 'rivelata' : 'nascosta'}</span>
        </button>
      `
    )
    .join('');

  imagesList.innerHTML =
    ((location && location.images) || [])
      .map(
        (img) => `
          <button class="image-thumb ${state.activeImageId === img.id ? 'active' : ''}" data-id="${img.id}">
            <img src="/storage/images/${img.file}" alt="${escapeHtml(img.name)}">
          </button>
        `
      )
      .join('') || '<p class="hint">nessuna immagine per questa location</p>';

  zoomRange.value = String(Math.round((state.liveView.scale || 1) * 5));
  panZoomSection.style.display = showingImage ? 'none' : 'block';
  updateViewportRect(location);
}

// The wrap element's CSS rotate() transform already turns this locally-flat
// (unrotated) rendering into the correct on-screen appearance — polygon points
// are used as-is, in their stored base space, never pre-rotated here.
function renderFogOverlays(polygons) {
  mapFogLayer.innerHTML = '';
  polygons.forEach((polygon) => {
    const overlay = document.createElement('button');
    overlay.className = `fog-overlay ${polygon.revealed ? 'revealed' : ''}`;
    overlay.style.clipPath = polygonClipPath(polygon.points);
    overlay.style.opacity = polygon.revealed ? '1' : String(fogOpacity);
    overlay.dataset.id = polygon.id;
    overlay.title = polygon.name;
    mapFogLayer.appendChild(overlay);
  });
}

function renderMapPreview(location) {
  const polygons = (location && location.map.polygons) || [];

  if (location && location.map.file) {
    mapPlaceholder.hidden = true;
    activeMapEl = loadMapMedia(mapImg, mapVideo, location.map.file, `/storage/maps/${location.map.file}`, () => {
      const nw = mediaW(activeMapEl);
      const nh = mediaH(activeMapEl);
      if (nw && nh) mapPreview.style.setProperty('--map-aspect', `${nw} / ${nh}`);
      const rotation = computeTotalRotation(nw, nh, location.map.flip180);
      const effective = layoutMapWrap(mapPreview, mapMediaWrap, rotation);
      const rect = fitRect(effective.width, effective.height, nw, nh);
      positionFitBox(mapFitBox, rect);
      currentImageRect = rect;
      renderFogOverlays(polygons);
    });
  } else {
    mapImg.hidden = true;
    mapVideo.hidden = true;
    mapPlaceholder.hidden = false;
    mapPreview.style.removeProperty('--map-aspect');
    const effective = layoutMapWrap(mapPreview, mapMediaWrap, 0);
    const rect = { left: 0, top: 0, width: effective.width, height: effective.height };
    positionFitBox(mapFitBox, rect);
    currentImageRect = rect;
    renderFogOverlays(polygons);
  }
}

locationSelect.addEventListener('change', () => {
  socket.emit('location:set', { locationId: locationSelect.value });
});

mapFogLayer.addEventListener('click', (e) => {
  if (panModeActive) return;
  const overlay = e.target.closest('.fog-overlay');
  if (overlay) socket.emit('fow:toggle', { polygonId: overlay.dataset.id });
});

fogOpacityInput.addEventListener('input', () => {
  fogOpacity = Number(fogOpacityInput.value) / 100;
  if (state) renderMapPreview(getActiveLocation());
});

fowList.addEventListener('click', (e) => {
  const btn = e.target.closest('.fow-row');
  if (btn) socket.emit('fow:toggle', { polygonId: btn.dataset.id });
});

imagesList.addEventListener('click', (e) => {
  const btn = e.target.closest('.image-thumb');
  if (btn) socket.emit('image:show', { imageId: btn.dataset.id });
});

backToMapBtn.addEventListener('click', () => socket.emit('image:hide'));

document.querySelectorAll('[data-pan]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const [dx, dy] = btn.dataset.pan.split(',').map(Number);
    socket.emit('view:pan', { dx: dx * 20, dy: dy * 20 });
  });
});

zoomRange.addEventListener('input', () => {
  socket.emit('view:zoom', { scale: Number(zoomRange.value) / 5 });
});

document.getElementById('view-reset').addEventListener('click', () => socket.emit('view:reset'));

fowHideAllBtn.addEventListener('click', () => {
  if (!state.activeLocationId) return;
  socket.emit('fow:setAll', { locationId: state.activeLocationId, revealed: false });
});

// Arma-poi-conferma, stesso pattern già in uso nel resto dell'app: primo
// click arma per 2.5s, secondo click entro la finestra conferma.
let revealAllArmed = false;
let revealAllArmTimeout = null;

function resetRevealAllArm() {
  revealAllArmed = false;
  clearTimeout(revealAllArmTimeout);
  fowRevealAllBtn.classList.remove('confirm');
  fowRevealAllBtn.textContent = 'Rivela tutto';
}

fowRevealAllBtn.addEventListener('click', () => {
  if (!state.activeLocationId) return;
  if (!revealAllArmed) {
    revealAllArmed = true;
    fowRevealAllBtn.classList.add('confirm');
    fowRevealAllBtn.textContent = 'Click di nuovo per confermare';
    clearTimeout(revealAllArmTimeout);
    revealAllArmTimeout = setTimeout(resetRevealAllArm, 2500);
    return;
  }
  resetRevealAllArm();
  socket.emit('fow:setAll', { locationId: state.activeLocationId, revealed: true });
});

// Il rettangolo mostra quale porzione della mappa la TV sta effettivamente
// inquadrando in questo momento. Si ricalcola, per le dimensioni del
// viewport della TV, lo stesso posizionamento che display.js applica alla
// mappa — poi si inverte la trasformazione pan/zoom per trovare quale
// rettangolo del map-layer riempie lo schermo della TV, e lo si riesprime
// come frazione del riquadro mappa mostrato qui in locale (currentImageRect).
function updateViewportRect(location) {
  if (!location || !state.displayViewport || !mediaW(activeMapEl) || !currentImageRect) {
    viewportRect.hidden = true;
    panModeToggle.disabled = true;
    return;
  }

  const { width: vw, height: vh } = state.displayViewport;
  const nw = mediaW(activeMapEl);
  const nh = mediaH(activeMapEl);
  const rotation = computeTotalRotation(nw, nh, location.map.flip180);
  const swapped = rotation === 90 || rotation === 270;
  const tvEffectiveW = swapped ? vh : vw;
  const tvEffectiveH = swapped ? vw : vh;
  const tvFit = fitRect(tvEffectiveW, tvEffectiveH, nw, nh);

  const mapScale = location.map.scale || 1;
  const live = state.liveView || { scale: 1, offsetX: 0, offsetY: 0 };
  const S = mapScale * (live.scale || 1);

  const viewLeft = -(live.offsetX || 0) / S;
  const viewTop = -(live.offsetY || 0) / S;
  const viewW = tvEffectiveW / S;
  const viewH = tvEffectiveH / S;

  const fracLeft = (viewLeft - tvFit.left) / tvFit.width;
  const fracTop = (viewTop - tvFit.top) / tvFit.height;
  const fracW = viewW / tvFit.width;
  const fracH = viewH / tvFit.height;

  viewportRect.hidden = false;
  viewportRect.style.left = `${currentImageRect.left + fracLeft * currentImageRect.width}px`;
  viewportRect.style.top = `${currentImageRect.top + fracTop * currentImageRect.height}px`;
  viewportRect.style.width = `${fracW * currentImageRect.width}px`;
  viewportRect.style.height = `${fracH * currentImageRect.height}px`;

  panModeToggle.disabled = false;
}

let panModeActive = false;
let panDrag = null;

panModeToggle.addEventListener('click', () => {
  panModeActive = !panModeActive;
  panModeToggle.classList.toggle('active', panModeActive);
  mapPreview.classList.toggle('pan-mode-active', panModeActive);
});

// In modalità sposta, il tocco sul fog viene sospeso del tutto: nessuna
// ambiguità tap-vs-trascinamento da risolvere, ogni gesto sull'anteprima è
// per forza un trascinamento.
mapPreview.addEventListener('pointerdown', (e) => {
  if (!panModeActive) return;
  panDrag = { lastX: e.clientX, lastY: e.clientY };
  mapPreview.setPointerCapture(e.pointerId);
});

mapPreview.addEventListener('pointermove', (e) => {
  if (!panDrag) return;
  const dxLocal = e.clientX - panDrag.lastX;
  const dyLocal = e.clientY - panDrag.lastY;
  panDrag.lastX = e.clientX;
  panDrag.lastY = e.clientY;

  const location = getActiveLocation();
  if (!location || !state.displayViewport || !currentImageRect) return;

  const nw = mediaW(activeMapEl);
  const nh = mediaH(activeMapEl);
  const rotation = computeTotalRotation(nw, nh, location.map.flip180);
  const swapped = rotation === 90 || rotation === 270;
  const tvEffectiveW = swapped ? state.displayViewport.height : state.displayViewport.width;
  const tvEffectiveH = swapped ? state.displayViewport.width : state.displayViewport.height;
  const tvFit = fitRect(tvEffectiveW, tvEffectiveH, nw, nh);

  const mapScale = location.map.scale || 1;
  const S = mapScale * ((state.liveView && state.liveView.scale) || 1);

  // Stessa conversione usata per disegnare il rettangolo, invertita: da
  // pixel dell'anteprima locale a pixel del viewport della TV.
  const dxTv = (dxLocal / currentImageRect.width) * tvFit.width * S;
  const dyTv = (dyLocal / currentImageRect.height) * tvFit.height * S;

  socket.emit('view:pan', { dx: -dxTv, dy: -dyTv });
});

mapPreview.addEventListener('pointerup', () => { panDrag = null; });
mapPreview.addEventListener('pointercancel', () => { panDrag = null; });
