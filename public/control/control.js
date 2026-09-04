const socket = io();
let state = null;
let fogOpacity = 0.45;
let currentImageRect = null;
let socketConnected = false;
let displayConnected = false;

const locationSelect = document.getElementById('location-select');
const locationConfirmRow = document.getElementById('location-confirm-row');
const locationConfirmName = document.getElementById('location-confirm-name');
const locationConfirmYes = document.getElementById('location-confirm-yes');
const locationConfirmNo = document.getElementById('location-confirm-no');
let pendingLocationId = null;
let locationConfirmTimeout = null;
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
const gridOpacitySection = document.getElementById('grid-opacity-section');
const gridOpacityOutBtn = document.getElementById('grid-opacity-out');
const gridOpacityInBtn = document.getElementById('grid-opacity-in');
const gridOpacityLevel = document.getElementById('grid-opacity-level');
const GRID_OPACITY_STEP = 0.1;
const zoomOutBtn = document.getElementById('zoom-out');
const zoomInBtn = document.getElementById('zoom-in');
const zoomLevel = document.getElementById('zoom-level');
const ZOOM_MIN = 0.2;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.2;
const wifiDot = document.getElementById('wifi-dot');
const showingBanner = document.getElementById('showing-banner');
const showingBannerName = document.getElementById('showing-banner-name');
const fowHideAllBtn = document.getElementById('fow-hide-all');
const fowRevealAllBtn = document.getElementById('fow-reveal-all');
const viewportRect = document.getElementById('viewport-rect');
const panModeToggle = document.getElementById('pan-mode-toggle');

function updateWifi() {
  const ok = socketConnected && displayConnected;
  wifiDot.classList.toggle('ok', ok);
  wifiDot.classList.toggle('bad', !ok);
}

socket.on('connect', () => {
  socketConnected = true;
  socket.emit('hello', { role: 'control' });
  updateWifi();
});
socket.on('disconnect', () => {
  socketConnected = false;
  updateWifi();
});
socket.on('display:status', ({ connected }) => {
  displayConnected = connected;
  updateWifi();
});
socket.on('state:update', (s) => {
  state = s;
  render();
});

window.addEventListener('resize', () => {
  if (!state) return;
  const location = getActiveLocation();
  renderMapPreview(location);
  updateViewportRect(location);
});

function getActiveLocation() {
  return state.locations.find((l) => l.id === state.activeLocationId);
}

function render() {
  const location = getActiveLocation();
  const showingImage = Boolean(state.activeImageId);

  if (showingImage && location) {
    const shownImg = (location.images || []).find((i) => i.id === state.activeImageId);
    showingBanner.hidden = !shownImg;
    if (shownImg) showingBannerName.textContent = shownImg.name || '';
  } else {
    showingBanner.hidden = true;
  }

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
            <span class="image-thumb-label">${escapeHtml(img.name)}</span>
          </button>
        `
      )
      .join('') || '<p class="hint">nessuna immagine per questa location</p>';

  zoomLevel.textContent = `${Math.round((state.liveView.scale || 1) * 100)}%`;
  panZoomSection.style.display = showingImage ? 'none' : 'block';

  const gridEnabled = Boolean(location && location.map.grid && location.map.grid.enabled) && !showingImage;
  gridOpacitySection.style.display = gridEnabled ? 'block' : 'none';
  if (gridEnabled) {
    gridOpacityLevel.textContent = `${Math.round((location.map.grid.opacity === undefined ? 1 : location.map.grid.opacity) * 100)}%`;
  }
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
      const rotation = computeTotalRotation(nw, nh, location.map.flip180, location.map.rotate90);
      const effective = layoutMapWrap(mapPreview, mapMediaWrap, rotation);
      const rect = fitRect(effective.width, effective.height, nw, nh);
      positionFitBox(mapFitBox, rect);
      currentImageRect = rect;
      renderFogOverlays(polygons);
      updateViewportRect(location);
    });
  } else {
    mapImg.hidden = true;
    mapVideo.hidden = true;
    if (mapImg.dataset.mapSrc) {
      mapImg.removeAttribute('src');
      delete mapImg.dataset.mapSrc;
    }
    if (mapVideo.dataset.mapSrc) {
      mapVideo.removeAttribute('src');
      mapVideo.load();
      delete mapVideo.dataset.mapSrc;
    }
    mapPlaceholder.hidden = false;
    mapPreview.style.removeProperty('--map-aspect');
    const effective = layoutMapWrap(mapPreview, mapMediaWrap, 0);
    const rect = { left: 0, top: 0, width: effective.width, height: effective.height };
    positionFitBox(mapFitBox, rect);
    currentImageRect = rect;
    renderFogOverlays(polygons);
    updateViewportRect(location);
  }
}

function resetLocationConfirm() {
  pendingLocationId = null;
  clearTimeout(locationConfirmTimeout);
  locationConfirmRow.hidden = true;
  locationSelect.value = state.activeLocationId || '';
}

locationSelect.addEventListener('change', () => {
  const targetId = locationSelect.value;
  if (!targetId || targetId === state.activeLocationId) return;
  const target = state.locations.find((l) => l.id === targetId);
  locationSelect.value = state.activeLocationId || '';
  if (!target) return;
  pendingLocationId = targetId;
  locationConfirmName.textContent = target.name;
  locationConfirmRow.hidden = false;
  clearTimeout(locationConfirmTimeout);
  locationConfirmTimeout = setTimeout(resetLocationConfirm, 4000);
});

locationConfirmYes.addEventListener('click', () => {
  if (!pendingLocationId) return;
  socket.emit('location:set', { locationId: pendingLocationId });
  resetLocationConfirm();
});

locationConfirmNo.addEventListener('click', resetLocationConfirm);

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
    const scale = (state && state.liveView && state.liveView.scale) || 1;
    const step = 20 / Math.max(scale, 0.01);
    socket.emit('view:pan', { dx: dx * step, dy: dy * step });
  });
});

function stepZoom(delta) {
  const current = (state && state.liveView && state.liveView.scale) || 1;
  const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((current + delta) * 10) / 10));
  socket.emit('view:zoom', { scale: next });
}
zoomOutBtn.addEventListener('click', () => stepZoom(-ZOOM_STEP));
zoomInBtn.addEventListener('click', () => stepZoom(ZOOM_STEP));

function stepGridOpacity(delta) {
  const location = getActiveLocation();
  if (!location || !location.map.grid) return;
  const current = location.map.grid.opacity === undefined ? 1 : location.map.grid.opacity;
  const next = Math.min(1, Math.max(0, Math.round((current + delta) * 10) / 10));
  socket.emit('grid:update', { locationId: state.activeLocationId, opacity: next });
}
gridOpacityOutBtn.addEventListener('click', () => stepGridOpacity(-GRID_OPACITY_STEP));
gridOpacityInBtn.addEventListener('click', () => stepGridOpacity(GRID_OPACITY_STEP));

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

// Ruota il vettore (x,y) di angleDeg, con la stessa convenzione di segno
// della funzione CSS rotate() (verificato empiricamente: rotate(90deg) porta
// (1,0) a (0,1), cioè orario in un sistema con Y verso il basso — lo stesso
// usato da display.css). Usare DOMMatrix invece di una matrice scritta a
// mano elimina il rischio di sbagliare il segno per le rotazioni 90/270.
function rotateVector(x, y, angleDeg) {
  const p = new DOMMatrix().rotate(angleDeg).transformPoint(new DOMPoint(x, y));
  return [p.x, p.y];
}

// Dallo spazio locale (pre-rotazione) di un wrap di dimensioni effW×effH,
// centrato e ruotato di `rotation` gradi dentro un container contW×contH (poi
// eventualmente pannato/scalato di offX,offY/S — S=1,offX=0,offY=0 per la
// nostra anteprima locale, che non panna/zooma mai se stessa), allo spazio
// schermo del container. Stessa composizione di #map-layer/#map-media-wrap
// usata da display.js (validata empiricamente contro getBoundingClientRect).
function localToScreen(lx, ly, effW, effH, contW, contH, rotation, S, offX, offY) {
  const [rx, ry] = rotateVector(lx - effW / 2, ly - effH / 2, rotation);
  return [contW / 2 + S * rx + offX, contH / 2 + S * ry + offY];
}

// Inversa di localToScreen.
function screenToLocal(sx, sy, effW, effH, contW, contH, rotation, S, offX, offY) {
  const dx = (sx - offX - contW / 2) / S;
  const dy = (sy - offY - contH / 2) / S;
  const [rx, ry] = rotateVector(dx, dy, -rotation);
  return [effW / 2 + rx, effH / 2 + ry];
}

// Il rettangolo mostra quale porzione della mappa la TV sta effettivamente
// inquadrando in questo momento. Procede in tre passi:
// 1) dai quattro angoli dello schermo della TV si risale, con screenToLocal,
//    al rettangolo corrispondente nello spazio locale (pre-rotazione) del
//    wrap della TV — lo stesso spazio in cui vive tvFit — e lo si riesprime
//    come frazione di tvFit;
// 2) la stessa frazione si applica al riquadro mappa della NOSTRA anteprima
//    (currentImageRect, anch'esso pre-rotazione, calcolato da
//    renderMapPreview con la stessa `rotation`), ottenendo il rettangolo
//    nello spazio locale della nostra anteprima;
// 3) #viewport-rect non è dentro il wrap ruotato (è un fratello di
//    #map-media-wrap — deve restare cliccabile/staccato dal fog e dal suo
//    tap-handler), quindi va portato dallo spazio locale allo spazio
//    schermo della nostra anteprima con localToScreen (S=1, offset=0: la
//    nostra anteprima non è mai pannata/zoomata rispetto a se stessa).
function updateViewportRect(location) {
  if (!location || !state.displayViewport || !mediaW(activeMapEl) || !currentImageRect) {
    viewportRect.hidden = true;
    panModeToggle.disabled = true;
    if (panModeActive) setPanModeActive(false);
    return;
  }

  const { width: vw, height: vh } = state.displayViewport;
  const nw = mediaW(activeMapEl);
  const nh = mediaH(activeMapEl);
  const rotation = computeTotalRotation(nw, nh, location.map.flip180, location.map.rotate90);
  const swapped = rotation === 90 || rotation === 270;
  const tvEffectiveW = swapped ? vh : vw;
  const tvEffectiveH = swapped ? vw : vh;
  const tvFit = fitRect(tvEffectiveW, tvEffectiveH, nw, nh);

  const mapScale = location.map.scale || 1;
  const live = state.liveView || { scale: 1, offsetX: 0, offsetY: 0 };
  const S = mapScale * (live.scale || 1);
  const offsetX = live.offsetX || 0;
  const offsetY = live.offsetY || 0;

  // 1) Rotazioni di 0/90/180/270 mantengono il rettangolo dello schermo
  // allineato agli assi anche nello spazio locale: bastano i due angoli
  // opposti (0,0) e (vw,vh) per ricavarne min/max.
  const [x0, y0] = screenToLocal(0, 0, tvEffectiveW, tvEffectiveH, vw, vh, rotation, S, offsetX, offsetY);
  const [x1, y1] = screenToLocal(vw, vh, tvEffectiveW, tvEffectiveH, vw, vh, rotation, S, offsetX, offsetY);

  const viewLeft = Math.min(x0, x1);
  const viewTop = Math.min(y0, y1);
  const viewW = Math.abs(x1 - x0);
  const viewH = Math.abs(y1 - y0);

  const fracLeft = (viewLeft - tvFit.left) / tvFit.width;
  const fracTop = (viewTop - tvFit.top) / tvFit.height;
  const fracW = viewW / tvFit.width;
  const fracH = viewH / tvFit.height;

  // 2) Frazione applicata al riquadro locale della nostra anteprima.
  const localLeft = currentImageRect.left + fracLeft * currentImageRect.width;
  const localTop = currentImageRect.top + fracTop * currentImageRect.height;
  const localRight = localLeft + fracW * currentImageRect.width;
  const localBottom = localTop + fracH * currentImageRect.height;

  // 3) Dal locale allo schermo della nostra anteprima (S=1, offset=0).
  const contW = mapPreview.clientWidth, contH = mapPreview.clientHeight;
  const ctrlEffW = swapped ? contH : contW;
  const ctrlEffH = swapped ? contW : contH;
  const [sx0, sy0] = localToScreen(localLeft, localTop, ctrlEffW, ctrlEffH, contW, contH, rotation, 1, 0, 0);
  const [sx1, sy1] = localToScreen(localRight, localBottom, ctrlEffW, ctrlEffH, contW, contH, rotation, 1, 0, 0);

  viewportRect.hidden = false;
  viewportRect.style.left = `${Math.min(sx0, sx1)}px`;
  viewportRect.style.top = `${Math.min(sy0, sy1)}px`;
  viewportRect.style.width = `${Math.abs(sx1 - sx0)}px`;
  viewportRect.style.height = `${Math.abs(sy1 - sy0)}px`;

  panModeToggle.disabled = false;
}

let panModeActive = false;
let panDrag = null;

function setPanModeActive(active) {
  panModeActive = active;
  panModeToggle.classList.toggle('active', panModeActive);
  mapPreview.classList.toggle('pan-mode-active', panModeActive);
}

panModeToggle.addEventListener('click', () => {
  setPanModeActive(!panModeActive);
});

// In modalità sposta, il tocco sul fog viene sospeso del tutto: nessuna
// ambiguità tap-vs-trascinamento da risolvere, ogni gesto sull'anteprima è
// per forza un trascinamento.
mapPreview.addEventListener('pointerdown', (e) => {
  // Un tocco che parte dal pulsante stesso non deve mai innescare la
  // capture: altrimenti il click risultante verrebbe rediretto a
  // mapPreview invece che al pulsante, e spegnere la modalità con un tocco
  // reale diventerebbe impossibile (setPointerCapture ridirige il click).
  if (!panModeActive || e.target.closest('#pan-mode-toggle')) return;
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
  const rotation = computeTotalRotation(nw, nh, location.map.flip180, location.map.rotate90);
  const swapped = rotation === 90 || rotation === 270;
  const tvEffectiveW = swapped ? state.displayViewport.height : state.displayViewport.width;
  const tvEffectiveH = swapped ? state.displayViewport.width : state.displayViewport.height;
  const tvFit = fitRect(tvEffectiveW, tvEffectiveH, nw, nh);

  const mapScale = location.map.scale || 1;
  const S = mapScale * ((state.liveView && state.liveView.scale) || 1);

  // Stessa conversione usata per disegnare il rettangolo, invertita, in tre
  // passi speculari: il delta del mouse è nello spazio SCHERMO della nostra
  // anteprima (ruotata visivamente come la TV) — va prima riportato nello
  // spazio locale (pre-rotazione) ruotandolo di -rotation (S=1, l'anteprima
  // locale non panna/zooma se stessa); poi riscalato nello spazio locale di
  // tvFit; poi ruotato IN AVANTI (+rotation) verso lo spazio schermo di
  // map-layer sulla TV e moltiplicato per S — con segno invertito, perché
  // aumentare offsetX sposta il contenuto (non l'inquadratura) in quella
  // direzione.
  const [dLocalX, dLocalY] = rotateVector(dxLocal, dyLocal, -rotation);
  const dViewLeft = (dLocalX / currentImageRect.width) * tvFit.width;
  const dViewTop = (dLocalY / currentImageRect.height) * tvFit.height;
  const [rx, ry] = rotateVector(dViewLeft, dViewTop, rotation);

  socket.emit('view:pan', { dx: -S * rx, dy: -S * ry });
});

mapPreview.addEventListener('pointerup', () => { panDrag = null; });
mapPreview.addEventListener('pointercancel', () => { panDrag = null; });
