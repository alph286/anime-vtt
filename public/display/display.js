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

function render(state) {
  const location = getActiveLocation(state);
  const showingImage = Boolean(state.activeImageId && location && location.images.some((i) => i.id === state.activeImageId));

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
    mapGridSvg.innerHTML = '';
  }
}
