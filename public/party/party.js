const socket = io();

const wifiDot = document.getElementById('wifi-dot');
const locationNameEl = document.getElementById('location-name');

const mapPreview = document.getElementById('map-preview');
const mapLayer = document.getElementById('map-layer');
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
const mapAoeShaderCanvas = document.getElementById('map-aoe-shader-canvas');
const aoeShaderLayer = new AoeShaderLayer(mapAoeShaderCanvas);

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
const aoeNudgeFire = document.getElementById('aoe-nudge-fire');

let socketConnected = false;
let lastState = null;

function updateWifi() {
  wifiDot.classList.toggle('ok', socketConnected);
  wifiDot.classList.toggle('bad', !socketConnected);
}

socket.on('connect', () => {
  socketConnected = true;
  socket.emit('hello', { role: 'party' });
  updateWifi();
});

socket.on('disconnect', () => {
  socketConnected = false;
  updateWifi();
});

socket.on('state:update', (state) => {
  lastState = state;
  render(state);
});

window.addEventListener('resize', () => {
  if (lastState) render(lastState);
});

function getActiveLocation(state) {
  return state.locations.find((l) => l.id === state.activeLocationId);
}

function getCurrentLocation() {
  return lastState && getActiveLocation(lastState);
}

// ---------- stato locale del pannello AOE (mai inviato finché non si
// piazza un'area: sono i default per il PROSSIMO piazzamento) ----------
let aoeSelectedShape = 'cone';
let aoeSelectedColor = 'red';
let aoeSelectedSize = AOE_METERS_PER_CELL;
let aoeSelectedWidth = AOE_METERS_PER_CELL;
let aoeSelectedShaderOverride = null;
let aoeShaderMenuOpen = false;
let selectedAoeId = null;
let armedRemoveAoeId = null;
let armedRemoveTimeout = null;

aoeColorButtons.forEach((btn) => {
  btn.style.setProperty('--aoe-color', aoeColorHex(btn.dataset.color));
});

function getSelectedAoe() {
  const location = getCurrentLocation();
  return location && location.map.aoes.find((a) => a.id === selectedAoeId);
}

function disarmRemove() {
  clearTimeout(armedRemoveTimeout);
  armedRemoveAoeId = null;
}

function setSelectedAoeId(id) {
  if (id !== selectedAoeId) disarmRemove();
  selectedAoeId = id;
  render(lastState);
}

function render(state) {
  if (!state) return;
  const location = getActiveLocation(state);
  locationNameEl.textContent = location ? location.name : '';
  renderMapPreview(location, state.displayViewport);
  renderAoePanel();
}

// ---------- mappa (sola visualizzazione): segue l'inquadratura live che il
// DM mostra su /display (stesso pan/zoom condiviso), non la propria mappa
// intera -- richiesta esplicita dell'utente dopo aver provato la prima
// versione. `state.displayViewport` (dimensioni reali dello schermo del
// display, note solo dopo che un /display si è connesso almeno una volta)
// è la chiave: il box qui viene fatto avere la STESSA proporzione dello
// schermo del display (vedi --map-aspect sotto), così l'intero box è una
// replica in scala di #viewport su /display -- la stessa identica
// trasformazione CSS (translate+scale) applicata a #map-layer mostra
// quindi esattamente la stessa porzione di mappa, solo più piccola.
// Nessuno smoothing dell'animazione come in display.js: qui basta uno
// scatto diretto ad ogni state:update, non serve un rAF dedicato per una
// vista secondaria di lettura. Senza displayViewport (nessun /display mai
// connesso), degrada al comportamento precedente: mappa intera, nessun
// transform. ----------

function renderFogOverlays(polygons) {
  mapFogLayer.innerHTML = '';
  polygons.forEach((polygon) => {
    if (polygon.revealed) return;
    const overlay = document.createElement('div');
    overlay.className = 'fog-overlay';
    overlay.style.clipPath = polygonClipPath(polygon.points);
    mapFogLayer.appendChild(overlay);
  });
}

// `scale` è lo stesso fattore applicato a #map-layer (vedi
// applyLiveTransform): la griglia va compensata per restare a spessore
// costante sullo schermo quando il DM zooma, stessa correzione già fatta
// da display.js per il proprio pan/zoom condiviso. Nessuna compensazione
// equivalente per il contorno AOE: stessa scelta di display.js, che non
// l'ha mai avuta.
function renderGrid(grid, naturalW, naturalH, scale) {
  if (!grid) {
    mapGridSvg.innerHTML = '';
    return;
  }
  renderGridSvg(mapGridSvg, { ...grid, lineWidth: (grid.lineWidth || 0.3) / Math.max(scale, 0.01) }, naturalW, naturalH);
}

const AOE_CELL_FILL_OPACITY = 0.35;

// Stessa logica di renderAoeOverlays in control.js, ma senza compensazione
// per uno zoom locale che qui non esiste -- stroke-width fisso via CSS
// (vedi .aoe-shape-overlay/.selected in party.css).
function renderAoeOverlays(aoes, grid, naturalW, naturalH) {
  mapAoeSvg.innerHTML = '';
  if (!naturalW || !naturalH) return;
  aoes.forEach((aoe) => {
    const color = aoeColorHex(aoe.color);
    const darkColor = aoeColorDarkHex(aoe.color);

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

    const points = aoeOutlinePoints(aoe, grid, naturalW, naturalH);
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', points.map(([x, y]) => `${x},${y}`).join(' '));
    poly.setAttribute('class', `aoe-shape-overlay ${aoe.id === selectedAoeId ? 'selected' : ''}`);
    const outlineVisible = aoe.shapeVisible !== false && !aoe.cast;
    poly.setAttribute('fill', 'none');
    poly.setAttribute('stroke', outlineVisible ? darkColor : 'none');
    poly.dataset.id = aoe.id;
    mapAoeSvg.appendChild(poly);

    appendAoeOriginMarker(mapAoeSvg, aoe, outlineVisible ? darkColor : 'none', 1.5, naturalW, naturalH);
  });
}

// displayViewport note e valide (TV connessa almeno una volta): il box
// assume la stessa proporzione del suo schermo, così k (fattore di scala
// tra i pixel reali del box e quelli del display) è un unico numero
// valido sia in larghezza che in altezza.
function followsDisplay(displayViewport) {
  return Boolean(displayViewport && displayViewport.width && displayViewport.height);
}

// Stessa formula di renderMap in display.js (scale = mapScale*live.scale,
// offsetX/Y = live.offsetX/Y) -- l'unica differenza è che offsetX/Y sono
// pixel nello spazio schermo della TV, mentre qui il box è k volte più
// piccolo: vanno scalati di k, lo zoom (unitless) no. Senza una TV nota,
// non c'è un k valido per interpretare quei pixel: meglio non spostare
// nulla (transform:none, mappa intera come prima) che applicare un pan
// a caso.
function applyLiveTransform(location, displayViewport) {
  if (!followsDisplay(displayViewport)) {
    mapLayer.style.transform = 'none';
    return 1;
  }
  const live = (location && location.map.liveView) || { scale: 1, offsetX: 0, offsetY: 0 };
  const mapScale = (location && location.map.scale) || 1;
  const scale = mapScale * (live.scale || 1);
  const k = mapLayer.clientWidth / displayViewport.width;
  const offsetX = (live.offsetX || 0) * k;
  const offsetY = (live.offsetY || 0) * k;
  mapLayer.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
  return scale;
}

function renderMapPreview(location, displayViewport) {
  const polygons = (location && location.map.polygons) || [];
  const following = followsDisplay(displayViewport);

  if (location && location.map.file) {
    mapPlaceholder.hidden = true;
    activeMapEl = loadMapMedia(mapImg, mapVideo, location.map.file, `/storage/maps/${location.map.file}`, () => {
      const nw = mediaW(activeMapEl);
      const nh = mediaH(activeMapEl);
      const rotation = computeTotalRotation(nw, nh, location.map.flip180, location.map.rotate90);
      const swapped = rotation === 90 || rotation === 270;
      if (following) {
        mapPreview.style.setProperty('--map-aspect', `${displayViewport.width} / ${displayViewport.height}`);
      } else if (nw && nh) {
        mapPreview.style.setProperty('--map-aspect', swapped ? `${nh} / ${nw}` : `${nw} / ${nh}`);
      }
      const effective = layoutMapWrap(mapLayer, mapMediaWrap, rotation);
      const rect = fitRect(effective.width, effective.height, nw, nh);
      positionFitBox(mapFitBox, rect);
      const scale = applyLiveTransform(location, displayViewport);
      renderFogOverlays(polygons);
      renderGrid(location.map.grid, nw, nh, scale);
      renderAoeOverlays(location.map.aoes || [], location.map.grid, nw, nh);
      shaderLayer.render(location.map.shaders || [], location.map.grid, nw, nh);
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
    if (following) {
      mapPreview.style.setProperty('--map-aspect', `${displayViewport.width} / ${displayViewport.height}`);
    } else {
      mapPreview.style.removeProperty('--map-aspect');
    }
    const effective = layoutMapWrap(mapLayer, mapMediaWrap, 0);
    const rect = { left: 0, top: 0, width: effective.width, height: effective.height };
    positionFitBox(mapFitBox, rect);
    const scale = applyLiveTransform(location, displayViewport);
    renderFogOverlays(polygons);
    renderGrid(location && location.map.grid, mediaW(activeMapEl), mediaH(activeMapEl), scale);
    renderAoeOverlays((location && location.map.aoes) || [], location && location.map.grid, mediaW(activeMapEl), mediaH(activeMapEl));
    shaderLayer.render((location && location.map.shaders) || [], location && location.map.grid, mediaW(activeMapEl), mediaH(activeMapEl));
  }

  // L'eventuale shader "lanciato" (aoe.cast) va comunque animato frame per
  // frame, non solo ridisegnato ad ogni cambio di stato -- stesso ciclo
  // rAF di /control e /display.
  kickAoeShaderLoop();
}

// ---------- rAF loop per lo shader delle AOE lanciate ----------

let aoeShaderLoopRunning = false;

function stepAoeShaderLoop() {
  const location = getCurrentLocation();
  const castAoes = (location && (location.map.aoes || []).filter((a) => a.cast)) || [];
  const decorShaders = (location && location.map.shaders) || [];
  if (location) {
    const nw = mediaW(activeMapEl);
    const nh = mediaH(activeMapEl);
    shaderLayer.render(decorShaders, location.map.grid, nw, nh);
    aoeShaderLayer.render(
      castAoes.map((a) => ({ ...a, shaderId: resolveAoeShaderId(a) })),
      location.map.grid,
      nw,
      nh
    );
  }
  if (!castAoes.length && !decorShaders.length) {
    aoeShaderLoopRunning = false;
    return;
  }
  requestAnimationFrame(stepAoeShaderLoop);
}

function kickAoeShaderLoop() {
  if (aoeShaderLoopRunning) return;
  const location = getCurrentLocation();
  const hasCastAoe = Boolean(location && (location.map.aoes || []).some((a) => a.cast));
  const hasDecorShader = Boolean(location && location.map.shaders && location.map.shaders.length);
  if (hasCastAoe || hasDecorShader) {
    aoeShaderLoopRunning = true;
    requestAnimationFrame(stepAoeShaderLoop);
  }
}

// ---------- pannello AOE ----------

function renderAoePanel() {
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

  const location = getCurrentLocation();
  renderAoeNudgeOverlay(editingAoe, location && location.map.grid);
  renderAoeChipList((location && location.map.aoes) || []);
}

function aoeShapeLabel(shape) {
  return { cone: 'Cono', cube: 'Cubo', sphere: 'Sfera', line: 'Linea' }[shape] || shape;
}

function aoeSizeDimensionLabel(shape) {
  return { cone: 'Lunghezza', cube: 'Lato', sphere: 'Raggio', line: 'Lunghezza' }[shape] || 'Taglia';
}

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

aoeShapeButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    aoeSelectedShape = btn.dataset.shape;
    renderAoePanel();
  });
});

aoeColorButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const location = getCurrentLocation();
    const editingAoe = getSelectedAoe();
    if (editingAoe) {
      socket.emit('aoe:setColor', { locationId: location.id, aoeId: editingAoe.id, color: btn.dataset.color });
      if (editingAoe.shaderOverride) {
        socket.emit('aoe:setShaderOverride', { locationId: location.id, aoeId: editingAoe.id, shaderOverride: null });
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

aoeShaderMenuItems.forEach((btn) => {
  btn.addEventListener('click', () => {
    const location = getCurrentLocation();
    const editingAoe = getSelectedAoe();
    const current = editingAoe ? editingAoe.shaderOverride : aoeSelectedShaderOverride;
    const next = current === btn.dataset.shader ? null : btn.dataset.shader;
    const defaultColor = AOE_SHADER_OVERRIDE_DEFAULT_COLOR[btn.dataset.shader];
    if (editingAoe) {
      socket.emit('aoe:setShaderOverride', { locationId: location.id, aoeId: editingAoe.id, shaderOverride: next });
      if (next) socket.emit('aoe:setColor', { locationId: location.id, aoeId: editingAoe.id, color: defaultColor });
    } else {
      aoeSelectedShaderOverride = next;
      if (next) aoeSelectedColor = defaultColor;
    }
    aoeShaderMenuOpen = false;
    renderAoePanel();
  });
});

function resizeSelectedAoe(deltaSize, deltaWidth) {
  const editingAoe = getSelectedAoe();
  if (!editingAoe) return;
  const location = getCurrentLocation();
  const grid = location && location.map.grid;
  const nw = mediaW(activeMapEl);
  const nh = mediaH(activeMapEl);
  const newSizeM = Math.max(AOE_METERS_PER_CELL, editingAoe.sizeM + deltaSize);
  const newWidthM = editingAoe.shape === 'line'
    ? Math.max(AOE_METERS_PER_CELL, (editingAoe.widthM || AOE_METERS_PER_CELL) + deltaWidth)
    : editingAoe.widthM;
  const [x, y] = snapAoeOrigin(editingAoe.shape, newSizeM, newWidthM, editingAoe.rotation, grid, editingAoe.x, editingAoe.y, nw, nh);
  socket.emit('aoe:resize', {
    locationId: location.id,
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

function rotateSelectedAoe(delta) {
  const editingAoe = getSelectedAoe();
  if (!editingAoe) return;
  const location = getCurrentLocation();
  const grid = location && location.map.grid;
  const nw = mediaW(activeMapEl);
  const nh = mediaH(activeMapEl);
  const nextRotation = ((editingAoe.rotation + delta) % 360 + 360) % 360;
  const [x, y] = snapAoeOrigin(editingAoe.shape, editingAoe.sizeM, editingAoe.widthM, nextRotation, grid, editingAoe.x, editingAoe.y, nw, nh);
  socket.emit('aoe:rotate', { locationId: location.id, aoeId: editingAoe.id, rotation: nextRotation, x, y });
}

aoeRotateCcw.addEventListener('click', () => rotateSelectedAoe(-15));
aoeRotateCw.addEventListener('click', () => rotateSelectedAoe(15));

// dx/dy arrivano in direzioni SCHERMO; qui non serve ruotarle in base alla
// rotazione della mappa come fa /control (nessun transform di pan/zoom in
// mezzo), ma la mappa stessa può essere auto-ruotata (flip180/rotate90):
// stessa conversione di control.js per restare corretti in quel caso.
function nudgeSelectedAoe(dx, dy) {
  const editingAoe = getSelectedAoe();
  if (!editingAoe) return;
  const location = getCurrentLocation();
  const grid = location && location.map.grid;
  if (!grid || !grid.enabled) return;
  const nw = mediaW(activeMapEl);
  const nh = mediaH(activeMapEl);
  if (!nw || !nh) return;
  const rotation = computeTotalRotation(nw, nh, location.map.flip180, location.map.rotate90);
  const [baseDx, baseDy] = rotateDirectionToBase([dx, dy], rotation);
  const stepXPct = (grid.cellSize / nw) * 100;
  const stepYPct = (grid.cellSize / nh) * 100;
  const rawX = Math.min(100, Math.max(0, editingAoe.x + baseDx * stepXPct));
  const rawY = Math.min(100, Math.max(0, editingAoe.y + baseDy * stepYPct));
  const [x, y] = snapAoeOrigin(editingAoe.shape, editingAoe.sizeM, editingAoe.widthM, editingAoe.rotation, grid, rawX, rawY, nw, nh);
  socket.emit('aoe:move', { locationId: location.id, aoeId: editingAoe.id, x, y });
}

aoeNudgeUp.addEventListener('click', () => nudgeSelectedAoe(0, -1));
aoeNudgeDown.addEventListener('click', () => nudgeSelectedAoe(0, 1));
aoeNudgeLeft.addEventListener('click', () => nudgeSelectedAoe(-1, 0));
aoeNudgeRight.addEventListener('click', () => nudgeSelectedAoe(1, 0));

aoeNudgeColor.addEventListener('click', () => {
  const editingAoe = getSelectedAoe();
  if (!editingAoe) return;
  const location = getCurrentLocation();
  const names = AOE_COLOR_CYCLE_NAMES;
  const idx = names.indexOf(editingAoe.color);
  const next = names[(idx + 1) % names.length];
  socket.emit('aoe:setColor', { locationId: location.id, aoeId: editingAoe.id, color: next });
});

// Stessa azione del fulmine nella pillola della lista (aoeChipList più
// sotto), qui raggiungibile senza dover scendere fino alla lista mentre
// si sta già modificando un'area col pad.
aoeNudgeFire.addEventListener('click', () => {
  const editingAoe = getSelectedAoe();
  if (!editingAoe) return;
  const location = getCurrentLocation();
  socket.emit('aoe:setCast', { locationId: location.id, aoeId: editingAoe.id, cast: !editingAoe.cast });
});

aoeNudgeSizeUp.addEventListener('click', () => resizeSelectedAoe(AOE_METERS_PER_CELL, 0));
aoeNudgeSizeDown.addEventListener('click', () => resizeSelectedAoe(-AOE_METERS_PER_CELL, 0));
aoeNudgeWidthUp.addEventListener('click', () => resizeSelectedAoe(0, AOE_METERS_PER_CELL));
aoeNudgeWidthDown.addEventListener('click', () => resizeSelectedAoe(0, -AOE_METERS_PER_CELL));

function renderAoeNudgeOverlay(editingAoe, grid) {
  aoeNudgeOverlay.hidden = !editingAoe;
  if (!editingAoe) return;

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
  aoeNudgeFire.classList.toggle('active', Boolean(editingAoe.cast));
}

// Pannello flottante: posizione ricordata per-dispositivo (localStorage),
// chiave dedicata a /party per non condividerla con /control (stessa
// origine, pagine diverse).
const AOE_NUDGE_POS_KEY = 'partyAoeNudgeOverlayPos';
let aoeNudgeDrag = null;
let aoeNudgePositionApplied = false;

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

let aoeNudgeStoredPos = null;
try {
  const raw = localStorage.getItem(AOE_NUDGE_POS_KEY);
  if (raw) aoeNudgeStoredPos = JSON.parse(raw);
} catch (err) { /* localStorage non disponibile o valore corrotto: resta sul default */ }

aoeNudgeDragHandle.addEventListener('pointerdown', (e) => {
  const rect = aoeNudgeOverlay.getBoundingClientRect();
  aoeNudgeDrag = { pointerId: e.pointerId, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top };
  aoeNudgeDragHandle.setPointerCapture(e.pointerId);
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

aoeChipList.addEventListener('click', (e) => {
  const location = getCurrentLocation();
  const castBtn = e.target.closest('.aoe-chip-cast');
  if (castBtn) {
    const chip = castBtn.closest('.aoe-chip');
    const aoeId = chip.dataset.id;
    const aoe = location && location.map.aoes.find((a) => a.id === aoeId);
    if (!aoe) return;
    socket.emit('aoe:setCast', { locationId: location.id, aoeId, cast: !aoe.cast });
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
        render(lastState);
      }, 2500);
      render(lastState);
      return;
    }
    disarmRemove();
    socket.emit('aoe:remove', { locationId: location.id, aoeId });
    return;
  }
  const pill = e.target.closest('.aoe-chip-pill');
  if (pill) {
    const chip = pill.closest('.aoe-chip');
    setSelectedAoeId(selectedAoeId === chip.dataset.id ? null : chip.dataset.id);
  }
});

// ---------- piazzamento/spostamento AOE sulla mappa ----------
// Stessa logica (e stessa soglia di 8px tap-vs-trascinamento) di
// control.js: un tap su un'area vuota piazza una nuova area con la forma/
// taglia correnti, un trascinamento che parte da un'area già disegnata la
// sposta invece di piazzarne una nuova.

function localPointFromEvent(e) {
  const location = getCurrentLocation();
  if (!location) return null;
  const rect = mapFitBox.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const rx = ((e.clientX - rect.left) / rect.width) * 100;
  const ry = ((e.clientY - rect.top) / rect.height) * 100;
  const nw = mediaW(activeMapEl);
  const nh = mediaH(activeMapEl);
  const rotation = computeTotalRotation(nw, nh, location.map.flip180, location.map.rotate90);
  return rotatePointToBase([rx, ry], rotation);
}

function snapAoePlacement(shape, sizeM, widthM, rotation, xPct, yPct) {
  const location = getCurrentLocation();
  const grid = location && location.map.grid;
  const nw = mediaW(activeMapEl);
  const nh = mediaH(activeMapEl);
  return snapAoeOrigin(shape, sizeM, widthM, rotation, grid, xPct, yPct, nw, nh);
}

let aoePlaceStart = null;
let aoeDrag = null;

mapFitBox.addEventListener('pointerdown', (e) => {
  const overlay = e.target.closest('.aoe-shape-overlay');
  if (overlay) {
    const location = getCurrentLocation();
    const aoe = location && location.map.aoes.find((a) => a.id === overlay.dataset.id);
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

mapFitBox.addEventListener('pointermove', (e) => {
  if (!aoeDrag || e.pointerId !== aoeDrag.pointerId) return;
  const point = localPointFromEvent(e);
  if (!point) return;
  const location = getCurrentLocation();
  const aoe = location && location.map.aoes.find((a) => a.id === aoeDrag.id);
  if (!aoe) return;
  aoeDrag.targetX += point[0] - aoeDrag.lastBaseX;
  aoeDrag.targetY += point[1] - aoeDrag.lastBaseY;
  aoeDrag.lastBaseX = point[0];
  aoeDrag.lastBaseY = point[1];
  const [x, y] = snapAoePlacement(aoe.shape, aoe.sizeM, aoe.widthM, aoe.rotation, aoeDrag.targetX, aoeDrag.targetY);
  socket.emit('aoe:move', { locationId: location.id, aoeId: aoeDrag.id, x, y });
});

mapFitBox.addEventListener('pointerup', (e) => {
  if (aoeDrag && e.pointerId === aoeDrag.pointerId) {
    aoeDrag = null;
    return;
  }
  if (!aoePlaceStart || e.pointerId !== aoePlaceStart.pointerId) return;
  const { x: startX, y: startY } = aoePlaceStart;
  aoePlaceStart = null;
  if (Math.hypot(e.clientX - startX, e.clientY - startY) > 8) return;

  const location = getCurrentLocation();
  if (!location) return;
  const point = localPointFromEvent(e);
  if (!point) return;
  const widthM = aoeSelectedShape === 'line' ? aoeSelectedWidth : undefined;
  const [x, y] = snapAoePlacement(aoeSelectedShape, aoeSelectedSize, widthM, 0, point[0], point[1]);
  socket.emit('aoe:place', {
    locationId: location.id,
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
