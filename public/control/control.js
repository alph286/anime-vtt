const socket = io();
let state = null;
let fogOpacity = 0.45;
let currentImageRect = null;
let socketConnected = false;
let displayConnected = false;

// Opacità e visibilità della griglia nella SOLA anteprima del DM: non sono
// dati di gioco (non vanno a `location.map.grid`, non si sincronizzano con
// i giocatori), ma preferenze del dispositivo -- stesso pattern già usato
// per la posizione del pad AOE (vedi AOE_NUDGE_POS_KEY più sotto).
const DM_GRID_OPACITY_KEY = 'dmGridOpacity';
const DM_GRID_VISIBLE_KEY = 'dmGridVisible';

function loadDmGridOpacity() {
  try {
    const raw = localStorage.getItem(DM_GRID_OPACITY_KEY);
    const n = raw === null ? NaN : Number(raw);
    if (Number.isFinite(n)) return Math.min(1, Math.max(0, n));
  } catch (err) { /* localStorage non disponibile o valore corrotto: resta sul default */ }
  return 1;
}

function loadDmGridVisible() {
  try {
    const raw = localStorage.getItem(DM_GRID_VISIBLE_KEY);
    if (raw !== null) return raw === 'true';
  } catch (err) { /* localStorage non disponibile: resta sul default */ }
  return true;
}

let dmGridOpacity = loadDmGridOpacity();
let dmGridVisible = loadDmGridVisible();

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
const fogSection = document.getElementById('fog-section');
const fogOpacityOutBtn = document.getElementById('fog-opacity-out');
const fogOpacityInBtn = document.getElementById('fog-opacity-in');
const fogOpacityLevel = document.getElementById('fog-opacity-level');
const fogProgressRow = document.getElementById('fog-progress-row');
const fogProgressFraction = document.getElementById('fog-progress-fraction');
const fogProgressFill = document.getElementById('fog-progress-fill');
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
const gridOpacityDmRow = document.getElementById('grid-opacity-dm-row');
const gridOpacityDmOutBtn = document.getElementById('grid-opacity-dm-out');
const gridOpacityDmInBtn = document.getElementById('grid-opacity-dm-in');
const gridOpacityDmLevel = document.getElementById('grid-opacity-dm-level');
const gridOpacityPlayersRow = document.getElementById('grid-opacity-players-row');
const gridOpacityPlayersOutBtn = document.getElementById('grid-opacity-players-out');
const gridOpacityPlayersInBtn = document.getElementById('grid-opacity-players-in');
const gridOpacityPlayersLevel = document.getElementById('grid-opacity-players-level');
const gridDmVisibleRow = document.getElementById('grid-dm-visible-row');
const gridDmVisibleToggle = document.getElementById('grid-dm-visible-toggle');
const gridDmVisibleIcon = document.getElementById('grid-dm-visible-icon');
const compassSection = document.getElementById('compass-section');
const compassToggle = document.getElementById('compass-toggle');
const compassNudgeUp = document.getElementById('compass-nudge-up');
const compassNudgeDown = document.getElementById('compass-nudge-down');
const compassNudgeLeft = document.getElementById('compass-nudge-left');
const compassNudgeRight = document.getElementById('compass-nudge-right');
const compassRotateBtn = document.getElementById('compass-rotate');
const COMPASS_NUDGE_STEP = 2;
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
const zoomSection = document.getElementById('zoom-section');
const zoomToPlayersBtn = document.getElementById('zoom-to-players-btn');
const wifiDot = document.getElementById('wifi-dot');
const showingBanner = document.getElementById('showing-banner');
const showingBannerName = document.getElementById('showing-banner-name');
const fowHideAllBtn = document.getElementById('fow-hide-all');
const fowRevealAllBtn = document.getElementById('fow-reveal-all');
const viewportRect = document.getElementById('viewport-rect');
const mapCompassMarker = document.getElementById('map-compass-marker');
const panModeToggle = document.getElementById('pan-mode-toggle');
const fogModeToggle = document.getElementById('fog-mode-toggle');
const pingModeToggle = document.getElementById('ping-mode-toggle');
const zoomModeToggle = document.getElementById('zoom-mode-toggle');
const aoeModeToggle = document.getElementById('aoe-mode-toggle');
const aoePanel = document.getElementById('aoe-panel');
const aoeEditingLabel = document.getElementById('aoe-editing-label');
const aoeShapeBar = document.getElementById('aoe-shape-bar');
const aoeShapeButtons = Array.from(document.querySelectorAll('.aoe-shape-btn'));
const aoeColorButtons = Array.from(document.querySelectorAll('.aoe-color-btn'));
const aoeShaderMenuBtn = document.getElementById('aoe-shader-menu-btn');
const aoeShaderMenu = document.getElementById('aoe-shader-menu');
const aoeShaderMenuItems = Array.from(document.querySelectorAll('.aoe-shader-menu-item'));
const aoeSizeOutBtn = document.getElementById('aoe-size-out');
const aoeSizeInBtn = document.getElementById('aoe-size-in');
const aoeSizeLevel = document.getElementById('aoe-size-level');
const aoeWidthRow = document.getElementById('aoe-width-row');
const aoeWidthOutBtn = document.getElementById('aoe-width-out');
const aoeWidthInBtn = document.getElementById('aoe-width-in');
const aoeWidthLevel = document.getElementById('aoe-width-level');
const aoeChipList = document.getElementById('aoe-chip-list');
const aoeNudgeOverlay = document.getElementById('aoe-nudge-overlay');
const aoeRotateCcw = document.getElementById('aoe-rotate-ccw');
const aoeRotateCw = document.getElementById('aoe-rotate-cw');
const aoeNudgeUp = document.getElementById('aoe-nudge-up');
const aoeNudgeDown = document.getElementById('aoe-nudge-down');
const aoeNudgeLeft = document.getElementById('aoe-nudge-left');
const aoeNudgeRight = document.getElementById('aoe-nudge-right');
const aoeNudgeColor = document.getElementById('aoe-nudge-color');
const aoeNudgeSizeUp = document.getElementById('aoe-nudge-size-up');
const aoeNudgeSizeDown = document.getElementById('aoe-nudge-size-down');
const aoeNudgeWidthUp = document.getElementById('aoe-nudge-width-up');
const aoeNudgeWidthDown = document.getElementById('aoe-nudge-width-down');
const aoeNudgeDragHandle = document.getElementById('aoe-nudge-drag-handle');
const mapAoeSvg = document.getElementById('map-aoe-svg');
const mapGridSvg = document.getElementById('map-grid-svg');
const mapShaderCanvas = document.getElementById('map-shader-canvas');
const shaderLayer = new ShaderLayer(mapShaderCanvas);
const mapPingCanvas = document.getElementById('map-ping-canvas');
const pingLayer = new PingLayer(mapPingCanvas);
const mapAoeShaderCanvas = document.getElementById('map-aoe-shader-canvas');
const aoeShaderLayer = new AoeShaderLayer(mapAoeShaderCanvas);

let aoeSelectedShape = 'cone';
let aoeSelectedColor = 'red';
let aoeSelectedSize = AOE_METERS_PER_CELL;
let aoeSelectedWidth = AOE_METERS_PER_CELL;
// Shader "extra" (menu "···", vedi AOE_SHADER_OVERRIDE_IDS) di default per
// il prossimo piazzamento -- stesso ruolo di aoeSelectedColor/Shape, ma
// indipendente dal colore (vedi resolveAoeShaderId in media.js): il colore
// resta sempre quello di anteprima, l'override sceglie solo lo shader.
let aoeSelectedShaderOverride = null;
// Stato puramente di interfaccia (mai inviato al server): se il menu
// inline è aperto o chiuso in questo momento.
let aoeShaderMenuOpen = false;

// Ogni swatch mostra sempre il proprio colore (fisso, non dipende dalla
// selezione corrente) -- va impostato una sola volta, non a ogni render.
aoeColorButtons.forEach((btn) => {
  btn.style.setProperty('--aoe-color', aoeColorHex(btn.dataset.color));
});

// Con una chip selezionata il pannello passa da "prossima area" a
// "modifica quest'area": la forma resta fissa (cambiarla vorrebbe dire
// un'altra area, non la stessa ridimensionata), ma colore e taglia/
// larghezza diventano live sull'area selezionata invece che sui default
// per il prossimo piazzamento.
function getSelectedAoe() {
  const previewLocation = getPreviewLocation();
  return previewLocation && previewLocation.map.aoes.find((a) => a.id === selectedAoeId);
}

function renderAoePanel() {
  aoePanel.hidden = currentMode !== 'aoe';
  const editingAoe = getSelectedAoe();

  aoeShapeBar.hidden = Boolean(editingAoe);
  aoeEditingLabel.hidden = !editingAoe;
  if (editingAoe) {
    const sizeText = editingAoe.sizeM.toLocaleString('it-IT', { minimumFractionDigits: 1 });
    aoeEditingLabel.textContent = `Modifica: ${aoeShapeLabel(editingAoe.shape)} ${sizeText}m`;
  }

  const displayShape = editingAoe ? editingAoe.shape : aoeSelectedShape;
  const displayColor = editingAoe ? editingAoe.color : aoeSelectedColor;
  const displaySize = editingAoe ? editingAoe.sizeM : aoeSelectedSize;
  const displayWidth = editingAoe ? (editingAoe.widthM || AOE_METERS_PER_CELL) : aoeSelectedWidth;
  const displayShaderOverride = editingAoe ? editingAoe.shaderOverride : aoeSelectedShaderOverride;

  aoeShapeButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.shape === displayShape));
  aoeColorButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.color === displayColor));
  aoeShaderMenuBtn.classList.toggle('active', Boolean(displayShaderOverride));
  aoeShaderMenu.hidden = !aoeShaderMenuOpen;
  aoeShaderMenuItems.forEach((btn) => btn.classList.toggle('active', btn.dataset.shader === displayShaderOverride));
  const sizeDimensionLabel = aoeSizeDimensionLabel(displayShape);
  aoeSizeLevel.textContent = `${sizeDimensionLabel}: ${displaySize.toLocaleString('it-IT', { minimumFractionDigits: 1 })} m`;
  aoeSizeOutBtn.title = `Riduci ${sizeDimensionLabel.toLowerCase()}`;
  aoeSizeInBtn.title = `Aumenta ${sizeDimensionLabel.toLowerCase()}`;
  aoeWidthRow.hidden = displayShape !== 'line';
  aoeWidthLevel.textContent = `${displayWidth.toLocaleString('it-IT', { minimumFractionDigits: 1 })} m`;

  const previewLocation = getPreviewLocation();
  renderAoeNudgeOverlay(editingAoe, previewLocation && previewLocation.map.grid);
}

aoeShapeButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    aoeSelectedShape = btn.dataset.shape;
    renderAoePanel();
  });
});

// Scegliere un colore e scegliere uno shader dal menu "···" sono ora un
// unico gruppo mutuamente esclusivo (come dei radio button): cliccare un
// colore spegne anche un eventuale override attivo, altrimenti lo shader
// "lanciato" restava quello del menu anche dopo aver toccato un colore
// (bug segnalato dall'utente: sembrava di dover prima "disattivare" la
// voce del menu per riavere i colori). Vedi il simmetrico in
// aoeShaderMenuItems sotto, che azzera invece il colore scelto qui.
aoeColorButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const editingAoe = getSelectedAoe();
    if (editingAoe) {
      socket.emit('aoe:setColor', { locationId: previewLocationId, aoeId: editingAoe.id, color: btn.dataset.color });
      if (editingAoe.shaderOverride) {
        socket.emit('aoe:setShaderOverride', { locationId: previewLocationId, aoeId: editingAoe.id, shaderOverride: null });
      }
      return;
    }
    aoeSelectedColor = btn.dataset.color;
    aoeSelectedShaderOverride = null;
    renderAoePanel();
  });
});

aoeShaderMenuBtn.addEventListener('click', () => {
  aoeShaderMenuOpen = !aoeShaderMenuOpen;
  renderAoePanel();
});

// Scegliere una voce è un toggle (come la selezione di una chip area):
// riselezionare la stessa voce torna al semplice abbinamento colore->
// shader (shaderOverride null), invece di restare bloccati su quella
// scelta senza un modo per tornare indietro dal menu stesso. Ogni voce
// ha un proprio colore di anteprima/evidenziazione celle di default
// (AOE_SHADER_OVERRIDE_DEFAULT_COLOR in media.js: bianco per la
// maggior parte, viola solo per Viola Cornelia) -- applicato solo
// quando si SCEGLIE un override (non quando lo si toglie); da lì in poi
// il DM lo cicla a piacere col pulsante "cambia colore" del pad
// (aoeNudgeColor), che resta indipendente dall'override scelto qui.
aoeShaderMenuItems.forEach((btn) => {
  btn.addEventListener('click', () => {
    const editingAoe = getSelectedAoe();
    const current = editingAoe ? editingAoe.shaderOverride : aoeSelectedShaderOverride;
    const next = current === btn.dataset.shader ? null : btn.dataset.shader;
    const defaultColor = AOE_SHADER_OVERRIDE_DEFAULT_COLOR[btn.dataset.shader];
    if (editingAoe) {
      socket.emit('aoe:setShaderOverride', { locationId: previewLocationId, aoeId: editingAoe.id, shaderOverride: next });
      if (next) socket.emit('aoe:setColor', { locationId: previewLocationId, aoeId: editingAoe.id, color: defaultColor });
    } else {
      aoeSelectedShaderOverride = next;
      if (next) aoeSelectedColor = defaultColor;
    }
    aoeShaderMenuOpen = false;
    renderAoePanel();
  });
});

// Ridimensionare un'area già piazzata può romperne l'aggancio alla griglia
// se la nuova taglia cambia parità (es. da pari a dispari): ricalcolare
// l'origine con snapAoeOrigin, a partire dalla posizione attuale, la
// riallinea automaticamente invece di lasciarla a metà cella.
function resizeSelectedAoe(deltaSize, deltaWidth) {
  const editingAoe = getSelectedAoe();
  if (!editingAoe) return;
  const previewLocation = getPreviewLocation();
  const grid = previewLocation && previewLocation.map.grid;
  const nw = mediaW(activeMapEl);
  const nh = mediaH(activeMapEl);
  const newSizeM = Math.max(AOE_METERS_PER_CELL, editingAoe.sizeM + deltaSize);
  const newWidthM = editingAoe.shape === 'line'
    ? Math.max(AOE_METERS_PER_CELL, (editingAoe.widthM || AOE_METERS_PER_CELL) + deltaWidth)
    : editingAoe.widthM;
  const [x, y] = snapAoeOrigin(editingAoe.shape, newSizeM, newWidthM, editingAoe.rotation, grid, editingAoe.x, editingAoe.y, nw, nh);
  socket.emit('aoe:resize', {
    locationId: previewLocationId,
    aoeId: editingAoe.id,
    sizeM: newSizeM,
    widthM: newWidthM,
    x,
    y
  });
}

function stepAoeSize(delta) {
  if (getSelectedAoe()) {
    resizeSelectedAoe(delta, 0);
    return;
  }
  aoeSelectedSize = Math.max(AOE_METERS_PER_CELL, aoeSelectedSize + delta);
  renderAoePanel();
}
aoeSizeOutBtn.addEventListener('click', () => stepAoeSize(-AOE_METERS_PER_CELL));
aoeSizeInBtn.addEventListener('click', () => stepAoeSize(AOE_METERS_PER_CELL));

function stepAoeWidth(delta) {
  if (getSelectedAoe()) {
    resizeSelectedAoe(0, delta);
    return;
  }
  aoeSelectedWidth = Math.max(AOE_METERS_PER_CELL, aoeSelectedWidth + delta);
  renderAoePanel();
}
aoeWidthOutBtn.addEventListener('click', () => stepAoeWidth(-AOE_METERS_PER_CELL));
aoeWidthInBtn.addEventListener('click', () => stepAoeWidth(AOE_METERS_PER_CELL));

// Per Cono e Linea il punto valido (vertice o centro-lato/cella) dipende
// dall'angolo -- senza ri-agganciare qui, l'origine resterebbe ferma dove
// era mentre la regola di aggancio cambia sotto di lei, disallineando la
// forma dalla griglia appena ruotata (stesso pattern di resizeSelectedAoe
// per la taglia).
function rotateSelectedAoe(delta) {
  const editingAoe = getSelectedAoe();
  if (!editingAoe) return;
  const previewLocation = getPreviewLocation();
  const grid = previewLocation && previewLocation.map.grid;
  const nw = mediaW(activeMapEl);
  const nh = mediaH(activeMapEl);
  const nextRotation = ((editingAoe.rotation + delta) % 360 + 360) % 360;
  const [x, y] = snapAoeOrigin(editingAoe.shape, editingAoe.sizeM, editingAoe.widthM, nextRotation, grid, editingAoe.x, editingAoe.y, nw, nh);
  socket.emit('aoe:rotate', { locationId: previewLocationId, aoeId: editingAoe.id, rotation: nextRotation, x, y });
}

aoeRotateCcw.addEventListener('click', () => rotateSelectedAoe(-15));
aoeRotateCw.addEventListener('click', () => rotateSelectedAoe(15));

// Sposta l'origine dell'area selezionata di esattamente 1 cella nella
// direzione data, poi ri-applica lo snap (stessa logica del trascinamento):
// così il risultato resta sempre un punto valido per la forma, qualunque
// sia la sua regola di aggancio attuale.
// dx/dy arrivano in direzioni SCHERMO (il tasto "su" preme sempre verso
// l'alto sullo schermo) -- rotateDirectionToBase le converte nella
// direzione base corrispondente prima di applicarle a x/y, altrimenti con
// la mappa ruotata (es. un'immagine verticale, auto-ruotata di 90°)
// "su" sposterebbe la forma di lato invece che in alto.
function nudgeSelectedAoe(dx, dy) {
  const editingAoe = getSelectedAoe();
  if (!editingAoe) return;
  const previewLocation = getPreviewLocation();
  const grid = previewLocation && previewLocation.map.grid;
  if (!grid || !grid.enabled) return;
  const nw = mediaW(activeMapEl);
  const nh = mediaH(activeMapEl);
  if (!nw || !nh) return;
  const rotation = computeTotalRotation(nw, nh, previewLocation.map.flip180, previewLocation.map.rotate90);
  const [baseDx, baseDy] = rotateDirectionToBase([dx, dy], rotation);
  const stepXPct = (grid.cellSize / nw) * 100;
  const stepYPct = (grid.cellSize / nh) * 100;
  const rawX = Math.min(100, Math.max(0, editingAoe.x + baseDx * stepXPct));
  const rawY = Math.min(100, Math.max(0, editingAoe.y + baseDy * stepYPct));
  const [x, y] = snapAoeOrigin(editingAoe.shape, editingAoe.sizeM, editingAoe.widthM, editingAoe.rotation, grid, rawX, rawY, nw, nh);
  socket.emit('aoe:move', { locationId: previewLocationId, aoeId: editingAoe.id, x, y });
}

aoeNudgeUp.addEventListener('click', () => nudgeSelectedAoe(0, -1));
aoeNudgeDown.addEventListener('click', () => nudgeSelectedAoe(0, 1));
aoeNudgeLeft.addEventListener('click', () => nudgeSelectedAoe(-1, 0));
aoeNudgeRight.addEventListener('click', () => nudgeSelectedAoe(1, 0));

// Cicla solo i 4 colori della color bar (AOE_COLOR_CYCLE_NAMES), mai
// `purple`: quel colore resta riservato all'evidenziazione di Viola
// Cornelia (vedi AOE_SHADER_OVERRIDE_DEFAULT_COLOR), non è una scelta
// che il DM fa di persona qui. Se il colore attuale non è tra i 4
// ciclabili (es. viola, o un valore futuro), si riparte dal primo.
aoeNudgeColor.addEventListener('click', () => {
  const editingAoe = getSelectedAoe();
  if (!editingAoe) return;
  const names = AOE_COLOR_CYCLE_NAMES;
  const idx = names.indexOf(editingAoe.color);
  const next = names[(idx + 1) % names.length];
  socket.emit('aoe:setColor', { locationId: previewLocationId, aoeId: editingAoe.id, color: next });
});

aoeNudgeSizeUp.addEventListener('click', () => resizeSelectedAoe(AOE_METERS_PER_CELL, 0));
aoeNudgeSizeDown.addEventListener('click', () => resizeSelectedAoe(-AOE_METERS_PER_CELL, 0));
aoeNudgeWidthUp.addEventListener('click', () => resizeSelectedAoe(0, AOE_METERS_PER_CELL));
aoeNudgeWidthDown.addEventListener('click', () => resizeSelectedAoe(0, -AOE_METERS_PER_CELL));

// Il pannello è fisso in basso a destra per default, ma la cella
// "trascina" permette di spostarlo dove serve (pollice diverso, mano
// diversa, schermo diverso) -- la posizione scelta si ricorda da questo
// dispositivo (localStorage), non è condivisa con altri DM/dispositivi,
// non essendo uno stato di gioco.
const AOE_NUDGE_POS_KEY = 'aoeNudgeOverlayPos';
let aoeNudgeDrag = null;

function clampAoeNudgeOverlayPos(left, top) {
  const w = aoeNudgeOverlay.offsetWidth || 160;
  const h = aoeNudgeOverlay.offsetHeight || 210;
  const maxLeft = Math.max(0, window.innerWidth - w);
  const maxTop = Math.max(0, window.innerHeight - h);
  return [Math.min(maxLeft, Math.max(0, left)), Math.min(maxTop, Math.max(0, top))];
}

function placeAoeNudgeOverlay(left, top) {
  const [x, y] = clampAoeNudgeOverlayPos(left, top);
  aoeNudgeOverlay.style.left = `${x}px`;
  aoeNudgeOverlay.style.top = `${y}px`;
  aoeNudgeOverlay.style.right = 'auto';
  aoeNudgeOverlay.style.bottom = 'auto';
}

// Posizione salvata da una sessione precedente: si applica non appena il
// pad diventa visibile per la prima volta, altrimenti resta nell'angolo di
// default (right/bottom via CSS, mai toccato finché l'utente non trascina).
let aoeNudgeStoredPos = null;
try {
  const raw = localStorage.getItem(AOE_NUDGE_POS_KEY);
  if (raw) aoeNudgeStoredPos = JSON.parse(raw);
} catch (err) { /* localStorage non disponibile o valore corrotto: resta sul default */ }

aoeNudgeDragHandle.addEventListener('pointerdown', (e) => {
  const rect = aoeNudgeOverlay.getBoundingClientRect();
  aoeNudgeDrag = { pointerId: e.pointerId, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top };
  aoeNudgeDragHandle.setPointerCapture(e.pointerId);
  // Da qui in poi la posizione è sempre esplicita (left/top): anche un
  // semplice tap senza trascinamento vero e proprio fissa il pad dov'è
  // ora, invece di lasciarlo "agganciato" all'angolo in modo invisibile.
  placeAoeNudgeOverlay(rect.left, rect.top);
});

aoeNudgeDragHandle.addEventListener('pointermove', (e) => {
  if (!aoeNudgeDrag || e.pointerId !== aoeNudgeDrag.pointerId) return;
  placeAoeNudgeOverlay(e.clientX - aoeNudgeDrag.offsetX, e.clientY - aoeNudgeDrag.offsetY);
});

function endAoeNudgeDrag(e) {
  if (!aoeNudgeDrag || e.pointerId !== aoeNudgeDrag.pointerId) return;
  aoeNudgeDrag = null;
  try {
    localStorage.setItem(AOE_NUDGE_POS_KEY, JSON.stringify({ left: aoeNudgeOverlay.offsetLeft, top: aoeNudgeOverlay.offsetTop }));
  } catch (err) { /* localStorage non disponibile: la posizione vale solo per questa sessione */ }
}

aoeNudgeDragHandle.addEventListener('pointerup', endAoeNudgeDrag);
aoeNudgeDragHandle.addEventListener('pointercancel', endAoeNudgeDrag);

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
// Eco del proprio ping (il server rilancia a tutti i connessi, incluso il
// mittente): nessun filtro per locationId qui, il broadcast stesso non lo
// include -- sicuro perché pingModeToggle è disabilitato ogni volta che si
// sta solo previewando un'altra location (vedi render()), quindi un ping
// può partire solo quando l'anteprima coincide già con la location attiva.
socket.on('ping:show', ({ x, y, strokeId }) => {
  if (typeof x !== 'number' || typeof y !== 'number') return;
  pingPoints.push({ x, y, t: performance.now(), strokeId });
  kickShaderLoop();
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

// Gesto momentaneo del DM (modalità "ping", tap o trascinamento): stessa
// logica di accumulo/sfumatura di display.js (vedi lì il perché), qui per
// mostrare al DM dove sta puntando mentre lo fa -- prima non c'era alcun
// riscontro visivo sulla propria anteprima, solo i giocatori vedevano
// qualcosa.
const PING_LIFESPAN_SEC = 1.2;
let pingPoints = [];
let lastPingPreviewLocationId = null;

function clearPing() {
  if (!pingPoints.length) return;
  pingPoints = [];
  pingLayer.render([], PING_LIFESPAN_SEC, localZoom.scale);
}

function pruneAndRenderPing() {
  if (!pingPoints.length) return false;
  const now = performance.now();
  pingPoints = pingPoints.filter((pt) => (now - pt.t) / 1000 < PING_LIFESPAN_SEC);
  // Raggruppati per strokeId (vedi newPingStrokeId): due tap ravvicinati
  // restano due "sonar" indipendenti invece di diventare un trascinamento
  // che li collega -- ognuno nel proprio gruppo, mai mescolati.
  const groups = groupPingPointsByStroke(
    pingPoints.map((pt) => ({ x: pt.x, y: pt.y, age: (now - pt.t) / 1000, strokeId: pt.strokeId }))
  );
  // localZoom.scale: stesso transform CSS che avvolge il canvas del ping
  // (vedi PingLayer.render) -- senza compensarlo, zoomare in modalità
  // "Zoom locale" cambierebbe anche la taglia del ping, non solo quella
  // di griglia/contorno AOE già compensate.
  pingLayer.render(groups, PING_LIFESPAN_SEC, localZoom.scale);
  return pingPoints.length > 0;
}
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

  // Stesso guard di display.js: un ping in corso punta a una mappa precisa,
  // se cambia la location in anteprima o compare un'immagine al posto
  // della mappa non ha più senso lasciarlo a schermo (qui più che altro
  // per coerenza visiva col DM stesso: i giocatori vedono comunque solo i
  // ping sulla location davvero attiva, mai in anteprima).
  const pingPreviewLocationId = previewLocation ? previewLocation.id : null;
  if (showingImage || pingPreviewLocationId !== lastPingPreviewLocationId) clearPing();
  lastPingPreviewLocationId = pingPreviewLocationId;

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
  renderAoePanel();

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

  renderPanSection();
  renderFogSection();
  renderPingSection();
  renderZoomSection();

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
  renderMapCompassMarker(previewLocation);
  kickShaderLoop();
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

const AOE_CELL_FILL_OPACITY = 0.35;

// Disegna, per ogni area piazzata, prima le celle colpite (sotto) poi il
// contorno della forma (sopra) -- altrimenti il contorno sparirebbe sotto
// il riempimento delle celle. Le celle usano il colore base dell'area in
// trasparenza (fill-opacity); il contorno usa la stessa palette ma nella
// versione scura, solo come linea (fill:none) -- i due restano
// distinguibili senza bisogno di animarli.
// Stessi 4 argomenti ricordati come currentGrid/NW/NH per la griglia: serve
// per poterla ridisegnare da applyLocalZoom() con la compensazione zoom
// aggiornata ad ogni frame di zoom/pinch, non solo al render successivo
// dello stato.
let currentAoes = [];
let currentAoeGrid = null;
let currentAoeNW = 0;
let currentAoeNH = 0;

function renderAoeOverlays(aoes, grid, naturalW, naturalH) {
  currentAoes = aoes;
  currentAoeGrid = grid;
  currentAoeNW = naturalW;
  currentAoeNH = naturalH;
  mapAoeSvg.innerHTML = '';
  if (!naturalW || !naturalH) return;
  // Stesso motivo della griglia (vedi renderGrid): vector-effect
  // "non-scaling-stroke" protegge il tratto solo dallo scaling interno
  // dell'SVG (viewBox), non dal transform CSS di #map-local-zoom-wrap --
  // senza questa compensazione, zoomare con la modalità "Zoom locale"
  // (scale 1→5) farebbe apparire il contorno (e il mirino "+") sempre più
  // spesso. Dividere per lo scale qui annulla esattamente quell'effetto.
  const zoomComp = Math.max(localZoom.scale, 0.01);
  aoes.forEach((aoe) => {
    const color = aoeColorHex(aoe.color);
    const darkColor = aoeColorDarkHex(aoe.color);
    // L'evidenziazione delle celle colpite resta SEMPRE visibile, anche
    // ad area "lanciata" (aoe.cast) -- richiesta esplicita dell'utente:
    // lo shader (canvas separato, vedi stepShaderLayer) è il bagliore
    // drammatico sopra, ma le celle vanno lette comunque con precisione
    // meccanica. Prima il fill spariva proprio a shader attivo, il
    // momento in cui invece conta di più sapere quali celle sono colpite.
    aoeAffectedCells(aoe, grid, naturalW, naturalH).forEach(({ col, row }) => {
      const rect = cellRectPercent(col, row, grid, naturalW, naturalH);
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      el.setAttribute('x', rect.leftPct);
      el.setAttribute('y', rect.topPct);
      el.setAttribute('width', rect.widthPct);
      el.setAttribute('height', rect.heightPct);
      el.setAttribute('class', 'aoe-cell-highlight');
      el.setAttribute('fill', color);
      el.setAttribute('fill-opacity', AOE_CELL_FILL_OPACITY);
      el.setAttribute('stroke', 'none');
      mapAoeSvg.appendChild(el);
    });

    // shapeVisible:false O area "lanciata" nascondono solo l'aspetto del
    // contorno (stroke "none") -- il poligono resta nel DOM con la sua
    // geometria e i suoi pointer-events invariati, altrimenti trascinare
    // l'area diventerebbe impossibile una volta nascosta. Il contorno
    // sparisce a shader attivo su richiesta esplicita dell'utente: con lo
    // shader sopra e le celle evidenziate sotto, il triangolo/rettangolo
    // netto risultava ridondante.
    const points = aoeOutlinePoints(aoe, grid, naturalW, naturalH);
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', points.map(([x, y]) => `${x},${y}`).join(' '));
    poly.setAttribute('class', `aoe-shape-overlay ${aoe.id === selectedAoeId ? 'selected' : ''}`);
    const outlineVisible = aoe.shapeVisible !== false && !aoe.cast;
    poly.setAttribute('fill', 'none');
    poly.setAttribute('stroke', outlineVisible ? darkColor : 'none');
    // Sovrascrive lo stroke-width da CSS (2, o 3 se .selected): qui serve
    // un valore calcolato a runtime, non ricavabile da una regola statica.
    poly.style.strokeWidth = (aoe.id === selectedAoeId ? 3 : 2) / zoomComp;
    poly.dataset.id = aoe.id;
    mapAoeSvg.appendChild(poly);

    // Marker "+" sul punto d'origine (Sfera e Cubo, vedi
    // appendAoeOriginMarker): anche questo su /control, visibile pure su
    // /display (chiamata gemella in display.js, senza compensazione zoom
    // perché lì non esiste zoom locale). Segue la stessa visibilità del
    // contorno.
    appendAoeOriginMarker(mapAoeSvg, aoe, outlineVisible ? darkColor : 'none', 1.5 / zoomComp, naturalW, naturalH);
  });
}

// Fisso in basso a destra del viewport (non più ancorato alla mappa): niente
// più calcoli di posizione/clamping, la CSS (position:fixed) basta da sola.
// I 4 tasti direzione restano disattivati senza griglia attiva (non c'è
// nulla a cui agganciare lo spostamento), ma rotazione/colore/taglia
// restano utilizzabili comunque -- per questo il pad non si nasconde del
// tutto in quel caso, solo quelle 4 frecce.
let aoeNudgePositionApplied = false;

function renderAoeNudgeOverlay(editingAoe, grid) {
  aoeNudgeOverlay.hidden = !editingAoe || currentMode !== 'aoe';
  if (!editingAoe) return;

  // La posizione salvata (se c'è) si applica una sola volta, al primo
  // render in cui il pad diventa visibile in questa pagina -- non ad ogni
  // render, altrimenti un trascinamento in corso verrebbe riscritto sopra
  // dal valore salvato prima ancora di essere stato aggiornato.
  if (!aoeNudgePositionApplied) {
    aoeNudgePositionApplied = true;
    if (aoeNudgeStoredPos) placeAoeNudgeOverlay(aoeNudgeStoredPos.left, aoeNudgeStoredPos.top);
  }

  const gridEnabled = Boolean(grid && grid.enabled);
  [aoeNudgeUp, aoeNudgeDown, aoeNudgeLeft, aoeNudgeRight].forEach((btn) => {
    btn.disabled = !gridEnabled;
  });

  const rotatable = editingAoe.shape === 'cone' || editingAoe.shape === 'line';
  aoeRotateCcw.disabled = !rotatable;
  aoeRotateCw.disabled = !rotatable;

  aoeNudgeWidthUp.disabled = editingAoe.shape !== 'line';
  aoeNudgeWidthDown.disabled = editingAoe.shape !== 'line';

  aoeNudgeColor.style.background = aoeColorHex(editingAoe.color);
}

function aoeShapeLabel(shape) {
  return { cone: 'Cono', cube: 'Cubo', sphere: 'Sfera', line: 'Linea' }[shape] || shape;
}

// Lo stepper principale regola grandezze diverse secondo la forma (lunghezza
// per Cono/Linea, lato per Cubo, raggio per Sfera) -- dirlo esplicitamente
// evita che "3 m" sulla Sfera venga letto come diametro (sarebbe la metà di
// quello che poi si vede disegnato, visto che il raggio è sempre sizeM).
function aoeSizeDimensionLabel(shape) {
  return { cone: 'Lunghezza', cube: 'Lato', sphere: 'Raggio', line: 'Lunghezza' }[shape] || 'Taglia';
}

// La rotazione vive nel pad flottante (vedi renderAoeNudgeOverlay); qui
// resta solo l'eliminazione, con lo stesso pattern arma-poi-conferma di
// armedRemoveAoeId -- ogni chip è sempre della stessa larghezza, la lista
// non si muove più sotto il dito a ogni cambio di selezione.
function renderAoeChipList(aoes) {
  aoeChipList.innerHTML = aoes
    .map((aoe) => {
      const sizeText = aoe.sizeM.toLocaleString('it-IT', { minimumFractionDigits: 1 });
      const selected = aoe.id === selectedAoeId;
      const armed = armedRemoveAoeId === aoe.id;
      return `
        <div class="aoe-chip ${selected ? 'selected' : ''}" data-id="${aoe.id}">
          <div class="aoe-chip-pill">
            <span class="aoe-chip-label">${escapeHtml(aoeShapeLabel(aoe.shape))} ${sizeText}m</span>
            <button class="aoe-chip-cast ${aoe.cast ? 'active' : ''}" title="${aoe.cast ? 'Interrompi incantesimo' : 'Lancia incantesimo'}">
              <svg class="icon"><use href="#i-bolt"></use></svg>
            </button>
            <button class="aoe-chip-delete ${armed ? 'confirm' : ''}" title="${armed ? 'Tocca di nuovo per confermare' : 'Rimuovi'}">✕</button>
          </div>
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
  // La griglia sulla PROPRIA anteprima del DM usa opacità/visibilità locali
  // (dmGridOpacity/dmGridVisible), non quelle condivise coi giocatori: lo
  // stesso dato grid.enabled/opacity che arriva dal server resta intatto per
  // renderGridSvg su display.js.
  renderGridSvg(
    mapGridSvg,
    {
      ...grid,
      lineWidth: (grid.lineWidth || 0.3) / Math.max(localZoom.scale, 0.01),
      enabled: grid.enabled && dmGridVisible,
      opacity: dmGridOpacity
    },
    naturalW,
    naturalH
  );
}

// Visibilità del box "Controlli" (pad di movimento + opacità griglia
// DM/giocatori + toggle griglia solo-DM): appare SOLO in modalità pan,
// sparisce nelle altre modalità e quando si sta mostrando un'immagine al
// posto della mappa. Richiamata sia da render() (su ogni stato dal server)
// sia da setMode() (il cambio di modalità è puramente locale, non passa da
// un round-trip col server).
function renderPanSection() {
  const previewLocation = getPreviewLocation();
  const showingImage = Boolean(state && state.activeImageId);
  const isPreviewing = Boolean(state) && previewLocationId !== state.activeLocationId;
  const hidePanZoomForImage = showingImage && !isPreviewing;
  const showPanSection = currentMode === 'pan' && !hidePanZoomForImage;
  panZoomSection.style.display = showPanSection ? 'block' : 'none';

  const gridEnabled = showPanSection && Boolean(previewLocation && previewLocation.map.grid && previewLocation.map.grid.enabled);
  gridOpacityPlayersRow.hidden = !gridEnabled;
  gridOpacityDmRow.hidden = !gridEnabled;
  gridDmVisibleRow.hidden = !gridEnabled;
  if (gridEnabled) {
    gridOpacityPlayersLevel.textContent = `${Math.round((previewLocation.map.grid.opacity === undefined ? 1 : previewLocation.map.grid.opacity) * 100)}%`;
    gridOpacityDmLevel.textContent = `${Math.round(dmGridOpacity * 100)}%`;
    gridDmVisibleToggle.classList.toggle('active', dmGridVisible);
    gridDmVisibleIcon.setAttribute('href', dmGridVisible ? '#i-eye' : '#i-eye-off');
  }
}

// Visibilità del box "Fog of war" (opacità fog locale al DM + percentuale
// zone rivelate sulla location corrente): appare SOLO in modalità fog,
// stesso motivo/pattern di renderPanSection(). La percentuale si aggiorna
// da qualunque punto arrivi un reveal/hide (tab "Fog", bulk nascondi/rivela
// tutto), perché legge sempre `previewLocation.map.polygons` fresco.
function renderFogSection() {
  const previewLocation = getPreviewLocation();
  const showFogSection = currentMode === 'fog';
  fogSection.style.display = showFogSection ? 'block' : 'none';

  const polygons = (previewLocation && previewLocation.map.polygons) || [];
  const total = polygons.length;
  const revealed = polygons.filter((p) => p.revealed).length;
  fogProgressRow.hidden = !showFogSection || total === 0;
  if (total > 0) {
    fogProgressFraction.textContent = `${revealed}/${total}`;
    fogProgressFill.style.transform = `scaleX(${revealed / total})`;
  }
}

// Visibilità del box "Rosa dei venti" (toggle visibile/nascosta + pad di
// nudge/rotazione): appare SOLO in modalità ping, stesso motivo/pattern di
// renderPanSection()/renderFogSection(). A differenza del pulsante "pan"
// (vedi bug risolto sopra), pingModeToggle si disabilita/forza l'uscita per
// condizioni transitorie e recuperabili (anteprima di un'altra location,
// immagine mostrata, nessuna location attiva) non per un dato che potrebbe
// non arrivare mai: gating puro su currentMode è quindi sicuro, non rischia
// di restare bloccato per sempre.
function renderPingSection() {
  const previewLocation = getPreviewLocation();
  const showPingSection = currentMode === 'ping';
  compassSection.style.display = showPingSection ? 'block' : 'none';
  compassToggle.classList.toggle('active', Boolean(previewLocation && previewLocation.map.compass && previewLocation.map.compass.visible));
}

// Visibilità del box "Zoom locale" (pulsante "Zooma sull'area dei PG"):
// appare SOLO in modalità zoom, stesso pattern di renderPanSection()/
// renderFogSection()/renderPingSection(). Lo zoom non è più automatico
// all'ingresso in modalità (vedi setMode): qui si offre solo il comando per
// farlo scattare a richiesta.
function renderZoomSection() {
  zoomSection.style.display = currentMode === 'zoom' ? 'block' : 'none';
}

// Il transform dello zoom locale restaurato da localStorage va applicato
// una sola volta, non appena mapPreview ha dimensioni reali (clientWidth/
// Height a 0 prima del primo layout renderebbero inutile il clamp) --
// richiamata dalla fine di entrambi i rami di renderMapPreview, che è
// l'unico punto chiamato sia al caricamento iniziale sia ad ogni resize/
// cambio location successivo (dove non deve più fare nulla, da qui il
// guard).
let localZoomRestored = false;
function applyRestoredLocalZoomOnce() {
  if (localZoomRestored) return;
  localZoomRestored = true;
  clampLocalZoomPan();
  applyLocalZoom();
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
      shaderLayer.render((location && location.map.shaders) || [], location && location.map.grid, mediaW(activeMapEl), mediaH(activeMapEl));
      updateViewportRect(location);
      applyRestoredLocalZoomOnce();
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
    shaderLayer.render((location && location.map.shaders) || [], location && location.map.grid, mediaW(activeMapEl), mediaH(activeMapEl));
    updateViewportRect(location);
    applyRestoredLocalZoomOnce();
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
//
// Un tap fermo e un trascinamento sono ormai lo stesso gesto: pointerdown
// emette subito il primo punto, pointermove ne emette altri mentre ci si
// sposta (sotto una soglia di distanza, per non floodare il socket), e un
// tap senza movimento resta semplicemente una scia di un solo punto --
// esattamente il comportamento di prima, "gratis". Niente più soglia che
// annulla il ping sopra 8px: quella soglia è ora il trigger della scia, non
// un modo per scartarla.
function pingLocalCoords(e) {
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

const PING_MIN_POINT_DIST_PCT = 1.5;
let pingDrag = null; // { id, strokeId, lastX, lastY } in spazio locale (%, post-rotazione)

// Un id per gesto, non per punto: lo stesso per tutti i punti emessi da
// un singolo pointerdown→pointerup/cancel (tap o trascinamento), diverso
// da un gesto al successivo. Il server lo rilancia senza toccarlo (vedi
// server/index.js); chi riceve raggruppa i punti per strokeId prima di
// passarli allo shader (vedi groupPingPointsByStroke in shader-effects.js)
// -- senza, due tap ravvicinati finivano nello stesso elenco piatto e
// venivano disegnati come un solo trascinamento che li collega.
function newPingStrokeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

mapFitBox.addEventListener('pointerdown', (e) => {
  if (currentMode !== 'ping' || pingModeToggle.disabled) return;
  const coords = pingLocalCoords(e);
  if (!coords) return;
  const [x, y] = coords;
  const strokeId = newPingStrokeId();
  pingDrag = { id: e.pointerId, strokeId, lastX: x, lastY: y };
  mapFitBox.setPointerCapture(e.pointerId);
  socket.emit('ping:show', { locationId: previewLocationId, x, y, strokeId });
});

mapFitBox.addEventListener('pointermove', (e) => {
  if (currentMode !== 'ping' || !pingDrag || e.pointerId !== pingDrag.id) return;
  const coords = pingLocalCoords(e);
  if (!coords) return;
  const [x, y] = coords;
  if (Math.hypot(x - pingDrag.lastX, y - pingDrag.lastY) < PING_MIN_POINT_DIST_PCT) return;
  pingDrag.lastX = x;
  pingDrag.lastY = y;
  socket.emit('ping:show', { locationId: previewLocationId, x, y, strokeId: pingDrag.strokeId });
});

function endPingDrag(e) {
  if (!pingDrag || e.pointerId !== pingDrag.id) return;
  pingDrag = null;
}
mapFitBox.addEventListener('pointerup', endPingDrag);
mapFitBox.addEventListener('pointercancel', endPingDrag);

// AoE: un tap su un'area vuota della mappa piazza una nuova area (forma/
// taglia correnti); un trascinamento che parte da un'area già disegnata la
// sposta invece di piazzarne una nuova. Stessa soglia di 8px del ping per
// distinguere un tap da un trascinamento accidentale.
let aoePlaceStart = null;
// targetX/targetY inseguono la posizione NON agganciata (dove il dito sta
// davvero trascinando): se si ripartisse ogni volta dall'ultima posizione
// già agganciata, un movimento più piccolo di un passo di griglia verrebbe
// arrotondato via a ogni evento e la forma non si muoverebbe affatto finché
// lo spostamento accumulato non supera un passo intero.
let aoeDrag = null;

mapFitBox.addEventListener('pointerdown', (e) => {
  if (currentMode !== 'aoe' || aoeModeToggle.disabled) return;
  const overlay = e.target.closest('.aoe-shape-overlay');
  if (overlay) {
    const previewLocation = getPreviewLocation();
    const aoe = previewLocation && previewLocation.map.aoes.find((a) => a.id === overlay.dataset.id);
    const point = localPointFromEvent(e);
    if (!aoe || !point) return;
    aoeDrag = {
      id: overlay.dataset.id,
      pointerId: e.pointerId,
      lastBaseX: point[0],
      lastBaseY: point[1],
      targetX: aoe.x,
      targetY: aoe.y
    };
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

// Aggancia alla griglia (vedi snapAoeOrigin in media.js) quando la mappa ha
// una griglia attiva; senza griglia il posizionamento resta libero come oggi.
function snapAoePlacement(shape, sizeM, widthM, rotation, xPct, yPct) {
  const previewLocation = getPreviewLocation();
  const grid = previewLocation && previewLocation.map.grid;
  const nw = mediaW(activeMapEl);
  const nh = mediaH(activeMapEl);
  return snapAoeOrigin(shape, sizeM, widthM, rotation, grid, xPct, yPct, nw, nh);
}

mapFitBox.addEventListener('pointermove', (e) => {
  if (currentMode !== 'aoe' || aoeModeToggle.disabled) {
    aoeDrag = null;
    return;
  }
  if (!aoeDrag || e.pointerId !== aoeDrag.pointerId) return;
  const point = localPointFromEvent(e);
  if (!point) return;
  const previewLocation = getPreviewLocation();
  const aoe = previewLocation && previewLocation.map.aoes.find((a) => a.id === aoeDrag.id);
  if (!aoe) return;
  // Delta dall'ultima posizione del puntatore, non posizione assoluta: così
  // la forma segue il dito da dove l'hai afferrata invece di saltare a
  // ricentrarsi sotto il cursore a ogni evento.
  aoeDrag.targetX += point[0] - aoeDrag.lastBaseX;
  aoeDrag.targetY += point[1] - aoeDrag.lastBaseY;
  aoeDrag.lastBaseX = point[0];
  aoeDrag.lastBaseY = point[1];
  const [x, y] = snapAoePlacement(aoe.shape, aoe.sizeM, aoe.widthM, aoe.rotation, aoeDrag.targetX, aoeDrag.targetY);
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
  const widthM = aoeSelectedShape === 'line' ? aoeSelectedWidth : undefined;
  const [x, y] = snapAoePlacement(aoeSelectedShape, aoeSelectedSize, widthM, 0, point[0], point[1]);
  socket.emit('aoe:place', {
    locationId: previewLocationId,
    shape: aoeSelectedShape,
    color: aoeSelectedColor,
    shaderOverride: aoeSelectedShaderOverride,
    sizeM: aoeSelectedSize,
    widthM,
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
  const castBtn = e.target.closest('.aoe-chip-cast');
  if (castBtn) {
    const chip = castBtn.closest('.aoe-chip');
    const aoeId = chip.dataset.id;
    const previewLocation = getPreviewLocation();
    const aoe = previewLocation && previewLocation.map.aoes.find((a) => a.id === aoeId);
    if (!aoe) return;
    socket.emit('aoe:setCast', { locationId: previewLocationId, aoeId, cast: !aoe.cast });
    return;
  }
  const deleteBtn = e.target.closest('.aoe-chip-delete');
  if (deleteBtn) {
    const chip = deleteBtn.closest('.aoe-chip');
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

function stepGridOpacityPlayers(delta) {
  const location = getPreviewLocation();
  if (!location || !location.map.grid) return;
  const current = location.map.grid.opacity === undefined ? 1 : location.map.grid.opacity;
  const next = Math.min(1, Math.max(0, Math.round((current + delta) * 10) / 10));
  socket.emit('grid:update', { locationId: previewLocationId, opacity: next });
}
gridOpacityPlayersOutBtn.addEventListener('click', () => stepGridOpacityPlayers(-GRID_OPACITY_STEP));
gridOpacityPlayersInBtn.addEventListener('click', () => stepGridOpacityPlayers(GRID_OPACITY_STEP));

function stepGridOpacityDm(delta) {
  dmGridOpacity = Math.min(1, Math.max(0, Math.round((dmGridOpacity + delta) * 10) / 10));
  try { localStorage.setItem(DM_GRID_OPACITY_KEY, String(dmGridOpacity)); } catch (err) { /* localStorage non disponibile: resta solo per questa sessione */ }
  if (currentGrid) renderGrid(currentGrid, currentGridNW, currentGridNH);
  renderPanSection();
}
gridOpacityDmOutBtn.addEventListener('click', () => stepGridOpacityDm(-GRID_OPACITY_STEP));
gridOpacityDmInBtn.addEventListener('click', () => stepGridOpacityDm(GRID_OPACITY_STEP));

gridDmVisibleToggle.addEventListener('click', () => {
  dmGridVisible = !dmGridVisible;
  try { localStorage.setItem(DM_GRID_VISIBLE_KEY, String(dmGridVisible)); } catch (err) { /* localStorage non disponibile: resta solo per questa sessione */ }
  if (currentGrid) renderGrid(currentGrid, currentGridNW, currentGridNH);
  renderPanSection();
});

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

// Il rettangolo (in pixel schermo della NOSTRA anteprima, spazio non
// zoomato/pannato localmente) mostra quale porzione della mappa la TV sta
// effettivamente inquadrando in questo momento. Procede in tre passi:
// 1) dai quattro angoli dello schermo della TV si risale, con screenToLocal,
//    al rettangolo corrispondente nello spazio locale (pre-rotazione) del
//    wrap della TV — lo stesso spazio in cui vive tvFit — e lo si riesprime
//    come frazione di tvFit;
// 2) la stessa frazione si applica al riquadro mappa della NOSTRA anteprima
//    (currentImageRect, anch'esso pre-rotazione, calcolato da
//    renderMapPreview con la stessa `rotation`), ottenendo il rettangolo
//    nello spazio locale della nostra anteprima;
// 3) si converte dal locale allo schermo della nostra anteprima con
//    localToScreen (S=1, offset=0: qui si lavora sempre nello spazio NON
//    zoomato -- chi usa il risultato per applicare uno zoom locale lo fa
//    esso stesso, chi lo usa per #viewport-rect lo mostra staccato dal wrap
//    zoomato, vedi updateViewportRect).
// Usata sia per disegnare il riquadro tratteggiato (updateViewportRect) sia
// per centrare lo zoom locale su questa stessa area quando si entra in
// modalità zoom (vedi zoomLocalToViewport).
function computeViewportScreenRect(location) {
  if (!location || !state.displayViewport || !mediaW(activeMapEl) || !currentImageRect) return null;

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

  return {
    left: Math.min(sx0, sx1),
    top: Math.min(sy0, sy1),
    width: Math.abs(sx1 - sx0),
    height: Math.abs(sy1 - sy0)
  };
}

// Il riquadro giallo (e il trascinamento diretto sulla mappa, vedi
// pointermove più sotto) hanno bisogno di `state.displayViewport`, noto
// solo dopo che un /display si è connesso almeno una volta. Quando manca,
// qui si nasconde solo il riquadro -- NON si disabilita più il pulsante
// "pan" né si forza l'uscita dalla modalità: il resto del box "Controlli"
// (pad, opacità griglia, toggle griglia-DM) non dipende da displayViewport
// e deve restare raggiungibile anche senza un display connesso (prima del
// box mode-gated introdotto per il punto 1, questo non si notava perché il
// box era sempre visibile indipendentemente dal pulsante).
// Ha senso solo in modalità pan (è il riferimento per il trascinamento):
// nelle altre modalità -- mai in zoom, dove confonderebbe con l'inquadratura
// locale del DM -- resta nascosto a prescindere dai dati disponibili.
function updateViewportRect(location) {
  const rect = currentMode === 'pan' ? computeViewportScreenRect(location) : null;
  if (!rect) {
    viewportRect.hidden = true;
    return;
  }

  viewportRect.hidden = false;
  viewportRect.style.left = `${rect.left}px`;
  viewportRect.style.top = `${rect.top}px`;
  viewportRect.style.width = `${rect.width}px`;
  viewportRect.style.height = `${rect.height}px`;
}

// Bussola sulla PROPRIA anteprima del DM: in ogni modalità tranne pan
// rispecchia esattamente la posizione vista dai giocatori su /display
// (stessa coppia x%/y% di `compass`, applicata allo stesso tipo di
// contenitore "a schermo intero" che usa display.js per il proprio
// #compass — non lo spazio locale della mappa, quindi resta stabile anche
// con zoom locale del DM). In pan mode si fissa invece in basso a destra,
// fuori dai piedi del riquadro giallo che lì è il riferimento principale:
// ruota comunque con compass.rotation, solo la posizione è fissa.
function renderMapCompassMarker(location) {
  const compass = location && location.map.compass;
  const showingImage = Boolean(state && state.activeImageId);
  const visible = Boolean(compass && compass.visible) && !showingImage;
  mapCompassMarker.hidden = !visible;
  if (!visible) return;

  const pinned = currentMode === 'pan';
  mapCompassMarker.classList.toggle('pinned', pinned);
  if (pinned) {
    mapCompassMarker.style.left = '';
    mapCompassMarker.style.top = '';
    mapCompassMarker.style.transform = `rotate(${compass.rotation}deg)`;
  } else {
    mapCompassMarker.style.left = `${compass.x}%`;
    mapCompassMarker.style.top = `${compass.y}%`;
    mapCompassMarker.style.transform = `translate(-50%, -50%) rotate(${compass.rotation}deg)`;
  }
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
  // Solo quando si ENTRA in pan da un'altra modalità (non ad ogni
  // render/drag successivo): il riquadro giallo ha senso solo sulla mappa
  // intera, quindi uno zoom locale lasciato acceso da prima va azzerato
  // (lo zoom locale non è mai persistito su reset programmatici come
  // questo, solo sulle modifiche esplicite dell'utente -- vedi
  // saveLocalZoomState).
  const enteringPan = mode === 'pan' && currentMode !== 'pan';
  currentMode = currentMode === mode ? null : mode;
  Object.entries(MODE_BUTTONS).forEach(([m, btn]) => btn.classList.toggle('active', currentMode === m));
  mapPreview.classList.toggle('mode-pan', currentMode === 'pan');
  mapPreview.classList.toggle('mode-fog', currentMode === 'fog');
  mapPreview.classList.toggle('mode-ping', currentMode === 'ping');
  mapPreview.classList.toggle('mode-zoom', currentMode === 'zoom');
  mapPreview.classList.toggle('mode-aoe', currentMode === 'aoe');
  if (enteringPan && currentMode === 'pan') resetLocalZoom();
  renderAoePanel();
  renderPanSection();
  renderFogSection();
  renderPingSection();
  renderZoomSection();
  updateViewportRect(getPreviewLocation());
  renderMapCompassMarker(getPreviewLocation());
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

// Stato e posizione dello zoom locale sopravvivono a un reload (stesso
// pattern/motivo di AOE_NUDGE_POS_KEY: preferenza del dispositivo, non dato
// di gioco). Si salva solo quando l'utente lo cambia esplicitamente
// (trascinamento, pinch, rotellina, pulsante "Zooma sull'area dei PG"):
// un reset programmatico (cambio location, ingresso in pan) NON tocca lo
// storage, così lo zoom scelto resta lì ad attenderlo al prossimo ingresso
// in modalità zoom.
const ZOOM_LOCAL_STATE_KEY = 'zoomLocalState';

function loadLocalZoomState() {
  try {
    const raw = localStorage.getItem(ZOOM_LOCAL_STATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Number.isFinite(parsed.scale) && Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
        return { scale: Math.min(ZOOM_LOCAL_MAX, Math.max(ZOOM_LOCAL_MIN, parsed.scale)), x: parsed.x, y: parsed.y };
      }
    }
  } catch (err) { /* localStorage non disponibile o valore corrotto: resta sul default */ }
  return { scale: 1, x: 0, y: 0 };
}

function saveLocalZoomState() {
  try {
    localStorage.setItem(ZOOM_LOCAL_STATE_KEY, JSON.stringify(localZoom));
  } catch (err) { /* localStorage non disponibile: lo zoom vale solo per questa sessione */ }
}

let localZoom = loadLocalZoomState();
const localZoomPointers = new Map();
let localZoomPinchStartDist = null;
let localZoomPinchStartScale = 1;
let localZoomDragLast = null;

function applyLocalZoom() {
  mapLocalZoomWrap.style.transform =
    localZoom.scale === 1 && !localZoom.x && !localZoom.y
      ? ''
      : `translate(${localZoom.x}px, ${localZoom.y}px) scale(${localZoom.scale})`;
  // Il transform sopra scala anche lo spessore della griglia e del
  // contorno AOE: ridisegnarli con lo spessore ricompensato mantiene lo
  // spessore scelto costante mentre si zooma, non solo al render successivo
  // dello stato.
  if (currentGrid) renderGrid(currentGrid, currentGridNW, currentGridNH);
  if (currentAoeNW) renderAoeOverlays(currentAoes, currentAoeGrid, currentAoeNW, currentAoeNH);
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

// Centra lo zoom locale esattamente sull'area che la TV sta mostrando ora
// (stesso rettangolo di updateViewportRect, prima che lo zoom lo sposti) --
// non più automatica all'ingresso in modalità zoom (lo era in una sessione
// precedente: vedi il box "Zoom locale"/renderZoomSection), solo a comando
// dal pulsante "Zooma sull'area dei PG", ripetibile a piacere. "Contain",
// non "cover": l'intera area vista dai giocatori deve restare visibile,
// anche a costo di un bordo vuoto su un lato se le proporzioni non
// combaciano esattamente -- coprire tutto il riquadro locale potrebbe
// tagliarne fuori un pezzo.
function zoomLocalToViewport() {
  const rect = computeViewportScreenRect(getPreviewLocation());
  const viewportW = mapPreview.clientWidth;
  const viewportH = mapPreview.clientHeight;
  if (!rect || !rect.width || !rect.height || !viewportW || !viewportH) return;

  const scale = Math.min(ZOOM_LOCAL_MAX, Math.max(ZOOM_LOCAL_MIN, Math.min(viewportW / rect.width, viewportH / rect.height)));
  const cx = viewportW / 2;
  const cy = viewportH / 2;
  const rectCenterX = rect.left + rect.width / 2;
  const rectCenterY = rect.top + rect.height / 2;
  // Lo scale si applica intorno al centro di mapPreview (transform-origin
  // di default): il centro del riquadro si sposta di conseguenza PRIMA
  // della traslazione, che poi lo riporta esattamente al centro schermo.
  const postScaleX = cx + (rectCenterX - cx) * scale;
  const postScaleY = cy + (rectCenterY - cy) * scale;

  localZoom = { scale, x: cx - postScaleX, y: cy - postScaleY };
  clampLocalZoomPan();
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
    saveLocalZoomState();
  }
}

mapPreview.addEventListener('pointerup', endLocalZoomPointer);
mapPreview.addEventListener('pointercancel', endLocalZoomPointer);

const ZOOM_WHEEL_STEP = 0.1;

// Da mouse non esiste un pinch: la rotellina è l'unico modo per superare
// scale 1 e sbloccare così anche il trascinamento (già gestito sopra, si
// attiva da solo appena scale > 1). { passive: false } è necessario perché
// preventDefault funzioni -- di default i listener 'wheel' sono passive e lo
// ignorerebbero silenziosamente, lasciando scrollare la pagina sotto.
mapPreview.addEventListener('wheel', (e) => {
  if (currentMode !== 'zoom') return;
  e.preventDefault();
  const delta = e.deltaY < 0 ? ZOOM_WHEEL_STEP : -ZOOM_WHEEL_STEP;
  localZoom.scale = Math.min(ZOOM_LOCAL_MAX, Math.max(ZOOM_LOCAL_MIN, Math.round((localZoom.scale + delta) * 10) / 10));
  clampLocalZoomPan();
  applyLocalZoom();
  saveLocalZoomState();
}, { passive: false });

// Pulsante del box "Zoom locale" (sotto la mappa, solo in modalità zoom):
// sostituisce il vecchio centraggio automatico all'ingresso in modalità
// (rimosso da setMode) con un comando esplicito, ripetibile a piacere.
zoomToPlayersBtn.addEventListener('click', () => {
  zoomLocalToViewport();
  saveLocalZoomState();
});

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

// Il rAF loop va fermato quando non c'è nulla da disegnare (nessuna
// decorazione shader sulla location in anteprima, nessun ping in corso):
// su target come il Raspberry Pi 4 un ciclo di clear+composite a 60fps a
// vuoto è spreco puro. Quando torna rilevante (es. il DM piazza una
// decorazione, o arriva un ping), kickShaderLoop() lo riavvia da
// render()/dall'handler di 'ping:show'.
let shaderLoopRunning = false;

function stepShaderLayer() {
  let shaders = [];
  let castAoes = [];
  if (state) {
    const previewLocation = getPreviewLocation();
    if (previewLocation && previewLocation.map.file) {
      shaders = previewLocation.map.shaders || [];
      shaderLayer.render(shaders, previewLocation.map.grid, mediaW(activeMapEl), mediaH(activeMapEl));
      castAoes = (previewLocation.map.aoes || []).filter((a) => a.cast);
      aoeShaderLayer.render(
        castAoes.map((a) => ({ ...a, shaderId: resolveAoeShaderId(a) })),
        previewLocation.map.grid,
        mediaW(activeMapEl),
        mediaH(activeMapEl)
      );
    }
  }
  const pingActive = pruneAndRenderPing();
  if (!shaders.length && !castAoes.length && !pingActive) {
    shaderLoopRunning = false;
    return;
  }
  requestAnimationFrame(stepShaderLayer);
}

function kickShaderLoop() {
  if (shaderLoopRunning) return;
  const previewLocation = state && getPreviewLocation();
  const shaders = (previewLocation && previewLocation.map.shaders) || [];
  const hasCastAoe = ((previewLocation && previewLocation.map.aoes) || []).some((a) => a.cast);
  if (shaders.length > 0 || hasCastAoe || pingPoints.length > 0) {
    shaderLoopRunning = true;
    requestAnimationFrame(stepShaderLayer);
  }
}

shaderLoopRunning = true;
requestAnimationFrame(stepShaderLayer);
