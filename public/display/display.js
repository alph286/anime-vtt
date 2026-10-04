const socket = io();
const mapLayer = document.getElementById('map-layer');
const imageLayer = document.getElementById('image-layer');
const mapMediaWrap = document.getElementById('map-media-wrap');
const mapFitBox = document.getElementById('map-fit-box');
const mapImg = document.getElementById('map-img');
const mapVideo = document.getElementById('map-video');
let activeMapEl = mapImg;
const mapPlaceholder = document.getElementById('map-placeholder');
const mapFogLayer = document.getElementById('map-fog-layer');
const mapGridSvg = document.getElementById('map-grid-svg');
const mapAoeSvg = document.getElementById('map-aoe-svg');
const mapShaderCanvas = document.getElementById('map-shader-canvas');
const shaderLayer = new ShaderLayer(mapShaderCanvas);
const mapPingCanvas = document.getElementById('map-ping-canvas');
const pingLayer = new PingLayer(mapPingCanvas);
const imageFitBox = document.getElementById('image-fit-box');
const shownImageImg = document.getElementById('shown-image-img');
const wifiDot = document.getElementById('wifi-dot');
const compassEl = document.getElementById('compass');
const sceneAudioEl = document.getElementById('scene-audio');

// Scatta solo per la speciale (mai in loop): la principale, essendo sempre
// in loop, non genera mai `ended`. Non decide da solo di tornare alla
// principale -- si limita a riportare il fatto al server.
sceneAudioEl.addEventListener('ended', () => {
  socket.emit('audio:specialEnded', { seq: lastAudioTriggerSeq });
});

// Un file speciale corrotto/mancante non genera mai `ended` (play() fallisce
// silenziosamente in renderAudio) -- senza questo, il server resterebbe
// bloccato su activeAudioTrack:'special' per sempre, perché nessun evento
// natural-end arriverebbe mai a farlo tornare alla principale. Mai per la
// principale (sempre in loop): lì "fermare tutta la funzione" per un file
// rotto sarebbe sbagliato.
sceneAudioEl.addEventListener('error', () => {
  if (sceneAudioEl.loop) return; // la principale non ha un "ritorno" da fare
  socket.emit('audio:specialEnded', { seq: lastAudioTriggerSeq });
});

let socketConnected = false;
let controlConnected = false;
let lastState = null;

let previousShowingImage = false;

// Smoothing for the map's live pan/zoom transform: `displayedView` is what's
// actually painted right now, `targetView` is the latest value from
// location.map.liveView. Each animation frame nudges displayedView a fraction of
// the way toward targetView (frame-time-based, not a fixed per-frame step,
// so it behaves the same regardless of actual frame rate) instead of
// snapping straight to it -- an instant jump on every zoom/pan change is
// disorienting to watch. See
// docs/superpowers/specs/2026-09-04-display-view-smoothing-design.md.
const VIEW_SMOOTH_TIME_CONSTANT_MS = 90;
const VIEW_SMOOTH_SCALE_EPSILON = 0.002;
const VIEW_SMOOTH_OFFSET_EPSILON = 0.3;
let displayedView = null;
let targetView = null;
let viewAnimating = false;
let lastViewAnimFrameTime = 0;
let lastLocationId = null;
let hasRenderedMapOnce = false;

function applyMapTransform(view) {
  mapLayer.style.transform = `translate(${view.offsetX}px, ${view.offsetY}px) scale(${view.scale})`;
}

function stepViewAnimation(now) {
  const dt = now - lastViewAnimFrameTime;
  lastViewAnimFrameTime = now;
  const factor = 1 - Math.exp(-dt / VIEW_SMOOTH_TIME_CONSTANT_MS);

  displayedView.scale += (targetView.scale - displayedView.scale) * factor;
  displayedView.offsetX += (targetView.offsetX - displayedView.offsetX) * factor;
  displayedView.offsetY += (targetView.offsetY - displayedView.offsetY) * factor;

  // A non-finite target (malformed view:pan/view:zoom payload) would never
  // satisfy the epsilon checks below, spinning this loop forever at 60fps.
  // Treat it as settled instead -- same fate an invalid transform string had
  // before this animation existed (the browser silently drops it), rather
  // than a new infinite-loop failure mode.
  const targetIsFinite =
    Number.isFinite(targetView.scale) &&
    Number.isFinite(targetView.offsetX) &&
    Number.isFinite(targetView.offsetY);

  const settled =
    !targetIsFinite ||
    (Math.abs(targetView.scale - displayedView.scale) < VIEW_SMOOTH_SCALE_EPSILON &&
      Math.abs(targetView.offsetX - displayedView.offsetX) < VIEW_SMOOTH_OFFSET_EPSILON &&
      Math.abs(targetView.offsetY - displayedView.offsetY) < VIEW_SMOOTH_OFFSET_EPSILON);

  if (settled) {
    displayedView = { ...targetView };
    applyMapTransform(displayedView);
    viewAnimating = false;
    return;
  }

  applyMapTransform(displayedView);
  requestAnimationFrame(stepViewAnimation);
}

function startViewAnimationIfNeeded() {
  if (viewAnimating) return;
  viewAnimating = true;
  lastViewAnimFrameTime = performance.now();
  requestAnimationFrame(stepViewAnimation);
}

function updateWifi() {
  const ok = socketConnected && controlConnected;
  wifiDot.classList.toggle('ok', ok);
  wifiDot.classList.toggle('bad', !ok);
}

function reportViewport() {
  socket.emit('display:viewport', { width: window.innerWidth, height: window.innerHeight });
}

socket.on('connect', () => {
  socketConnected = true;
  socket.emit('hello', { role: 'display' });
  reportViewport();
  updateWifi();
});

socket.on('disconnect', () => {
  socketConnected = false;
  updateWifi();
});

socket.on('control:status', ({ connected }) => {
  controlConnected = connected;
  updateWifi();
});

// Gesto momentaneo dal DM (/control, modalità "ping", tap o trascinamento):
// ogni tocco/spostamento del DM arriva qui come un punto separato (stesso
// evento sia per un tap fermo che per un trascinamento -- vedi
// control.js), non è mai parte dello state persistito. Ogni punto sfuma da
// solo dopo PING_LIFESPAN_SEC, indipendentemente dal fatto che il DM stia
// ancora disegnando: un tap fermo è semplicemente una scia di un solo
// punto, si comporta "gratis" come il vecchio marker CSS (appare, sfuma,
// sparisce).
const PING_LIFESPAN_SEC = 1.2;
let pingPoints = [];

function clearPing() {
  if (!pingPoints.length) return;
  pingPoints = [];
  pingLayer.render([], PING_LIFESPAN_SEC, displayedView ? displayedView.scale : 1);
}

// Richiamata ad ogni frame dal loop di stepShaderLayer: scarta i punti
// ormai sfumati e ridisegna. Ritorna true finché resta almeno un punto
// vivo, così il chiamante sa se deve continuare il loop.
function pruneAndRenderPing() {
  if (!pingPoints.length) return false;
  const now = performance.now();
  pingPoints = pingPoints.filter((pt) => (now - pt.t) / 1000 < PING_LIFESPAN_SEC);
  // Raggruppati per strokeId (vedi control.js/newPingStrokeId): due tap
  // ravvicinati restano due "sonar" indipendenti invece di diventare un
  // trascinamento che li collega -- ognuno nel proprio gruppo, mai
  // mescolati.
  const groups = groupPingPointsByStroke(
    pingPoints.map((pt) => ({ x: pt.x, y: pt.y, age: (now - pt.t) / 1000, strokeId: pt.strokeId }))
  );
  // displayedView.scale: stesso transform CSS che avvolge #map-layer (e
  // quindi anche il canvas del ping) per il pan/zoom condiviso -- stessa
  // compensazione già fatta per la griglia in renderMap() (lì con la
  // variabile locale `scale`, qui con displayedView.scale perché questo
  // loop gira ad ogni frame, non solo ad ogni cambio di stato: vogliamo
  // il valore corrente, non quello target mentre l'animazione è ancora
  // a metà).
  pingLayer.render(groups, PING_LIFESPAN_SEC, displayedView ? displayedView.scale : 1);
  return pingPoints.length > 0;
}

socket.on('ping:show', ({ x, y, strokeId }) => {
  if (typeof x !== 'number' || typeof y !== 'number') return;
  pingPoints.push({ x, y, t: performance.now(), strokeId });
  kickShaderLoop();
});

socket.on('state:update', (state) => {
  lastState = state;
  render(state);
});

window.addEventListener('resize', () => {
  reportViewport();
  if (lastState) render(lastState);
});

function getActiveLocation(state) {
  return state.locations.find((l) => l.id === state.activeLocationId);
}

let lastPingLocationId = null;

function render(state) {
  const location = getActiveLocation(state);
  const showingImage = Boolean(state.activeImageId && location && location.images.some((i) => i.id === state.activeImageId));

  // Un ping puntava a una mappa: se al posto della mappa compare un'immagine,
  // o si è passati a un'altra location, non ha più senso lasciarlo a schermo.
  const locationId = location ? location.id : null;
  if (showingImage || locationId !== lastPingLocationId) {
    clearPing();
    mapAoeSvg.innerHTML = '';
  }
  lastPingLocationId = locationId;

  mapLayer.style.display = showingImage ? 'none' : 'block';
  imageLayer.style.display = showingImage ? 'block' : 'none';

  renderCompass(location, showingImage);
  renderAudio(location, state.activeAudioTrack, state.audioState, state.audioTriggerSeq);

  if (showingImage) {
    renderImage(location, state.activeImageId);
  } else {
    renderMap(state, location, previousShowingImage);
  }
  previousShowingImage = showingImage;
  kickShaderLoop();
}

// La rosa dei venti è un elemento fisso sullo schermo (percentuali di
// #viewport), indipendente dalla rotazione/pan/zoom della mappa -- mai
// visibile sopra un'immagine mostrata ai giocatori.
function renderCompass(location, showingImage) {
  const compass = location && location.map.compass;
  const visible = Boolean(compass && compass.visible) && !showingImage;
  compassEl.hidden = !visible;
  if (!visible) return;
  compassEl.style.left = `${compass.x}%`;
  compassEl.style.top = `${compass.y}%`;
  compassEl.style.transform = `translate(-50%, -50%) rotate(${compass.rotation}deg)`;
}

// L'elemento <audio> non è mai visibile -- solo suono, indipendente da quale
// layer (mappa o immagine) è mostrato in quel momento, in linea con la
// scelta di design che mostrare un'immagine ai giocatori non ferma l'audio.
// `lastAudioKey` combina slot attivo + file: evita di riassegnare `src`
// (che farebbe ripartire da zero anche una traccia identica) a ogni singolo
// state:update, ma forza comunque il reload quando si passa da main a
// special (o viceversa) anche se per coincidenza nessuno dei due ha un file.
let lastAudioKey = null;
// Premere di nuovo "Traccia speciale" mentre sta già suonando non cambia né
// lo slot né il file (stesso `lastAudioKey`), quindi non ricaricherebbe da
// solo il src -- ma deve comunque far ripartire la traccia da capo. Il
// server incrementa `audioTriggerSeq` a ogni audio:playSpecial; qui basta
// accorgersi che è cambiato mentre la traccia attiva è 'special'.
let lastAudioTriggerSeq = null;

function renderAudio(location, activeAudioTrack, audioState, audioTriggerSeq) {
  const track = location && location.map.audio[activeAudioTrack];
  const file = track && track.file;
  const key = `${activeAudioTrack}:${file || ''}`;
  const keyChanged = key !== lastAudioKey;

  if (keyChanged) {
    lastAudioKey = key;
    // La principale è sempre in loop, la speciale mai: senza questo, uno
    // sting speciale non fermerebbe mai da solo per far tornare la
    // principale, o peggio la principale si fermerebbe dopo un solo giro.
    sceneAudioEl.loop = activeAudioTrack === 'main';
    if (file) {
      sceneAudioEl.src = `/storage/audio/${file}`;
    } else {
      sceneAudioEl.removeAttribute('src');
      sceneAudioEl.load();
    }
  }

  const retriggered = activeAudioTrack === 'special' && audioTriggerSeq !== lastAudioTriggerSeq;
  lastAudioTriggerSeq = audioTriggerSeq;
  // Se il src è già stato ricaricato sopra (keyChanged), riparte già da zero
  // da solo -- azzerare di nuovo qui sarebbe innocuo ma ridondante.
  if (retriggered && !keyChanged) {
    sceneAudioEl.currentTime = 0;
  }

  sceneAudioEl.volume = track && track.volume !== undefined ? track.volume : 0.7;

  if (!file) return;

  if (audioState === 'playing') {
    // Un file audio mancante/corrotto rifiuta play() con una promise
    // rigettata: fallisce silenziosamente, stesso principio già in uso per
    // mappe/immagini con riferimenti non validi -- niente crash della pagina.
    sceneAudioEl.play().catch(() => {});
  } else if (audioState === 'paused') {
    sceneAudioEl.pause();
  } else {
    sceneAudioEl.pause();
    sceneAudioEl.currentTime = 0;
  }
}

function renderImage(location, activeImageId) {
  const image = location.images.find((i) => i.id === activeImageId);
  if (!image) return;

  const applyLayout = () => {
    const rect = fitRect(imageLayer.clientWidth, imageLayer.clientHeight, shownImageImg.naturalWidth, shownImageImg.naturalHeight);
    positionFitBox(imageFitBox, rect);
  };

  loadImageThen(shownImageImg, `/storage/images/${image.file}`, applyLayout);
}

// The wrap element's CSS rotate() transform already turns this locally-flat
// (unrotated) rendering into the correct on-screen appearance — polygon points
// are used as-is, in their stored base space, never pre-rotated here.
function renderFog(polygons) {
  mapFogLayer.innerHTML = '';
  polygons.forEach((polygon) => {
    if (polygon.revealed) return;
    const overlay = document.createElement('div');
    overlay.className = 'fog-overlay';
    overlay.style.clipPath = polygonClipPath(polygon.points);
    mapFogLayer.appendChild(overlay);
  });
}

const AOE_CELL_FILL_OPACITY = 0.35;

// Stessa logica di renderAoeOverlays in control.js, sola lettura: nessun
// listener di interazione, i giocatori vedono soltanto.
function renderAoe(aoes, grid, naturalW, naturalH) {
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
      el.setAttribute('fill-opacity', AOE_CELL_FILL_OPACITY);
      el.setAttribute('stroke', 'none');
      mapAoeSvg.appendChild(el);
    });

    // shapeVisible:false: a differenza di /control, qui il contorno non serve
    // mai a trascinare nulla -- si può saltarne il disegno del tutto invece di
    // renderlo solo invisibile.
    if (aoe.shapeVisible === false) return;
    const darkColor = aoeColorDarkHex(aoe.color);
    const points = aoeOutlinePoints(aoe, grid, naturalW, naturalH);
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', points.map(([x, y]) => `${x},${y}`).join(' '));
    poly.setAttribute('class', 'aoe-shape-overlay');
    poly.setAttribute('fill', 'none');
    poly.setAttribute('stroke', darkColor);
    mapAoeSvg.appendChild(poly);

    // Marker "+" sul punto d'origine (Sfera e Cubo): stesso aiuto visivo di
    // /control (vedi appendAoeOriginMarker in shared/media.js), qui senza
    // compensazione per lo zoom -- /display non ha una modalità "Zoom
    // locale" (quella è solo del DM su /control), quindi lo stroke-width
    // resta fisso.
    appendAoeOriginMarker(mapAoeSvg, aoe, darkColor, 1.5, naturalW, naturalH);
  });
}

function renderMap(state, location, returningFromImage) {
  const live = (location && location.map.liveView) || { scale: 1, offsetX: 0, offsetY: 0 };
  const mapScale = (location && location.map.scale) || 1;

  const scale = mapScale * (live.scale || 1);
  const offsetX = live.offsetX || 0;
  const offsetY = live.offsetY || 0;
  targetView = { scale, offsetX, offsetY };

  const locationId = location ? location.id : null;
  const shouldSnap = !hasRenderedMapOnce || locationId !== lastLocationId || returningFromImage;
  lastLocationId = locationId;
  hasRenderedMapOnce = true;

  if (shouldSnap) {
    displayedView = { ...targetView };
    applyMapTransform(displayedView);
  } else {
    startViewAnimationIfNeeded();
  }

  const polygons = (location && location.map.polygons) || [];

  if (location && location.map.file) {
    mapPlaceholder.hidden = true;
    activeMapEl = loadMapMedia(mapImg, mapVideo, location.map.file, `/storage/maps/${location.map.file}`, () => {
      const nw = mediaW(activeMapEl);
      const nh = mediaH(activeMapEl);
      const rotation = computeTotalRotation(nw, nh, location.map.flip180, location.map.rotate90);
      const effective = layoutMapWrap(mapLayer, mapMediaWrap, rotation);
      const rect = fitRect(effective.width, effective.height, nw, nh);
      positionFitBox(mapFitBox, rect);
      renderFog(polygons);
      renderAoe((location && location.map.aoes) || [], location && location.map.grid, mediaW(activeMapEl), mediaH(activeMapEl));
      shaderLayer.render((location && location.map.shaders) || [], location && location.map.grid, mediaW(activeMapEl), mediaH(activeMapEl));
      // The whole map layer is scaled by a CSS transform, which multiplies the
      // rendered stroke thickness; divide it out so the on-screen line weight
      // stays exactly what was chosen in the editor at any zoom level.
      const grid = location.map.grid || {};
      renderGridSvg(
        mapGridSvg,
        { ...grid, lineWidth: (grid.lineWidth || 0.3) / Math.max(scale, 0.01) },
        nw,
        nh
      );
    });
  } else {
    mapImg.hidden = true;
    mapVideo.hidden = true;
    mapPlaceholder.hidden = false;
    const effective = layoutMapWrap(mapLayer, mapMediaWrap, 0);
    positionFitBox(mapFitBox, { left: 0, top: 0, width: effective.width, height: effective.height });
    renderFog(polygons);
    renderAoe((location && location.map.aoes) || [], location && location.map.grid, mediaW(activeMapEl), mediaH(activeMapEl));
    shaderLayer.render((location && location.map.shaders) || [], location && location.map.grid, mediaW(activeMapEl), mediaH(activeMapEl));
    mapGridSvg.innerHTML = '';
  }
}

// Il rAF loop va fermato quando non c'è nulla da disegnare (nessuna
// decorazione shader sulla location attiva o ping in corso, o si sta
// mostrando un'immagine al posto della mappa): su target come il Raspberry
// Pi 4 un ciclo di clear+composite a 60fps a vuoto è spreco puro. Quando
// torna rilevante (es. si piazza una decorazione, arriva un ping, o si
// torna dalla vista immagine alla mappa), kickShaderLoop() lo riavvia da
// render()/dall'handler di 'ping:show'.
let shaderLoopRunning = false;

function stepShaderLayer() {
  let shaders = [];
  if (lastState) {
    const location = getActiveLocation(lastState);
    const showingImage = Boolean(lastState.activeImageId && location && location.images.some((i) => i.id === lastState.activeImageId));
    if (location && location.map.file && !showingImage) {
      shaders = location.map.shaders || [];
      shaderLayer.render(shaders, location.map.grid, mediaW(activeMapEl), mediaH(activeMapEl));
    }
  }
  const pingActive = pruneAndRenderPing();
  if (!shaders.length && !pingActive) {
    shaderLoopRunning = false;
    return;
  }
  requestAnimationFrame(stepShaderLayer);
}

function kickShaderLoop() {
  if (shaderLoopRunning) return;
  const location = lastState && getActiveLocation(lastState);
  const showingImage = Boolean(lastState && lastState.activeImageId && location && location.images.some((i) => i.id === lastState.activeImageId));
  const shaders = (!showingImage && location && location.map.shaders) || [];
  if (shaders.length > 0 || pingPoints.length > 0) {
    shaderLoopRunning = true;
    requestAnimationFrame(stepShaderLayer);
  }
}

shaderLoopRunning = true;
requestAnimationFrame(stepShaderLayer);
