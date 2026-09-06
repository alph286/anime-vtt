const socket = io();
let state = null;
let fogOpacity = 0.45;
let currentImageRect = null;
let socketConnected = false;
let displayConnected = false;

const locationSelect = document.getElementById('location-select');
const previewBanner = document.getElementById('preview-banner');
const previewBannerName = document.getElementById('preview-banner-name');
const previewSendBtn = document.getElementById('preview-send');
const previewCancelBtn = document.getElementById('preview-cancel');
const imagesSection = document.getElementById('images-section');
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
const imageDetail = document.getElementById('image-detail');
const imageDetailPreview = document.getElementById('image-detail-preview');
const imageCaptionInput = document.getElementById('image-caption-input');
const imageDestinationSelect = document.getElementById('image-destination-select');
const imageShowBtn = document.getElementById('image-show-btn');
const imageSendBtn = document.getElementById('image-send-btn');
const imageHideBtn = document.getElementById('image-hide-btn');
const imageSendFeedback = document.getElementById('image-send-feedback');
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
const controlTabs = document.getElementById('control-tabs');
const tabBar = document.getElementById('tab-bar');
const tabButtons = Array.from(document.querySelectorAll('.tab-btn'));
const immaginiTabBtn = document.querySelector('.tab-btn[data-tab-target="immagini"]');

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
  // Un invio in corso non riceverà mai la sua risposta se la riconnessione
  // ottiene un nuovo socket id (la risposta del server arriverebbe al
  // vecchio socket, ormai morto): senza questo reset il flag resterebbe
  // bloccato a true per sempre, con "Invia" disabilitato su ogni immagine.
  telegramSendPending = false;
  telegramSendFeedback = null;
  clearTimeout(telegramSendFeedbackTimeout);
  if (state) render();
});
socket.on('display:status', ({ connected }) => {
  displayConnected = connected;
  updateWifi();
});
socket.on('state:update', (s) => {
  state = s;
  render();
});
socket.on('telegram:sendResult', ({ imageId, ok, error }) => {
  telegramSendPending = false;
  telegramSendFeedback = { imageId, ok, error };
  render();
  clearTimeout(telegramSendFeedbackTimeout);
  telegramSendFeedbackTimeout = setTimeout(() => {
    telegramSendFeedback = null;
    render();
  }, 4000);
});

window.addEventListener('resize', () => {
  if (!state) return;
  const previewLocation = getPreviewLocation();
  renderMapPreview(previewLocation);
  updateViewportRect(previewLocation);
});

// Le tre schede (Mappa / Fog / Immagini) sono un cambio di composizione,
// non di funzionalità: mostrano/nascondono gli stessi pannelli di sempre.
// Sugli schermi larghi (vedi media query in control.css) la scheda Mappa
// resta comunque sempre visibile, il CSS ignora activeTab per quel pannello.
function setActiveTab(tab) {
  controlTabs.dataset.activeTab = tab;
  tabButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.tabTarget === tab));
  // #map-preview può passare da display:none a visibile (o cambiare
  // colonna, sui layout larghi) quando si cambia scheda: le sue misure
  // (clientWidth/Height) erano 0 o diverse finché non era in vista, quindi
  // vanno ricalcolate esattamente come al resize della finestra.
  if (state) {
    const previewLocation = getPreviewLocation();
    renderMapPreview(previewLocation);
    updateViewportRect(previewLocation);
  }
}

tabBar.addEventListener('click', (e) => {
  const btn = e.target.closest('.tab-btn');
  if (!btn || btn.disabled) return;
  setActiveTab(btn.dataset.tabTarget);
});

let previewLocationId = null;
let previewImageId = null;
let telegramDestinations = null; // null = non ancora caricate; [] = vuote/non disponibili
let telegramSendPending = false;
let telegramSendFeedback = null; // { imageId, ok, error } dell'ultimo invio, o null
let telegramSendFeedbackTimeout = null;

fetch('/api/telegram/destinations')
  .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
  .then((list) => { telegramDestinations = list; })
  .catch(() => { telegramDestinations = []; })
  .then(() => { if (state) render(); });

function getPreviewImage(location) {
  return ((location && location.images) || []).find((i) => i.id === previewImageId) || null;
}

function getActiveLocation() {
  return state.locations.find((l) => l.id === state.activeLocationId);
}

function getPreviewLocation() {
  return state.locations.find((l) => l.id === previewLocationId);
}

function render() {
  if (!previewLocationId || !state.locations.some((l) => l.id === previewLocationId && !l.archived)) {
    previewLocationId = state.activeLocationId;
  }
  const location = getActiveLocation();
  if (previewImageId && !((location && location.images) || []).some((i) => i.id === previewImageId)) {
    previewImageId = null;
  }
  const previewLocation = getPreviewLocation();
  const showingImage = Boolean(state.activeImageId);
  const isPreviewing = previewLocationId !== state.activeLocationId;

  previewBanner.hidden = !isPreviewing;
  if (isPreviewing && previewLocation) {
    previewBannerName.textContent = previewLocation.name;
  }
  imagesSection.style.display = isPreviewing ? 'none' : 'block';
  if (immaginiTabBtn) {
    immaginiTabBtn.disabled = isPreviewing;
    if (isPreviewing && controlTabs.dataset.activeTab === 'immagini') setActiveTab('mappa');
  }

  if (showingImage && location) {
    const shownImg = (location.images || []).find((i) => i.id === state.activeImageId);
    showingBanner.hidden = !shownImg;
    if (shownImg) showingBannerName.textContent = shownImg.name || '';
  } else {
    showingBanner.hidden = true;
  }

  locationSelect.innerHTML =
    (previewLocationId ? '' : '<option value="" selected disabled hidden>— nessuna location —</option>') +
    state.locations
      .filter((l) => !l.archived)
      .map((l) => `<option value="${l.id}" ${l.id === previewLocationId ? 'selected' : ''}>${escapeHtml(l.name)}</option>`)
      .join('');

  renderMapPreview(previewLocation);

  fowList.innerHTML = ((previewLocation && previewLocation.map.polygons) || [])
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
          <button class="image-thumb ${state.activeImageId === img.id ? 'active' : ''} ${previewImageId === img.id ? 'selected' : ''}" data-id="${img.id}">
            <img src="/storage/images/${img.file}" alt="${escapeHtml(img.name)}">
            <span class="image-thumb-label">${escapeHtml(img.name)}</span>
          </button>
        `
      )
      .join('') || '<p class="hint">nessuna immagine per questa location</p>';

  renderImageDetail(getPreviewImage(location));

  zoomLevel.textContent = `${Math.round(((previewLocation && previewLocation.map.liveView.scale) || 1) * 100)}%`;
  const hidePanZoomForImage = showingImage && !isPreviewing;
  panZoomSection.style.display = hidePanZoomForImage ? 'none' : 'block';

  const gridEnabled = Boolean(previewLocation && previewLocation.map.grid && previewLocation.map.grid.enabled) && !hidePanZoomForImage;
  gridOpacitySection.style.display = gridEnabled ? 'block' : 'none';
  if (gridEnabled) {
    gridOpacityLevel.textContent = `${Math.round((previewLocation.map.grid.opacity === undefined ? 1 : previewLocation.map.grid.opacity) * 100)}%`;
  }
  updateViewportRect(previewLocation);
}

function renderDestinationOptions(selectedName) {
  if (telegramDestinations === null) {
    return '<option value="">Caricamento…</option>';
  }
  if (!telegramDestinations.length) {
    return '<option value="">Destinazioni non disponibili</option>';
  }
  return ['<option value="">— scegli destinazione —</option>']
    .concat(
      telegramDestinations.map(
        (d) => `<option value="${escapeHtml(d.name)}" ${d.name === selectedName ? 'selected' : ''}>${escapeHtml(d.name)}</option>`
      )
    )
    .join('');
}

function renderImageDetail(previewImage) {
  imageDetail.hidden = !previewImage;
  if (!previewImage) return;

  imageDetailPreview.src = `/storage/images/${previewImage.file}`;
  imageDetailPreview.alt = previewImage.name || '';

  imageCaptionInput.value = previewImage.caption || '';

  const destinationsUnavailable = telegramDestinations !== null && !telegramDestinations.length;
  imageDestinationSelect.innerHTML = renderDestinationOptions(previewImage.telegramDestination);
  imageDestinationSelect.disabled = telegramDestinations === null || destinationsUnavailable;

  imageShowBtn.classList.toggle('is-live', state.activeImageId === previewImage.id);
  imageHideBtn.disabled = !state.activeImageId;

  const hasDestination = Boolean(previewImage.telegramDestination);
  imageSendBtn.disabled = !hasDestination || telegramSendPending;
  imageSendBtn.textContent = telegramSendPending ? 'Invio…' : 'Invia';

  if (telegramSendFeedback && telegramSendFeedback.imageId === previewImage.id) {
    imageSendFeedback.hidden = false;
    imageSendFeedback.textContent = telegramSendFeedback.ok ? 'Inviata ✓' : (telegramSendFeedback.error || 'Invio fallito');
    imageSendFeedback.classList.toggle('error', !telegramSendFeedback.ok);
  } else {
    imageSendFeedback.hidden = true;
  }
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
      const rotation = computeTotalRotation(nw, nh, location.map.flip180, location.map.rotate90);
      // Il contenitore deve avere la forma del contenuto DOPO la rotazione,
      // non quella grezza dell'immagine -- altrimenti, per una mappa che
      // viene ruotata di 90°/270° (es. ogni mappa verticale: l'auto-rotazione
      // la ruota per riempire meglio uno schermo orizzontale), il riquadro
      // resta della forma "sbagliata" e il fit lascia due bande vuote sopra
      // e sotto (o ai lati) l'immagine.
      const swapped = rotation === 90 || rotation === 270;
      if (nw && nh) mapPreview.style.setProperty('--map-aspect', swapped ? `${nh} / ${nw}` : `${nw} / ${nh}`);
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

locationSelect.addEventListener('change', () => {
  const targetId = locationSelect.value;
  if (!targetId || !state.locations.some((l) => l.id === targetId)) {
    locationSelect.value = previewLocationId || '';
    return;
  }
  previewLocationId = targetId;
  render();
});

previewSendBtn.addEventListener('click', () => {
  if (!previewLocationId) return;
  socket.emit('location:set', { locationId: previewLocationId });
});

previewCancelBtn.addEventListener('click', () => {
  previewLocationId = state.activeLocationId;
  render();
});

mapFogLayer.addEventListener('click', (e) => {
  if (panModeActive) return;
  const overlay = e.target.closest('.fog-overlay');
  if (overlay) socket.emit('fow:toggle', { locationId: previewLocationId, polygonId: overlay.dataset.id });
});

fogOpacityInput.addEventListener('input', () => {
  fogOpacity = Number(fogOpacityInput.value) / 100;
  if (state) renderMapPreview(getPreviewLocation());
});

fowList.addEventListener('click', (e) => {
  const btn = e.target.closest('.fow-row');
  if (btn) socket.emit('fow:toggle', { locationId: previewLocationId, polygonId: btn.dataset.id });
});

imagesList.addEventListener('click', (e) => {
  const btn = e.target.closest('.image-thumb');
  if (!btn) return;
  previewImageId = btn.dataset.id;
  render();
});

imageShowBtn.addEventListener('click', () => {
  if (!previewImageId) return;
  socket.emit('image:show', { imageId: previewImageId });
});

imageHideBtn.addEventListener('click', () => socket.emit('image:hide'));

imageSendBtn.addEventListener('click', () => {
  const previewImage = getPreviewImage(getActiveLocation());
  if (!previewImage || !previewImage.telegramDestination || telegramSendPending) return;
  telegramSendPending = true;
  telegramSendFeedback = null;
  socket.emit('image:sendTelegram', { locationId: state.activeLocationId, imageId: previewImage.id });
  render();
});

imageCaptionInput.addEventListener('change', () => {
  if (!previewImageId) return;
  socket.emit('image:caption', {
    locationId: state.activeLocationId,
    imageId: previewImageId,
    caption: imageCaptionInput.value
  });
});

imageDestinationSelect.addEventListener('change', () => {
  if (!previewImageId) return;
  socket.emit('image:destination', {
    locationId: state.activeLocationId,
    imageId: previewImageId,
    destination: imageDestinationSelect.value || null
  });
});

document.querySelectorAll('[data-pan]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const [dx, dy] = btn.dataset.pan.split(',').map(Number);
    const previewLocation = getPreviewLocation();
    const scale = (previewLocation && previewLocation.map.liveView.scale) || 1;
    const step = 20 / Math.max(scale, 0.01);
    socket.emit('view:pan', { locationId: previewLocationId, dx: dx * step, dy: dy * step });
  });
});

function stepZoom(delta) {
  const previewLocation = getPreviewLocation();
  const current = (previewLocation && previewLocation.map.liveView.scale) || 1;
  const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((current + delta) * 10) / 10));
  socket.emit('view:zoom', { locationId: previewLocationId, scale: next });
}
zoomOutBtn.addEventListener('click', () => stepZoom(-ZOOM_STEP));
zoomInBtn.addEventListener('click', () => stepZoom(ZOOM_STEP));

function stepGridOpacity(delta) {
  const location = getPreviewLocation();
  if (!location || !location.map.grid) return;
  const current = location.map.grid.opacity === undefined ? 1 : location.map.grid.opacity;
  const next = Math.min(1, Math.max(0, Math.round((current + delta) * 10) / 10));
  socket.emit('grid:update', { locationId: previewLocationId, opacity: next });
}
gridOpacityOutBtn.addEventListener('click', () => stepGridOpacity(-GRID_OPACITY_STEP));
gridOpacityInBtn.addEventListener('click', () => stepGridOpacity(GRID_OPACITY_STEP));

document.getElementById('view-reset').addEventListener('click', () => socket.emit('view:reset', { locationId: previewLocationId }));

fowHideAllBtn.addEventListener('click', () => {
  if (!previewLocationId) return;
  socket.emit('fow:setAll', { locationId: previewLocationId, revealed: false });
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
  if (!previewLocationId) return;
  if (!revealAllArmed) {
    revealAllArmed = true;
    fowRevealAllBtn.classList.add('confirm');
    fowRevealAllBtn.textContent = 'Click di nuovo per confermare';
    clearTimeout(revealAllArmTimeout);
    revealAllArmTimeout = setTimeout(resetRevealAllArm, 2500);
    return;
  }
  resetRevealAllArm();
  socket.emit('fow:setAll', { locationId: previewLocationId, revealed: true });
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
  const live = location.map.liveView || { scale: 1, offsetX: 0, offsetY: 0 };
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

  const location = getPreviewLocation();
  if (!location || !state.displayViewport || !currentImageRect) return;

  const nw = mediaW(activeMapEl);
  const nh = mediaH(activeMapEl);
  const rotation = computeTotalRotation(nw, nh, location.map.flip180, location.map.rotate90);
  const swapped = rotation === 90 || rotation === 270;
  const tvEffectiveW = swapped ? state.displayViewport.height : state.displayViewport.width;
  const tvEffectiveH = swapped ? state.displayViewport.width : state.displayViewport.height;
  const tvFit = fitRect(tvEffectiveW, tvEffectiveH, nw, nh);

  const mapScale = location.map.scale || 1;
  const S = mapScale * ((location.map.liveView && location.map.liveView.scale) || 1);

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

  socket.emit('view:pan', { locationId: previewLocationId, dx: -S * rx, dy: -S * ry });
});

mapPreview.addEventListener('pointerup', () => { panDrag = null; });
mapPreview.addEventListener('pointercancel', () => { panDrag = null; });
