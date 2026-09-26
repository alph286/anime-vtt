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
const fogOpacityOutBtn = document.getElementById('fog-opacity-out');
const fogOpacityInBtn = document.getElementById('fog-opacity-in');
const fogOpacityLevel = document.getElementById('fog-opacity-level');
const FOG_OPACITY_STEP = 0.1;
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
const gridOpacityRow = document.getElementById('grid-opacity-row');
const compassSection = document.getElementById('compass-section');
const compassToggle = document.getElementById('compass-toggle');
const compassNudgeUp = document.getElementById('compass-nudge-up');
const compassNudgeDown = document.getElementById('compass-nudge-down');
const compassNudgeLeft = document.getElementById('compass-nudge-left');
const compassNudgeRight = document.getElementById('compass-nudge-right');
const compassRotateBtn = document.getElementById('compass-rotate');
const COMPASS_NUDGE_STEP = 2;
const gridOpacityOutBtn = document.getElementById('grid-opacity-out');
const gridOpacityInBtn = document.getElementById('grid-opacity-in');
const gridOpacityLevel = document.getElementById('grid-opacity-level');
const GRID_OPACITY_STEP = 0.1;
const audioSection = document.getElementById('audio-section');
const audioSpecialRow = document.getElementById('audio-special-row');
const audioSpecialBtn = document.getElementById('audio-special-btn');
const audioPlaybackGroup = document.getElementById('audio-playback-group');
const audioTrackLabel = document.getElementById('audio-track-label');
const audioPlayPauseBtn = document.getElementById('audio-play-pause');
const audioPlayPauseIcon = document.getElementById('audio-play-pause-icon');
const audioStopBtn = document.getElementById('audio-stop');
const audioVolumeOutBtn = document.getElementById('audio-volume-out');
const audioVolumeInBtn = document.getElementById('audio-volume-in');
const audioVolumeLevel = document.getElementById('audio-volume-level');
const AUDIO_VOLUME_STEP = 0.1;
const zoomOutBtn = document.getElementById('zoom-out');
const zoomInBtn = document.getElementById('zoom-in');
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
const fogModeToggle = document.getElementById('fog-mode-toggle');
const pingModeToggle = document.getElementById('ping-mode-toggle');
const zoomModeToggle = document.getElementById('zoom-mode-toggle');
const aoeModeToggle = document.getElementById('aoe-mode-toggle');
const aoePanel = document.getElementById('aoe-panel');
const aoeShapeButtons = Array.from(document.querySelectorAll('.aoe-shape-btn'));
const aoeColorButtons = Array.from(document.querySelectorAll('.aoe-color-btn'));
const aoeSizeOutBtn = document.getElementById('aoe-size-out');
const aoeSizeInBtn = document.getElementById('aoe-size-in');
const aoeSizeLevel = document.getElementById('aoe-size-level');
const aoeWidthRow = document.getElementById('aoe-width-row');
const aoeWidthOutBtn = document.getElementById('aoe-width-out');
const aoeWidthInBtn = document.getElementById('aoe-width-in');
const aoeWidthLevel = document.getElementById('aoe-width-level');
const aoeChipList = document.getElementById('aoe-chip-list');
const mapAoeSvg = document.getElementById('map-aoe-svg');
const mapGridSvg = document.getElementById('map-grid-svg');

let aoeSelectedShape = 'cone';
let aoeSelectedColor = 'red';
let aoeSelectedSize = AOE_METERS_PER_CELL;
let aoeSelectedWidth = AOE_METERS_PER_CELL;

// Ogni swatch mostra sempre il proprio colore (fisso, non dipende dalla
// selezione corrente) -- va impostato una sola volta, non a ogni render.
aoeColorButtons.forEach((btn) => {
  btn.style.setProperty('--aoe-color', aoeColorHex(btn.dataset.color));
});

function renderAoePanel() {
  aoePanel.hidden = currentMode !== 'aoe';
  aoeShapeButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.shape === aoeSelectedShape));
  aoeColorButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.color === aoeSelectedColor));
  aoeSizeLevel.textContent = `${aoeSelectedSize.toLocaleString('it-IT', { minimumFractionDigits: 1 })} m`;
  aoeWidthRow.hidden = aoeSelectedShape !== 'line';
  aoeWidthLevel.textContent = `${aoeSelectedWidth.toLocaleString('it-IT', { minimumFractionDigits: 1 })} m`;
}

aoeShapeButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    aoeSelectedShape = btn.dataset.shape;
    renderAoePanel();
  });
});

aoeColorButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    aoeSelectedColor = btn.dataset.color;
    renderAoePanel();
  });
});

function stepAoeSize(delta) {
  aoeSelectedSize = Math.max(AOE_METERS_PER_CELL, aoeSelectedSize + delta);
  renderAoePanel();
}
aoeSizeOutBtn.addEventListener('click', () => stepAoeSize(-AOE_METERS_PER_CELL));
aoeSizeInBtn.addEventListener('click', () => stepAoeSize(AOE_METERS_PER_CELL));

function stepAoeWidth(delta) {
  aoeSelectedWidth = Math.max(AOE_METERS_PER_CELL, aoeSelectedWidth + delta);
  renderAoePanel();
}
aoeWidthOutBtn.addEventListener('click', () => stepAoeWidth(-AOE_METERS_PER_CELL));
aoeWidthInBtn.addEventListener('click', () => stepAoeWidth(AOE_METERS_PER_CELL));

const mapLocalZoomWrap = document.getElementById('map-local-zoom-wrap');
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

  // Il ping arriva ai giocatori solo se punta alla mappa che stanno
  // davvero guardando in questo momento: niente anteprima di un'altra
  // location, niente mentre è mostrata un'immagine al posto della mappa.
  pingModeToggle.disabled = isPreviewing || showingImage || !state.activeLocationId;
  if (pingModeToggle.disabled && currentMode === 'ping') setMode(null);

  // Stessa regola del Ping: piazzare un'area ha senso solo sulla mappa che
  // i giocatori vedono davvero ora. In più, senza un file mappa caricato non
  // c'è nulla su cui disegnare (mediaW/mediaH sarebbero 0): niente vicolo
  // cieco confuso per il DM.
  aoeModeToggle.disabled = isPreviewing || showingImage || !state.activeLocationId || !previewLocation?.map.file;
  if (aoeModeToggle.disabled && currentMode === 'aoe') setMode(null);

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
  if (selectedAoeId && !((previewLocation && previewLocation.map.aoes) || []).some((a) => a.id === selectedAoeId)) {
    selectedAoeId = null;
  }
  renderAoeChipList((previewLocation && previewLocation.map.aoes) || []);

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

  const hidePanZoomForImage = showingImage && !isPreviewing;
  panZoomSection.style.display = hidePanZoomForImage ? 'none' : 'block';

  const gridEnabled = Boolean(previewLocation && previewLocation.map.grid && previewLocation.map.grid.enabled) && !hidePanZoomForImage;
  gridOpacityRow.hidden = !gridEnabled;
  if (gridEnabled) {
    gridOpacityLevel.textContent = `${Math.round((previewLocation.map.grid.opacity === undefined ? 1 : previewLocation.map.grid.opacity) * 100)}%`;
  }

  compassSection.style.display = hidePanZoomForImage ? 'none' : 'block';
  compassToggle.classList.toggle('active', Boolean(previewLocation && previewLocation.map.compass && previewLocation.map.compass.visible));

  // A differenza delle sezioni sopra, l'audio riflette sempre la location
  // ATTIVA (`location`, non `previewLocation`): i comandi non hanno un
  // concetto di anteprima, quindi anche la UI non deve suggerirne uno.
  const audio = location && location.map.audio;
  const hasMain = Boolean(audio && audio.main && audio.main.file);
  const hasSpecial = Boolean(audio && audio.special && audio.special.file);
  audioSection.hidden = !hasMain && !hasSpecial;
  audioSpecialRow.hidden = !hasSpecial;

  const activeTrack = audio && audio[state.activeAudioTrack];
  const hasActiveTrack = Boolean(activeTrack && activeTrack.file);
  audioPlaybackGroup.hidden = !hasActiveTrack;
  if (hasActiveTrack) {
    audioTrackLabel.textContent = state.activeAudioTrack === 'special' ? 'Speciale' : 'Principale';
    audioPlayPauseIcon.setAttribute('href', state.audioState === 'playing' ? '#i-pause' : '#i-play');
    audioPlayPauseBtn.classList.toggle('active', state.audioState === 'playing');
    audioVolumeLevel.textContent = `${Math.round((activeTrack.volume === undefined ? 0.7 : activeTrack.volume) * 100)}%`;
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

let selectedAoeId = null;

// Arma-poi-conferma per la cancellazione, stesso pattern di armedImageDeletes
// in editor.js: le chip vengono ricostruite a ogni render, quindi lo stato
// "armato" vive fuori dal DOM. Il tasto rimuovi compare solo per l'area
// selezionata, quindi un solo id armato alla volta basta.
let armedRemoveAoeId = null;
let armedRemoveTimeout = null;

function disarmRemove() {
  clearTimeout(armedRemoveTimeout);
  armedRemoveAoeId = null;
}

function setSelectedAoeId(id) {
  if (id !== selectedAoeId) disarmRemove();
  selectedAoeId = id;
  render();
}

// Disegna, per ogni area piazzata, prima le celle colpite (sotto) poi il
// contorno della forma (sopra) -- altrimenti il contorno sparirebbe sotto
// il riempimento delle celle. Riempimento e contorno condividono lo stesso
// colore scelto per quell'area (aoe.color), impostato inline: la palette è
// fissa a 5 nomi, non un valore CSS statico.
function renderAoeOverlays(aoes, grid, naturalW, naturalH) {
  mapAoeSvg.innerHTML = '';
  if (!naturalW || !naturalH) return;
  aoes.forEach((aoe) => {
    const color = aoeColorHex(aoe.color);
    aoeAffectedCells(aoe, grid, naturalW, naturalH).forEach(({ col, row }) => {
      const rect = cellRectPercent(col, row, grid, naturalW, naturalH);
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      el.setAttribute('x', rect.leftPct);
      el.setAttribute('y', rect.topPct);
      el.setAttribute('width', rect.widthPct);
      el.setAttribute('height', rect.heightPct);
      el.setAttribute('class', 'aoe-cell-highlight');
      el.setAttribute('fill', color);
      el.setAttribute('stroke', color);
      mapAoeSvg.appendChild(el);
    });

    // shapeVisible:false nasconde solo l'aspetto del contorno (fill/stroke
    // "none"): il poligono resta nel DOM con la sua geometria e i suoi
    // pointer-events invariati, altrimenti trascinare l'area diventerebbe
    // impossibile una volta nascosta. Non si usa opacity:0 -- l'animazione
    // aoe-pulse anima proprio l'opacity e vincerebbe sul valore impostato qui.
    const points = aoeOutlinePoints(aoe, grid, naturalW, naturalH);
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', points.map(([x, y]) => `${x},${y}`).join(' '));
    poly.setAttribute('class', `aoe-shape-overlay ${aoe.id === selectedAoeId ? 'selected' : ''}`);
    const shapeVisible = aoe.shapeVisible !== false;
    poly.setAttribute('fill', shapeVisible ? color : 'none');
    poly.setAttribute('stroke', shapeVisible ? color : 'none');
    poly.dataset.id = aoe.id;
    mapAoeSvg.appendChild(poly);
  });
}

function aoeShapeLabel(shape) {
  return { cone: 'Cono', cube: 'Cubo', sphere: 'Sfera', line: 'Linea' }[shape] || shape;
}

function renderAoeChipList(aoes) {
  aoeChipList.innerHTML = aoes
    .map((aoe) => {
      const sizeText = aoe.sizeM.toLocaleString('it-IT', { minimumFractionDigits: 1 });
      const selected = aoe.id === selectedAoeId;
      const rotatable = aoe.shape === 'cone' || aoe.shape === 'line';
      const armed = armedRemoveAoeId === aoe.id;
      const actions = selected
        ? `
          <div class="aoe-chip-actions">
            ${rotatable ? `<button class="aoe-chip-rotate" data-dir="-1" title="Ruota a sinistra">↺</button>` : ''}
            ${rotatable ? `<button class="aoe-chip-rotate" data-dir="1" title="Ruota a destra">↻</button>` : ''}
            <button class="aoe-chip-remove ${armed ? 'confirm' : ''}" title="${armed ? 'Tocca di nuovo per confermare' : 'Rimuovi'}">✕</button>
          </div>
        `
        : '';
      const shapeVisible = aoe.shapeVisible !== false;
      return `
        <div class="aoe-chip ${selected ? 'selected' : ''}" data-id="${aoe.id}">
          <div class="aoe-chip-pill">
            <span class="aoe-chip-label">${escapeHtml(aoeShapeLabel(aoe.shape))} ${sizeText}m</span>
            <button class="aoe-chip-shape-toggle" title="${shapeVisible ? 'Nascondi il contorno trascinabile' : 'Mostra il contorno trascinabile'}">
              <svg class="icon"><use href="#${shapeVisible ? 'i-eye' : 'i-eye-off'}"></use></svg>
            </button>
          </div>
          ${actions}
        </div>
      `;
    })
    .join('');
}

// Su /control la mappa vive dentro #map-local-zoom-wrap, che riceve un
// transform:scale() per lo zoom locale del DM (vedi applyLocalZoom): senza
// dividere lineWidth per quella scala, la griglia si ingrosserebbe mentre si
// zooma -- stessa correzione già applicata da renderMap() in display.js per
// il proprio transform di pan/zoom condiviso.
let currentGrid = null;
let currentGridNW = 0;
let currentGridNH = 0;

function renderGrid(grid, naturalW, naturalH) {
  currentGrid = grid;
  currentGridNW = naturalW;
  currentGridNH = naturalH;
  if (!grid) {
    mapGridSvg.innerHTML = '';
    return;
  }
  renderGridSvg(mapGridSvg, { ...grid, lineWidth: (grid.lineWidth || 0.3) / Math.max(localZoom.scale, 0.01) }, naturalW, naturalH);
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
      renderGrid(location && location.map.grid, mediaW(activeMapEl), mediaH(activeMapEl));
      renderAoeOverlays((location && location.map.aoes) || [], location && location.map.grid, mediaW(activeMapEl), mediaH(activeMapEl));
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
    renderGrid(location && location.map.grid, mediaW(activeMapEl), mediaH(activeMapEl));
    renderAoeOverlays((location && location.map.aoes) || [], location && location.map.grid, mediaW(activeMapEl), mediaH(activeMapEl));
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
  resetLocalZoom();
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
  if (currentMode !== 'fog') return;
  const overlay = e.target.closest('.fog-overlay');
  if (overlay) socket.emit('fow:toggle', { locationId: previewLocationId, polygonId: overlay.dataset.id });
});

// Il ping funziona ovunque sulla mappa, non solo dentro un poligono fog:
// l'ascoltatore vive sul fit-box (l'antenato comune a immagine e fog-layer),
// così il tap arriva anche dove non c'è nessuna zona di fog disegnata.
// Usa pointerdown/pointerup invece di 'click': su touch, con touch-action:
// none attivo sull'antenato, alcuni browser non sintetizzano mai il click
// dopo un tap -- pointerup arriva sempre, sia da dito che da mouse.
let pingTapStart = null;

mapFitBox.addEventListener('pointerdown', (e) => {
  if (currentMode !== 'ping' || pingModeToggle.disabled) return;
  pingTapStart = { x: e.clientX, y: e.clientY, id: e.pointerId };
});

mapFitBox.addEventListener('pointerup', (e) => {
  if (currentMode !== 'ping' || pingModeToggle.disabled || !pingTapStart || e.pointerId !== pingTapStart.id) return;
  const { x: startX, y: startY } = pingTapStart;
  pingTapStart = null;
  // Oltre pochi pixel di movimento non è più un tap ma un trascinamento
  // accidentale (es. dito che scivola): non deve piazzare un ping.
  if (Math.hypot(e.clientX - startX, e.clientY - startY) > 8) return;

  const previewLocation = getPreviewLocation();
  if (!previewLocation) return;
  const rect = mapFitBox.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const rx = ((e.clientX - rect.left) / rect.width) * 100;
  const ry = ((e.clientY - rect.top) / rect.height) * 100;
  const nw = mediaW(activeMapEl);
  const nh = mediaH(activeMapEl);
  const rotation = computeTotalRotation(nw, nh, previewLocation.map.flip180, previewLocation.map.rotate90);
  const [x, y] = rotatePointToBase([rx, ry], rotation);
  socket.emit('ping:show', { locationId: previewLocationId, x, y });
});

mapFitBox.addEventListener('pointercancel', () => { pingTapStart = null; });

// AoE: un tap su un'area vuota della mappa piazza una nuova area (forma/
// taglia correnti); un trascinamento che parte da un'area già disegnata la
// sposta invece di piazzarne una nuova. Stessa soglia di 8px del ping per
// distinguere un tap da un trascinamento accidentale.
let aoePlaceStart = null;
let aoeDrag = null;

mapFitBox.addEventListener('pointerdown', (e) => {
  if (currentMode !== 'aoe' || aoeModeToggle.disabled) return;
  const overlay = e.target.closest('.aoe-shape-overlay');
  if (overlay) {
    aoeDrag = { id: overlay.dataset.id, pointerId: e.pointerId };
    setSelectedAoeId(overlay.dataset.id);
    mapFitBox.setPointerCapture(e.pointerId);
  } else {
    aoePlaceStart = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
  }
});

function localPointFromEvent(e) {
  const previewLocation = getPreviewLocation();
  if (!previewLocation) return null;
  const rect = mapFitBox.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const rx = ((e.clientX - rect.left) / rect.width) * 100;
  const ry = ((e.clientY - rect.top) / rect.height) * 100;
  const nw = mediaW(activeMapEl);
  const nh = mediaH(activeMapEl);
  const rotation = computeTotalRotation(nw, nh, previewLocation.map.flip180, previewLocation.map.rotate90);
  return rotatePointToBase([rx, ry], rotation);
}

mapFitBox.addEventListener('pointermove', (e) => {
  if (currentMode !== 'aoe' || aoeModeToggle.disabled) {
    aoeDrag = null;
    return;
  }
  if (!aoeDrag || e.pointerId !== aoeDrag.pointerId) return;
  const point = localPointFromEvent(e);
  if (!point) return;
  const [x, y] = point;
  socket.emit('aoe:move', { locationId: previewLocationId, aoeId: aoeDrag.id, x, y });
});

mapFitBox.addEventListener('pointerup', (e) => {
  if (currentMode !== 'aoe' || aoeModeToggle.disabled) {
    aoeDrag = null;
    aoePlaceStart = null;
    return;
  }
  if (aoeDrag && e.pointerId === aoeDrag.pointerId) {
    aoeDrag = null;
    return;
  }
  if (!aoePlaceStart || e.pointerId !== aoePlaceStart.pointerId) return;
  const { x: startX, y: startY } = aoePlaceStart;
  aoePlaceStart = null;
  if (Math.hypot(e.clientX - startX, e.clientY - startY) > 8) return;

  const point = localPointFromEvent(e);
  if (!point) return;
  const [x, y] = point;
  socket.emit('aoe:place', {
    locationId: previewLocationId,
    shape: aoeSelectedShape,
    color: aoeSelectedColor,
    sizeM: aoeSelectedSize,
    widthM: aoeSelectedShape === 'line' ? aoeSelectedWidth : undefined,
    x,
    y
  });
});

mapFitBox.addEventListener('pointercancel', (e) => {
  if (aoeDrag && e.pointerId === aoeDrag.pointerId) aoeDrag = null;
  if (aoePlaceStart && e.pointerId === aoePlaceStart.pointerId) aoePlaceStart = null;
});

function stepFogOpacity(delta) {
  fogOpacity = Math.min(1, Math.max(0, Math.round((fogOpacity + delta) * 10) / 10));
  fogOpacityLevel.textContent = `${Math.round(fogOpacity * 100)}%`;
  if (state) renderMapPreview(getPreviewLocation());
}
fogOpacityOutBtn.addEventListener('click', () => stepFogOpacity(-FOG_OPACITY_STEP));
fogOpacityInBtn.addEventListener('click', () => stepFogOpacity(FOG_OPACITY_STEP));

fowList.addEventListener('click', (e) => {
  const btn = e.target.closest('.fow-row');
  if (btn) socket.emit('fow:toggle', { locationId: previewLocationId, polygonId: btn.dataset.id });
});

aoeChipList.addEventListener('click', (e) => {
  const removeBtn = e.target.closest('.aoe-chip-remove');
  if (removeBtn) {
    const chip = removeBtn.closest('.aoe-chip');
    const aoeId = chip.dataset.id;
    if (armedRemoveAoeId !== aoeId) {
      armedRemoveAoeId = aoeId;
      clearTimeout(armedRemoveTimeout);
      armedRemoveTimeout = setTimeout(() => {
        armedRemoveAoeId = null;
        render();
      }, 2500);
      render();
      return;
    }
    disarmRemove();
    socket.emit('aoe:remove', { locationId: previewLocationId, aoeId });
    return;
  }
  const rotateBtn = e.target.closest('.aoe-chip-rotate');
  if (rotateBtn) {
    const chip = rotateBtn.closest('.aoe-chip');
    const previewLocation = getPreviewLocation();
    const aoe = previewLocation && previewLocation.map.aoes.find((a) => a.id === chip.dataset.id);
    if (!aoe) return;
    const dir = Number(rotateBtn.dataset.dir);
    const nextRotation = ((aoe.rotation + dir * 15) % 360 + 360) % 360;
    socket.emit('aoe:rotate', { locationId: previewLocationId, aoeId: aoe.id, rotation: nextRotation });
    return;
  }
  const shapeToggleBtn = e.target.closest('.aoe-chip-shape-toggle');
  if (shapeToggleBtn) {
    const chip = shapeToggleBtn.closest('.aoe-chip');
    const previewLocation = getPreviewLocation();
    const aoe = previewLocation && previewLocation.map.aoes.find((a) => a.id === chip.dataset.id);
    if (!aoe) return;
    socket.emit('aoe:setShapeVisible', { locationId: previewLocationId, aoeId: aoe.id, visible: aoe.shapeVisible === false });
    return;
  }
  const pill = e.target.closest('.aoe-chip-pill');
  if (pill) {
    const chip = pill.closest('.aoe-chip');
    setSelectedAoeId(selectedAoeId === chip.dataset.id ? null : chip.dataset.id);
  }
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
    if (currentMode === 'pan') setMode(null);
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

let currentMode = null; // null | 'pan' | 'fog' | 'ping' | 'zoom' | 'aoe'
let panDrag = null;

const MODE_BUTTONS = { pan: panModeToggle, fog: fogModeToggle, ping: pingModeToggle, zoom: zoomModeToggle, aoe: aoeModeToggle };

// Le cinque modalità (pan, fog, ping, zoom, aoe) sono mutuamente esclusive:
// un tap sulla mappa ha un solo significato alla volta. Riattivare la
// modalità già attiva la disattiva (torna a "nessuna modalità" = il tap non
// fa nulla).
function setMode(mode) {
  if (mode && MODE_BUTTONS[mode].disabled) mode = null;
  currentMode = currentMode === mode ? null : mode;
  Object.entries(MODE_BUTTONS).forEach(([m, btn]) => btn.classList.toggle('active', currentMode === m));
  mapPreview.classList.toggle('mode-pan', currentMode === 'pan');
  mapPreview.classList.toggle('mode-fog', currentMode === 'fog');
  mapPreview.classList.toggle('mode-ping', currentMode === 'ping');
  mapPreview.classList.toggle('mode-zoom', currentMode === 'zoom');
  mapPreview.classList.toggle('mode-aoe', currentMode === 'aoe');
  renderAoePanel();
}

Object.entries(MODE_BUTTONS).forEach(([mode, btn]) => {
  btn.addEventListener('click', () => setMode(mode));
});

// In modalità sposta, il tocco sul fog viene sospeso del tutto: nessuna
// ambiguità tap-vs-trascinamento da risolvere, ogni gesto sull'anteprima è
// per forza un trascinamento.
mapPreview.addEventListener('pointerdown', (e) => {
  // Un tocco che parte dal pulsante stesso non deve mai innescare la
  // capture: altrimenti il click risultante verrebbe rediretto a
  // mapPreview invece che al pulsante, e spegnere la modalità con un tocco
  // reale diventerebbe impossibile (setPointerCapture ridirige il click).
  if (currentMode !== 'pan' || e.target.closest('#map-mode-toggles')) return;
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

// Zoom locale: solo visivo, sul dispositivo del DM. Trasforma
// #map-local-zoom-wrap (mai #map-media-wrap, che porta già la rotazione
// della mappa e viene riscritto ad ogni renderMapPreview) — così non tocca
// né la vista condivisa (location.map.liveView) né la matematica di
// viewport-rect/pan-mode, che restano nello spazio "non zoomato".
const ZOOM_LOCAL_MIN = 1;
const ZOOM_LOCAL_MAX = 5;
let localZoom = { scale: 1, x: 0, y: 0 };
const localZoomPointers = new Map();
let localZoomPinchStartDist = null;
let localZoomPinchStartScale = 1;
let localZoomDragLast = null;

function applyLocalZoom() {
  mapLocalZoomWrap.style.transform =
    localZoom.scale === 1 && !localZoom.x && !localZoom.y
      ? ''
      : `translate(${localZoom.x}px, ${localZoom.y}px) scale(${localZoom.scale})`;
  // Il transform sopra scala anche lo spessore della griglia: ridisegnarla
  // con lineWidth ricompensato mantiene lo spessore scelto costante mentre
  // si zooma, non solo al render successivo dello stato.
  if (currentGrid) renderGrid(currentGrid, currentGridNW, currentGridNH);
}

// Non lascia che il contenuto ingrandito scivoli così lontano da uscire
// del tutto dal riquadro visibile.
function clampLocalZoomPan() {
  const maxX = (mapPreview.clientWidth * (localZoom.scale - 1)) / 2;
  const maxY = (mapPreview.clientHeight * (localZoom.scale - 1)) / 2;
  localZoom.x = Math.min(maxX, Math.max(-maxX, localZoom.x));
  localZoom.y = Math.min(maxY, Math.max(-maxY, localZoom.y));
}

function resetLocalZoom() {
  localZoom = { scale: 1, x: 0, y: 0 };
  localZoomPointers.clear();
  localZoomPinchStartDist = null;
  localZoomDragLast = null;
  mapPreview.classList.remove('zoom-dragging');
  applyLocalZoom();
}

function pointerDist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

mapPreview.addEventListener('pointerdown', (e) => {
  if (currentMode !== 'zoom' || e.target.closest('#map-mode-toggles')) return;
  localZoomPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  mapPreview.setPointerCapture(e.pointerId);
  if (localZoomPointers.size === 1) {
    localZoomDragLast = { x: e.clientX, y: e.clientY };
    mapPreview.classList.add('zoom-dragging');
  } else if (localZoomPointers.size === 2) {
    localZoomDragLast = null;
    const [p1, p2] = [...localZoomPointers.values()];
    localZoomPinchStartDist = pointerDist(p1, p2);
    localZoomPinchStartScale = localZoom.scale;
  }
});

mapPreview.addEventListener('pointermove', (e) => {
  if (currentMode !== 'zoom' || !localZoomPointers.has(e.pointerId)) return;
  localZoomPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (localZoomPointers.size >= 2) {
    const [p1, p2] = [...localZoomPointers.values()];
    const dist = pointerDist(p1, p2);
    if (localZoomPinchStartDist) {
      localZoom.scale = Math.min(ZOOM_LOCAL_MAX, Math.max(ZOOM_LOCAL_MIN, localZoomPinchStartScale * (dist / localZoomPinchStartDist)));
      clampLocalZoomPan();
      applyLocalZoom();
    }
    return;
  }

  if (localZoomDragLast && localZoom.scale > 1) {
    localZoom.x += e.clientX - localZoomDragLast.x;
    localZoom.y += e.clientY - localZoomDragLast.y;
    localZoomDragLast = { x: e.clientX, y: e.clientY };
    clampLocalZoomPan();
    applyLocalZoom();
  } else {
    localZoomDragLast = { x: e.clientX, y: e.clientY };
  }
});

function endLocalZoomPointer(e) {
  if (!localZoomPointers.has(e.pointerId)) return;
  localZoomPointers.delete(e.pointerId);
  if (localZoomPointers.size < 2) localZoomPinchStartDist = null;
  if (localZoomPointers.size === 1) {
    localZoomDragLast = { ...[...localZoomPointers.values()][0] };
  } else if (localZoomPointers.size === 0) {
    localZoomDragLast = null;
    mapPreview.classList.remove('zoom-dragging');
  }
}

mapPreview.addEventListener('pointerup', endLocalZoomPointer);
mapPreview.addEventListener('pointercancel', endLocalZoomPointer);

compassToggle.addEventListener('click', () => {
  const previewLocation = getPreviewLocation();
  if (!previewLocation || !previewLocation.map.compass) return;
  socket.emit('compass:update', { locationId: previewLocationId, visible: !previewLocation.map.compass.visible });
});

function nudgeCompass(dx, dy) {
  const previewLocation = getPreviewLocation();
  const compass = previewLocation && previewLocation.map.compass;
  if (!compass) return;
  const x = Math.min(100, Math.max(0, compass.x + dx * COMPASS_NUDGE_STEP));
  const y = Math.min(100, Math.max(0, compass.y + dy * COMPASS_NUDGE_STEP));
  socket.emit('compass:update', { locationId: previewLocationId, x, y });
}
compassNudgeUp.addEventListener('click', () => nudgeCompass(0, -1));
compassNudgeDown.addEventListener('click', () => nudgeCompass(0, 1));
compassNudgeLeft.addEventListener('click', () => nudgeCompass(-1, 0));
compassNudgeRight.addEventListener('click', () => nudgeCompass(1, 0));

compassRotateBtn.addEventListener('click', () => {
  const previewLocation = getPreviewLocation();
  const compass = previewLocation && previewLocation.map.compass;
  if (!compass) return;
  const rotation = ((compass.rotation + 90) % 360 + 360) % 360;
  socket.emit('compass:update', { locationId: previewLocationId, rotation });
});

audioPlayPauseBtn.addEventListener('click', () => {
  socket.emit(state.audioState === 'playing' ? 'audio:pause' : 'audio:play', {});
});

audioStopBtn.addEventListener('click', () => {
  socket.emit('audio:stop', {});
});

function stepAudioVolume(delta) {
  const location = getActiveLocation();
  const audio = location && location.map.audio;
  const track = audio && audio[state.activeAudioTrack];
  if (!track || !track.file) return;
  const current = track.volume === undefined ? 0.7 : track.volume;
  const next = Math.min(1, Math.max(0, Math.round((current + delta) * 10) / 10));
  socket.emit('audio:volume', { volume: next });
}
audioVolumeOutBtn.addEventListener('click', () => stepAudioVolume(-AUDIO_VOLUME_STEP));
audioVolumeInBtn.addEventListener('click', () => stepAudioVolume(AUDIO_VOLUME_STEP));

audioSpecialBtn.addEventListener('click', () => {
  socket.emit('audio:playSpecial', {});
});
