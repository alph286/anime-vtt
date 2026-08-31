const socket = io();
let state = null;

let mode = 'select';
let drawingPoints = [];
let selectedPolygonId = null;
let fogOpacity = 0.45;
let editorZoom = 1;
let currentMapScale = 1;
let draggingIndex = null;
let draggingPolygon = null;
let gridAlignDrag = null;
let currentImageRect = null;
let currentRotation = 0;

const locationSelect = document.getElementById('location-select');
const locationCreateBtn = document.getElementById('location-create');
const locationList = document.getElementById('location-list');
const locationArchivedWrap = document.getElementById('location-archived-wrap');
const locationArchivedList = document.getElementById('location-archived-list');

const toolSelectBtn = document.getElementById('tool-select');
const toolDrawBtn = document.getElementById('tool-draw');
const drawFinishBtn = document.getElementById('draw-finish');
const drawCancelBtn = document.getElementById('draw-cancel');
const deletePolygonBtn = document.getElementById('delete-polygon');
const removeMapBtn = document.getElementById('remove-map');
const flip180Btn = document.getElementById('flip-180');
const fogOpacityNum = document.getElementById('fog-opacity-num');
const mapScaleNum = document.getElementById('map-scale-num');
const editorZoomReadout = document.getElementById('editor-zoom-readout');
const editorZoomResetBtn = document.getElementById('editor-zoom-reset');

const gridToggleBtn = document.getElementById('grid-toggle');
const gridAlignToolBtn = document.getElementById('grid-align-tool');
const gridSizeNum = document.getElementById('grid-size-num');
const gridOffsetXNum = document.getElementById('grid-offset-x-num');
const gridOffsetYNum = document.getElementById('grid-offset-y-num');
const gridColorInput = document.getElementById('grid-color');
const gridWidthNum = document.getElementById('grid-width-num');
const gridSavePresetBtn = document.getElementById('grid-save-preset');
const gridApplyPresetBtn = document.getElementById('grid-apply-preset');

const mapCanvas = document.getElementById('map-canvas');
const mapCanvasZoom = document.getElementById('map-canvas-zoom');
const mapMediaWrap = document.getElementById('map-media-wrap');
const mapImg = document.getElementById('map-preview-img');
const mapVideo = document.getElementById('map-preview-video');
let activeMapEl = mapImg;
const mapPlaceholder = document.getElementById('map-canvas-placeholder');
const overlayBox = document.getElementById('overlay-box');
const gridSvg = document.getElementById('grid-svg');
const polygonSvg = document.getElementById('polygon-svg');
const mapUpload = document.getElementById('map-upload');
const mapUploadWarning = document.getElementById('map-upload-warning');

const polygonList = document.getElementById('polygon-list');
const imageList = document.getElementById('image-list');
const imageUpload = document.getElementById('image-upload');

const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightbox-img');
const lightboxCaption = document.getElementById('lightbox-caption');
const lightboxCloseBtn = document.getElementById('lightbox-close');

// Elementi che manipolano mappa/griglia/fog/immagini della location attiva —
// senza significato (e non sicuri da azionare) quando non c'è nessuna
// location attiva, es. subito dopo aver archiviato l'ultima rimasta.
// Disabilitarli impedisce anche ai loro handler click/change di scattare
// affatto (un elemento disabled non li dispatcha mai), quindi non servono
// guardie aggiuntive dentro ciascun handler.
const LOCATION_DEPENDENT_CONTROLS = [
  mapUpload, removeMapBtn, flip180Btn, mapScaleNum,
  toolSelectBtn, toolDrawBtn, deletePolygonBtn, fogOpacityNum,
  gridToggleBtn, gridAlignToolBtn, gridColorInput, gridWidthNum,
  gridSizeNum, gridOffsetXNum, gridOffsetYNum, gridSavePresetBtn, gridApplyPresetBtn,
  imageUpload
];
document.querySelectorAll('[data-grid-move]').forEach((btn) => LOCATION_DEPENDENT_CONTROLS.push(btn));

function setLocationControlsDisabled(disabled) {
  LOCATION_DEPENDENT_CONTROLS.forEach((el) => { el.disabled = disabled; });
}

mapImg.addEventListener('dragstart', (e) => e.preventDefault());
mapVideo.addEventListener('dragstart', (e) => e.preventDefault());
overlayBox.addEventListener('dragstart', (e) => e.preventDefault());

socket.on('connect', () => socket.emit('hello', { role: 'editor' }));
socket.on('state:update', (s) => {
  state = s;
  render();
});

window.addEventListener('resize', () => {
  if (state) {
    updateZoomBox();
    updateOverlayBox();
  }
});

function getActiveLocation() {
  return state.locations.find((l) => l.id === state.activeLocationId);
}

function bindNumberCommit(numEl, min, max, onChange) {
  function commit() {
    if (numEl.value === '') return;
    let v = Number(numEl.value);
    if (Number.isNaN(v)) return;
    v = Math.min(max, Math.max(min, v));
    numEl.value = String(v);
    onChange(v);
  }
  numEl.addEventListener('change', commit);
  numEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') numEl.blur();
  });
}

function render() {
  const location = getActiveLocation();

  locationSelect.innerHTML = state.locations
    .filter((l) => !l.archived)
    .map((l) => `<option value="${l.id}" ${l.id === state.activeLocationId ? 'selected' : ''}>${escapeHtml(l.name)}</option>`)
    .join('');

  renderLocationPanel();

  if (!location) {
    setLocationControlsDisabled(true);
    mapImg.hidden = true;
    mapVideo.hidden = true;
    mapPlaceholder.hidden = false;
    gridSvg.innerHTML = '';
    polygonSvg.innerHTML = '';
    polygonList.innerHTML = '';
    imageList.innerHTML = '<p class="hint">nessuna location attiva — creane una qui sopra.</p>';
    updateZoomBox();
    return;
  }
  setLocationControlsDisabled(false);

  mapScaleNum.value = String(Math.round((location.map.scale || 1) * 100));
  currentMapScale = location.map.scale || 1;
  flip180Btn.classList.toggle('active', Boolean(location.map.flip180));

  const grid = location.map.grid;
  gridToggleBtn.classList.toggle('active', grid.enabled);
  gridToggleBtn.title = grid.enabled ? 'Nascondi griglia' : 'Mostra griglia';
  gridSizeNum.value = String(grid.cellSize);
  gridOffsetXNum.value = String(grid.offsetX);
  gridOffsetYNum.value = String(grid.offsetY);
  gridColorInput.value = grid.color || '#ffffff';
  gridWidthNum.value = String(grid.lineWidth || 0.3);

  if (location.map.file) {
    activeMapEl = loadMapMedia(
      mapImg,
      mapVideo,
      location.map.file,
      `/storage/maps/${location.map.file}`,
      updateOverlayBox
    );
    mapPlaceholder.hidden = true;
  } else {
    mapImg.hidden = true;
    mapVideo.hidden = true;
    mapPlaceholder.hidden = false;
  }

  renderPolygonList(location);
  renderImageList(location);
  updateZoomBox();
  updateOverlayBox();
}

function updateZoomBox() {
  const baseW = mapCanvas.clientWidth;
  const baseH = mapCanvas.clientHeight;
  const totalZoom = editorZoom * currentMapScale;
  mapCanvasZoom.style.width = `${baseW * totalZoom}px`;
  mapCanvasZoom.style.height = `${baseH * totalZoom}px`;
}

function updateOverlayBox() {
  const location = getActiveLocation();
  if (!location) return;

  const nw = mediaW(activeMapEl);
  const nh = mediaH(activeMapEl);

  currentRotation = location.map.file && nw
    ? computeTotalRotation(nw, nh, location.map.flip180)
    : 0;

  const effective = layoutMapWrap(mapCanvasZoom, mapMediaWrap, currentRotation);

  if (location.map.file && nw) {
    currentImageRect = fitRect(effective.width, effective.height, nw, nh);
  } else {
    currentImageRect = { left: 0, top: 0, width: effective.width, height: effective.height };
  }

  positionFitBox(overlayBox, currentImageRect);
  renderGrid(location);
  renderPolygonsSvg();
}

mapCanvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const rect = mapCanvas.getBoundingClientRect();
    const cursorX = e.clientX - rect.left + mapCanvas.scrollLeft;
    const cursorY = e.clientY - rect.top + mapCanvas.scrollTop;
    const ratioX = cursorX / mapCanvasZoom.offsetWidth;
    const ratioY = cursorY / mapCanvasZoom.offsetHeight;

    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    editorZoom = Math.min(4, Math.max(0.5, editorZoom * factor));
    editorZoomReadout.textContent = `${Math.round(editorZoom * 100)}%`;
    updateZoomBox();
    updateOverlayBox();

    mapCanvas.scrollLeft = ratioX * mapCanvasZoom.offsetWidth - (e.clientX - rect.left);
    mapCanvas.scrollTop = ratioY * mapCanvasZoom.offsetHeight - (e.clientY - rect.top);
  },
  { passive: false }
);

editorZoomResetBtn.addEventListener('click', () => {
  editorZoom = 1;
  editorZoomReadout.textContent = '100%';
  updateZoomBox();
  updateOverlayBox();
  mapCanvas.scrollLeft = 0;
  mapCanvas.scrollTop = 0;
});

function renderGrid(location) {
  renderGridSvg(gridSvg, location.map.grid, mediaW(activeMapEl), mediaH(activeMapEl));
}

function renderPolygonsSvg() {
  const location = getActiveLocation();
  polygonSvg.innerHTML = '';
  overlayBox.querySelectorAll('.vertex-handle, .draw-point').forEach((el) => el.remove());
  if (!location) return;

  (location.map.polygons || []).forEach((poly) => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    el.setAttribute('points', poly.points.map(([x, y]) => `${x},${y}`).join(' '));
    const isSelected = poly.id === selectedPolygonId;
    el.setAttribute('class', `fog-poly ${poly.revealed ? 'revealed' : ''} ${isSelected ? 'selected' : ''}`);
    if (!poly.revealed && !isSelected) {
      el.style.fillOpacity = String(fogOpacity);
    }
    polygonSvg.appendChild(el);

    if (isSelected) {
      poly.points.forEach(([x, y], index) => {
        const handle = document.createElement('div');
        handle.className = 'vertex-handle';
        handle.style.left = `${(x / 100) * currentImageRect.width}px`;
        handle.style.top = `${(y / 100) * currentImageRect.height}px`;
        handle.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          draggingIndex = index;
        });
        handle.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (poly.points.length <= 3) return;
          poly.points.splice(index, 1);
          renderPolygonsSvg();
          socket.emit('polygon:update', { locationId: location.id, polygonId: poly.id, points: poly.points });
        });
        overlayBox.appendChild(handle);
      });
    }
  });

  if (drawingPoints.length > 0) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    line.setAttribute('points', drawingPoints.map(([x, y]) => `${x},${y}`).join(' '));
    line.setAttribute('class', 'draw-line');
    polygonSvg.appendChild(line);

    drawingPoints.forEach(([x, y]) => {
      const dot = document.createElement('div');
      dot.className = 'draw-point';
      dot.style.left = `${(x / 100) * currentImageRect.width}px`;
      dot.style.top = `${(y / 100) * currentImageRect.height}px`;
      overlayBox.appendChild(dot);
    });
  }

  drawFinishBtn.hidden = drawingPoints.length < 3;
  drawCancelBtn.hidden = drawingPoints.length === 0;
  deletePolygonBtn.disabled = !selectedPolygonId;
  if (deleteArmedFor !== selectedPolygonId) resetDeleteArm();
}

function pointFromClientXY(clientX, clientY) {
  const rect = overlayBox.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * 100;
  const y = ((clientY - rect.top) / rect.height) * 100;
  return [Math.min(100, Math.max(0, x)), Math.min(100, Math.max(0, y))];
}

// Polygon/grid coordinates are always stored relative to the map's own
// (unrotated) pixel space. A click lands in visually-rotated screen space, so
// convert immediately on the way in and only convert back for drawing on screen.
function basePointFromClientXY(clientX, clientY) {
  return rotatePointToBase(pointFromClientXY(clientX, clientY), currentRotation);
}

function pointInPolygon([x, y], points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

overlayBox.addEventListener('click', (e) => {
  if (mode !== 'draw') return;
  const point = basePointFromClientXY(e.clientX, e.clientY);
  drawingPoints.push(point);
  renderPolygonsSvg();
});

overlayBox.addEventListener('pointerdown', (e) => {
  if (e.button === 2) return;

  if (mode === 'grid-align') {
    const start = basePointFromClientXY(e.clientX, e.clientY);
    const box = document.createElement('div');
    box.className = 'grid-align-box';
    overlayBox.appendChild(box);
    gridAlignDrag = { start, box };
    updateGridAlignBox(start, start);
    return;
  }

  if (mode !== 'select') return;
  const location = getActiveLocation();
  if (!location) return;
  const point = basePointFromClientXY(e.clientX, e.clientY);
  const hit = (location.map.polygons || []).find((poly) => pointInPolygon(point, poly.points));

  selectedPolygonId = hit ? hit.id : null;
  draggingPolygon = hit
    ? { locationId: location.id, polygonId: hit.id, startBase: point, originalPoints: hit.points.map((p) => [...p]) }
    : null;

  renderPolygonsSvg();
  renderPolygonList(location);
});

function updateGridAlignBox(start, end) {
  const left = Math.min(start[0], end[0]);
  const top = Math.min(start[1], end[1]);
  const width = Math.abs(end[0] - start[0]);
  const height = Math.abs(end[1] - start[1]);
  const box = gridAlignDrag.box;
  box.style.left = `${(left / 100) * currentImageRect.width}px`;
  box.style.top = `${(top / 100) * currentImageRect.height}px`;
  box.style.width = `${(width / 100) * currentImageRect.width}px`;
  box.style.height = `${(height / 100) * currentImageRect.height}px`;
}

document.addEventListener('pointermove', (e) => {
  if (gridAlignDrag) {
    const current = basePointFromClientXY(e.clientX, e.clientY);
    updateGridAlignBox(gridAlignDrag.start, current);
    gridAlignDrag.end = current;
    return;
  }

  if (draggingIndex !== null && selectedPolygonId) {
    const location = getActiveLocation();
    const poly = location.map.polygons.find((p) => p.id === selectedPolygonId);
    if (poly) {
      poly.points[draggingIndex] = basePointFromClientXY(e.clientX, e.clientY);
      renderPolygonsSvg();
    }
    return;
  }

  if (draggingPolygon) {
    const location = getActiveLocation();
    const poly = location.map.polygons.find((p) => p.id === draggingPolygon.polygonId);
    if (!poly) return;
    const current = basePointFromClientXY(e.clientX, e.clientY);
    const dx = current[0] - draggingPolygon.startBase[0];
    const dy = current[1] - draggingPolygon.startBase[1];
    poly.points = draggingPolygon.originalPoints.map(([x, y]) => [
      Math.min(100, Math.max(0, x + dx)),
      Math.min(100, Math.max(0, y + dy))
    ]);
    renderPolygonsSvg();
  }
});

document.addEventListener('pointerup', () => {
  if (gridAlignDrag) {
    const { start, end, box } = gridAlignDrag;
    box.remove();
    gridAlignDrag = null;
    if (end && mediaW(activeMapEl)) {
      applyGridAlignment(start, end);
    }
    mode = 'select';
    toolSelectBtn.classList.add('active');
    gridAlignToolBtn.classList.remove('active');
    return;
  }

  if (draggingIndex !== null && selectedPolygonId) {
    draggingIndex = null;
    const location = getActiveLocation();
    const poly = location.map.polygons.find((p) => p.id === selectedPolygonId);
    if (poly) {
      socket.emit('polygon:update', { locationId: location.id, polygonId: poly.id, points: poly.points });
    }
  }

  if (draggingPolygon) {
    const location = getActiveLocation();
    const poly = location.map.polygons.find((p) => p.id === draggingPolygon.polygonId);
    if (poly) {
      socket.emit('polygon:update', { locationId: location.id, polygonId: poly.id, points: poly.points });
    }
    draggingPolygon = null;
  }
});

document.addEventListener('pointercancel', () => {
  if (gridAlignDrag) {
    gridAlignDrag.box.remove();
    gridAlignDrag = null;
    mode = 'select';
    toolSelectBtn.classList.add('active');
    gridAlignToolBtn.classList.remove('active');
  }
  draggingIndex = null;
  draggingPolygon = null;
});

function applyGridAlignment(start, end) {
  const nw = mediaW(activeMapEl);
  const nh = mediaH(activeMapEl);
  const leftPct = Math.min(start[0], end[0]);
  const topPct = Math.min(start[1], end[1]);
  const widthPct = Math.abs(end[0] - start[0]);
  const heightPct = Math.abs(end[1] - start[1]);
  if (widthPct < 0.5 || heightPct < 0.5) return;

  const cellW = (widthPct / 100) * nw;
  const cellH = (heightPct / 100) * nh;
  const cellSize = Math.max(4, Math.round((cellW + cellH) / 2));
  const originX = Math.round((leftPct / 100) * nw);
  const originY = Math.round((topPct / 100) * nh);
  const offsetX = ((originX % cellSize) + cellSize) % cellSize;
  const offsetY = ((originY % cellSize) + cellSize) % cellSize;

  socket.emit('grid:update', {
    locationId: state.activeLocationId,
    enabled: true,
    cellSize,
    offsetX,
    offsetY
  });
}

toolSelectBtn.addEventListener('click', () => {
  mode = 'select';
  drawingPoints = [];
  toolSelectBtn.classList.add('active');
  toolDrawBtn.classList.remove('active');
  gridAlignToolBtn.classList.remove('active');
  renderPolygonsSvg();
});

toolDrawBtn.addEventListener('click', () => {
  mode = 'draw';
  selectedPolygonId = null;
  toolDrawBtn.classList.add('active');
  toolSelectBtn.classList.remove('active');
  gridAlignToolBtn.classList.remove('active');
  renderPolygonsSvg();
  renderPolygonList(getActiveLocation());
});

gridAlignToolBtn.addEventListener('click', () => {
  mode = 'grid-align';
  gridAlignToolBtn.classList.add('active');
  toolSelectBtn.classList.remove('active');
  toolDrawBtn.classList.remove('active');
});

drawFinishBtn.addEventListener('click', () => {
  if (drawingPoints.length < 3) return;
  const location = getActiveLocation();
  const name = `Area ${(location.map.polygons || []).length + 1}`;
  socket.emit('polygon:create', { locationId: state.activeLocationId, name, points: drawingPoints });
  drawingPoints = [];
  mode = 'select';
  toolSelectBtn.classList.add('active');
  toolDrawBtn.classList.remove('active');
});

drawCancelBtn.addEventListener('click', () => {
  drawingPoints = [];
  renderPolygonsSvg();
});

// Deletions are permanent (the image variant unlinks the file on disk too), and
// this button sits right next to the tool icons in constant use — one imprecise
// click must not be enough to lose something. First click arms a 2.5s confirm
// window (visually + via title), second click within it actually deletes.
let deleteArmedFor = null;
let deleteArmTimeout = null;

function resetDeleteArm() {
  deleteArmedFor = null;
  clearTimeout(deleteArmTimeout);
  deletePolygonBtn.classList.remove('confirm');
  deletePolygonBtn.title = 'Elimina selezionato';
}

deletePolygonBtn.addEventListener('click', () => {
  if (!selectedPolygonId) return;
  if (deleteArmedFor !== selectedPolygonId) {
    deleteArmedFor = selectedPolygonId;
    deletePolygonBtn.classList.add('confirm');
    deletePolygonBtn.title = 'Click di nuovo per confermare';
    clearTimeout(deleteArmTimeout);
    deleteArmTimeout = setTimeout(resetDeleteArm, 2500);
    return;
  }
  const polygonId = selectedPolygonId;
  resetDeleteArm();
  socket.emit('polygon:delete', { locationId: state.activeLocationId, polygonId });
  selectedPolygonId = null;
});

flip180Btn.addEventListener('click', () => {
  socket.emit('mapFlip:toggle', { locationId: state.activeLocationId });
});

bindNumberCommit(fogOpacityNum, 0, 100, (v) => {
  fogOpacity = v / 100;
  renderPolygonsSvg();
});

function renderPolygonList(location) {
  polygonList.innerHTML = (location.map.polygons || [])
    .map(
      (poly) => `
        <div class="polygon-row ${poly.id === selectedPolygonId ? 'selected' : ''}" data-id="${poly.id}">
          <input type="text" value="${escapeHtml(poly.name)}" data-name-for="${poly.id}">
          <span class="state-tag">${poly.revealed ? 'rivelata' : 'nascosta'}</span>
        </div>
      `
    )
    .join('');
}

polygonList.addEventListener('click', (e) => {
  const row = e.target.closest('.polygon-row');
  if (!row || e.target.matches('input')) return;
  mode = 'select';
  toolSelectBtn.classList.add('active');
  toolDrawBtn.classList.remove('active');
  gridAlignToolBtn.classList.remove('active');
  selectedPolygonId = row.dataset.id;
  renderPolygonsSvg();
  renderPolygonList(getActiveLocation());
});

polygonList.addEventListener('change', (e) => {
  const input = e.target.closest('input[data-name-for]');
  if (!input) return;
  socket.emit('polygon:update', {
    locationId: state.activeLocationId,
    polygonId: input.dataset.nameFor,
    name: input.value
  });
});

locationSelect.addEventListener('change', () => {
  selectedPolygonId = null;
  drawingPoints = [];
  editorZoom = 1;
  editorZoomReadout.textContent = '100%';
  mapCanvas.scrollLeft = 0;
  mapCanvas.scrollTop = 0;
  socket.emit('location:set', { locationId: locationSelect.value });
});

bindNumberCommit(mapScaleNum, 25, 1000, (v) => {
  currentMapScale = v / 100;
  updateZoomBox();
  updateOverlayBox();
  socket.emit('mapScale:set', { locationId: state.activeLocationId, scale: v / 100 });
});

gridToggleBtn.addEventListener('click', () => {
  const location = getActiveLocation();
  socket.emit('grid:update', { locationId: location.id, enabled: !location.map.grid.enabled });
});

bindNumberCommit(gridSizeNum, 4, 1000, (v) => {
  socket.emit('grid:update', { locationId: state.activeLocationId, cellSize: v });
});

// While dragging inside the native picker, preview locally only; the server
// commit (and broadcast to display/control) happens once, when the picker closes.
gridColorInput.addEventListener('input', () => {
  getActiveLocation().map.grid.color = gridColorInput.value;
  renderGrid(getActiveLocation());
});

gridColorInput.addEventListener('change', () => {
  socket.emit('grid:update', { locationId: state.activeLocationId, color: gridColorInput.value });
});

bindNumberCommit(gridWidthNum, 0.2, 5, (v) => {
  socket.emit('grid:update', { locationId: state.activeLocationId, lineWidth: v });
});

bindNumberCommit(gridOffsetXNum, -100000, 100000, (v) => {
  socket.emit('grid:update', { locationId: state.activeLocationId, offsetX: v });
});

bindNumberCommit(gridOffsetYNum, -100000, 100000, (v) => {
  socket.emit('grid:update', { locationId: state.activeLocationId, offsetY: v });
});

document.querySelectorAll('[data-grid-move]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const location = getActiveLocation();
    const [dx, dy] = btn.dataset.gridMove.split(',').map(Number);
    const cellSize = location.map.grid.cellSize || 100;
    const step = Math.max(1, Math.round(cellSize * 0.1));
    socket.emit('grid:update', {
      locationId: location.id,
      offsetX: (location.map.grid.offsetX || 0) + dx * step,
      offsetY: (location.map.grid.offsetY || 0) + dy * step
    });
  });
});

gridSavePresetBtn.addEventListener('click', () => {
  socket.emit('gridPreset:save', { locationId: state.activeLocationId });
});

gridApplyPresetBtn.addEventListener('click', () => {
  socket.emit('gridPreset:apply', { locationId: state.activeLocationId });
});

// Un video troppo pesante o ad alta risoluzione può mandare in crash il tab
// che prova a decodificarlo — successo davvero, non solo in teoria. Per non
// dover MAI dipendere dal fatto che l'editor sopravviva a un file del genere,
// lo scartiamo prima ancora di spedirlo al server: se il file non arriva mai
// a diventare la mappa attiva, non c'è niente da cui doversi riprendere.
const MAX_VIDEO_PIXELS = 1920 * 1080;
const MAX_VIDEO_BYTES = 150 * 1024 * 1024;

function checkVideoSafe(file) {
  return new Promise((resolve) => {
    if (file.size > MAX_VIDEO_BYTES) {
      const mb = Math.round(file.size / 1024 / 1024);
      resolve({
        ok: false,
        reason: `video troppo pesante (${mb}MB, limite ${MAX_VIDEO_BYTES / 1024 / 1024}MB) — rischia di bloccare il Raspberry Pi.`
      });
      return;
    }
    const url = URL.createObjectURL(file);
    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.onloadedmetadata = () => {
      const pixels = probe.videoWidth * probe.videoHeight;
      URL.revokeObjectURL(url);
      if (pixels > MAX_VIDEO_PIXELS) {
        resolve({
          ok: false,
          reason: `risoluzione troppo alta (${probe.videoWidth}×${probe.videoHeight}) — massimo consigliato 1920×1080 per il Raspberry Pi.`
        });
      } else {
        resolve({ ok: true });
      }
    };
    probe.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ ok: false, reason: 'video non leggibile: file non valido o formato non supportato dal browser.' });
    };
    probe.src = url;
  });
}

mapUpload.addEventListener('change', async () => {
  const file = mapUpload.files[0];
  if (!file) return;
  mapUploadWarning.hidden = true;

  if (isVideoFile(file.name)) {
    const check = await checkVideoSafe(file);
    if (!check.ok) {
      mapUploadWarning.textContent = `Upload bloccato: ${check.reason}`;
      mapUploadWarning.hidden = false;
      mapUpload.value = '';
      return;
    }
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('locationId', locationSelect.value);
  await fetch('/api/upload/map', { method: 'POST', body: formData });
  mapUpload.value = '';
});

// Stesso pattern arma-poi-conferma del cancella-poligono: un click arma, il
// secondo entro 2.5s conferma. Chiama /api/map/clear invece del socket
// perché deve funzionare anche come via di fuga totalmente indipendente dal
// fatto che la mappa corrente riesca a essere renderizzata.
let removeMapArmed = false;
let removeMapArmTimeout = null;

function resetRemoveMapArm() {
  removeMapArmed = false;
  clearTimeout(removeMapArmTimeout);
  removeMapBtn.classList.remove('confirm');
  removeMapBtn.title = 'Rimuovi mappa';
}

removeMapBtn.addEventListener('click', async () => {
  if (!removeMapArmed) {
    removeMapArmed = true;
    removeMapBtn.classList.add('confirm');
    removeMapBtn.title = 'Click di nuovo per confermare';
    clearTimeout(removeMapArmTimeout);
    removeMapArmTimeout = setTimeout(resetRemoveMapArm, 2500);
    return;
  }
  resetRemoveMapArm();
  mapUploadWarning.hidden = true;
  await fetch('/api/map/clear', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ locationId: state.activeLocationId })
  });
});

// Same arm-then-confirm pattern as the polygon delete button, but per-row: rows
// are torn down and rebuilt on every render, so the "armed" set lives outside
// the DOM and is consulted again each time the list redraws.
const armedImageDeletes = new Set();
const imageDeleteTimers = new Map();

function renderImageList(location) {
  const images = location.images || [];
  if (!images.length) {
    imageList.innerHTML = '<p class="hint">nessuna immagine per questa location</p>';
    return;
  }
  imageList.innerHTML = images
    .map((img) => {
      const armed = armedImageDeletes.has(img.id);
      return `
        <div class="image-editor-row" data-id="${img.id}">
          <button class="image-thumb-btn" data-preview="${img.id}" title="Anteprima a schermo intero">
            <img src="/storage/images/${img.file}" alt="${escapeHtml(img.name)}">
            <svg class="icon thumb-overlay-icon"><use href="#i-expand"></use></svg>
          </button>
          <input type="text" class="image-name-input" value="${escapeHtml(img.name)}"
                 data-name-for="${img.id}" placeholder="etichetta">
          <button class="icon-btn image-delete ${armed ? 'confirm' : ''}" data-delete="${img.id}"
                  title="${armed ? 'Click di nuovo per confermare' : 'Elimina immagine'}">
            <svg class="icon"><use href="#i-trash"></use></svg>
          </button>
        </div>
      `;
    })
    .join('');
}

imageList.addEventListener('click', (e) => {
  const previewBtn = e.target.closest('[data-preview]');
  if (previewBtn) {
    const image = (getActiveLocation().images || []).find((i) => i.id === previewBtn.dataset.preview);
    if (image) openLightbox(image);
    return;
  }

  const deleteBtn = e.target.closest('[data-delete]');
  if (deleteBtn) {
    const imageId = deleteBtn.dataset.delete;
    if (!armedImageDeletes.has(imageId)) {
      armedImageDeletes.add(imageId);
      renderImageList(getActiveLocation());
      clearTimeout(imageDeleteTimers.get(imageId));
      imageDeleteTimers.set(
        imageId,
        setTimeout(() => {
          armedImageDeletes.delete(imageId);
          renderImageList(getActiveLocation());
        }, 2500)
      );
      return;
    }
    clearTimeout(imageDeleteTimers.get(imageId));
    armedImageDeletes.delete(imageId);
    socket.emit('image:delete', { locationId: state.activeLocationId, imageId });
  }
});

imageList.addEventListener('change', (e) => {
  const input = e.target.closest('input[data-name-for]');
  if (!input) return;
  socket.emit('image:rename', {
    locationId: state.activeLocationId,
    imageId: input.dataset.nameFor,
    name: input.value
  });
});

imageList.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('input[data-name-for]')) e.target.blur();
});

function openLightbox(image) {
  lightboxImg.src = `/storage/images/${image.file}`;
  lightboxImg.alt = image.name || '';
  lightboxCaption.textContent = image.name || '';
  lightbox.hidden = false;
}

function closeLightbox() {
  lightbox.hidden = true;
  lightboxImg.removeAttribute('src');
}

lightboxCloseBtn.addEventListener('click', closeLightbox);
lightbox.addEventListener('click', (e) => {
  if (e.target === lightbox) closeLightbox();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !lightbox.hidden) closeLightbox();
});

imageUpload.addEventListener('change', async () => {
  const file = imageUpload.files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append('file', file);
  formData.append('locationId', locationSelect.value);
  formData.append('name', file.name);
  await fetch('/api/upload/image', { method: 'POST', body: formData });
  imageUpload.value = '';
});

locationCreateBtn.addEventListener('click', () => {
  socket.emit('location:create', {});
});

// Stesso pattern arma-poi-conferma dell'eliminazione immagini, per riga (le
// righe vengono ricostruite a ogni render, quindi lo stato "armato" vive
// fuori dal DOM).
const armedLocationArchives = new Set();
const locationArchiveTimers = new Map();

function renderLocationPanel() {
  const active = state.locations.filter((l) => !l.archived);
  const archived = state.locations.filter((l) => l.archived);

  locationList.innerHTML = active
    .map((l) => {
      const armed = armedLocationArchives.has(l.id);
      return `
        <div class="image-editor-row" data-id="${l.id}">
          <button class="icon-btn ${l.isDefault ? 'starred' : ''}" data-default="${l.id}"
                  title="${l.isDefault ? 'Location predefinita all’avvio' : 'Imposta come predefinita all’avvio'}">
            <svg class="icon"><use href="#i-star"></use></svg>
          </button>
          <input type="text" class="image-name-input" value="${escapeHtml(l.name)}" data-name-for="${l.id}" placeholder="nome location">
          <button class="icon-btn image-delete ${armed ? 'confirm' : ''}" data-archive="${l.id}"
                  title="${armed ? 'Click di nuovo per confermare' : 'Archivia location'}">
            <svg class="icon"><use href="#i-trash"></use></svg>
          </button>
        </div>
      `;
    })
    .join('');

  locationArchivedWrap.hidden = archived.length === 0;
  locationArchivedList.innerHTML = archived
    .map(
      (l) => `
        <div class="image-editor-row" data-id="${l.id}">
          <input type="text" class="image-name-input" value="${escapeHtml(l.name)}" data-name-for="${l.id}" placeholder="nome location">
          <button class="icon-btn" data-restore="${l.id}" title="Ripristina location">
            <svg class="icon"><use href="#i-rotate"></use></svg>
          </button>
        </div>
      `
    )
    .join('');
}

locationList.addEventListener('click', (e) => {
  const defaultBtn = e.target.closest('[data-default]');
  if (defaultBtn) {
    socket.emit('location:setDefault', { locationId: defaultBtn.dataset.default });
    return;
  }

  const archiveBtn = e.target.closest('[data-archive]');
  if (archiveBtn) {
    const locationId = archiveBtn.dataset.archive;
    if (!armedLocationArchives.has(locationId)) {
      armedLocationArchives.add(locationId);
      renderLocationPanel();
      clearTimeout(locationArchiveTimers.get(locationId));
      locationArchiveTimers.set(
        locationId,
        setTimeout(() => {
          armedLocationArchives.delete(locationId);
          renderLocationPanel();
        }, 2500)
      );
      return;
    }
    clearTimeout(locationArchiveTimers.get(locationId));
    armedLocationArchives.delete(locationId);
    socket.emit('location:archive', { locationId });
  }
});

locationList.addEventListener('change', (e) => {
  const input = e.target.closest('input[data-name-for]');
  if (!input) return;
  socket.emit('location:rename', { locationId: input.dataset.nameFor, name: input.value });
});

locationList.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('input[data-name-for]')) e.target.blur();
});

locationArchivedList.addEventListener('click', (e) => {
  const restoreBtn = e.target.closest('[data-restore]');
  if (restoreBtn) socket.emit('location:restore', { locationId: restoreBtn.dataset.restore });
});

locationArchivedList.addEventListener('change', (e) => {
  const input = e.target.closest('input[data-name-for]');
  if (!input) return;
  socket.emit('location:rename', { locationId: input.dataset.nameFor, name: input.value });
});

locationArchivedList.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('input[data-name-for]')) e.target.blur();
});

const orphansScanBtn = document.getElementById('orphans-scan-btn');
const orphansPanel = document.getElementById('orphans-panel');
const orphansList = document.getElementById('orphans-list');
const orphansPurgeBtn = document.getElementById('orphans-purge-btn');

let orphansFound = [];
let orphansPurgeArmed = false;
let orphansPurgeTimeout = null;

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  return `${Math.round(bytes / 1024)}KB`;
}

orphansScanBtn.addEventListener('click', async () => {
  const res = await fetch('/api/storage/orphans/scan', { method: 'POST' });
  const data = await res.json();
  orphansFound = data.orphans || [];
  orphansPanel.hidden = false;
  orphansPurgeBtn.hidden = orphansFound.length === 0;
  orphansPurgeArmed = false;
  orphansPurgeBtn.classList.remove('confirm');
  orphansPurgeBtn.textContent = 'conferma cancellazione';
  orphansList.innerHTML = orphansFound.length
    ? orphansFound.map((o) => `<div>${escapeHtml(o.file)} (${o.kind}, ${formatBytes(o.size)})</div>`).join('')
    : 'nessun file orfano trovato.';
});

orphansPurgeBtn.addEventListener('click', async () => {
  if (!orphansPurgeArmed) {
    orphansPurgeArmed = true;
    orphansPurgeBtn.classList.add('confirm');
    orphansPurgeBtn.textContent = 'click di nuovo per confermare';
    clearTimeout(orphansPurgeTimeout);
    orphansPurgeTimeout = setTimeout(() => {
      orphansPurgeArmed = false;
      orphansPurgeBtn.classList.remove('confirm');
      orphansPurgeBtn.textContent = 'conferma cancellazione';
    }, 2500);
    return;
  }
  clearTimeout(orphansPurgeTimeout);
  const res = await fetch('/api/storage/orphans/purge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files: orphansFound.map(({ file, kind }) => ({ file, kind })) })
  });
  const data = await res.json();
  orphansFound = [];
  orphansPurgeArmed = false;
  orphansPurgeBtn.hidden = true;
  orphansPurgeBtn.classList.remove('confirm');
  orphansList.innerHTML = `cancellati ${data.deleted.length} file.`;
});
