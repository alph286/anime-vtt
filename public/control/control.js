const socket = io();
let state = null;
let fogOpacity = 0.45;
let fowListVisible = false;

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
const toggleFowListBtn = document.getElementById('toggle-fow-list');
const fowList = document.getElementById('fow-list');
const imagesList = document.getElementById('images-list');
const backToMapBtn = document.getElementById('back-to-map');
const panZoomSection = document.getElementById('pan-zoom-section');
const zoomRange = document.getElementById('zoom-range');

socket.on('connect', () => socket.emit('hello', { role: 'control' }));
socket.on('state:update', (s) => {
  state = s;
  render();
});

function getActiveLocation() {
  return state.locations.find((l) => l.id === state.activeLocationId);
}

function render() {
  const location = getActiveLocation();
  const showingImage = Boolean(state.activeImageId);

  locationSelect.innerHTML = state.locations
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
      const rotation = computeTotalRotation(nw, nh, location.map.flip180);
      const effective = layoutMapWrap(mapPreview, mapMediaWrap, rotation);
      const rect = fitRect(effective.width, effective.height, nw, nh);
      positionFitBox(mapFitBox, rect);
      renderFogOverlays(polygons);
    });
  } else {
    mapImg.hidden = true;
    mapVideo.hidden = true;
    mapPlaceholder.hidden = false;
    const effective = layoutMapWrap(mapPreview, mapMediaWrap, 0);
    positionFitBox(mapFitBox, { left: 0, top: 0, width: effective.width, height: effective.height });
    renderFogOverlays(polygons);
  }
}

locationSelect.addEventListener('change', () => {
  socket.emit('location:set', { locationId: locationSelect.value });
});

mapFogLayer.addEventListener('click', (e) => {
  const overlay = e.target.closest('.fog-overlay');
  if (overlay) socket.emit('fow:toggle', { polygonId: overlay.dataset.id });
});

fogOpacityInput.addEventListener('input', () => {
  fogOpacity = Number(fogOpacityInput.value) / 100;
  if (state) renderMapPreview(getActiveLocation());
});

toggleFowListBtn.addEventListener('click', () => {
  fowListVisible = !fowListVisible;
  fowList.hidden = !fowListVisible;
  toggleFowListBtn.textContent = fowListVisible ? 'nascondi elenco testuale' : 'mostra elenco testuale';
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
