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

let socketConnected = false;
let controlConnected = false;
let lastState = null;

function updateWifi() {
  const ok = socketConnected && controlConnected;
  wifiDot.classList.toggle('ok', ok);
  wifiDot.classList.toggle('bad', !ok);
}

socket.on('connect', () => {
  socketConnected = true;
  socket.emit('hello', { role: 'display' });
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

  if (showingImage) {
    renderImage(location, state.activeImageId);
  } else {
    renderMap(state, location);
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

function renderMap(state, location) {
  const live = state.liveView || { scale: 1, offsetX: 0, offsetY: 0 };
  const mapScale = (location && location.map.scale) || 1;

  const scale = mapScale * (live.scale || 1);
  const offsetX = live.offsetX || 0;
  const offsetY = live.offsetY || 0;
  mapLayer.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;

  const polygons = (location && location.map.polygons) || [];

  if (location && location.map.file) {
    mapPlaceholder.hidden = true;
    activeMapEl = loadMapMedia(mapImg, mapVideo, location.map.file, `/storage/maps/${location.map.file}`, () => {
      const nw = mediaW(activeMapEl);
      const nh = mediaH(activeMapEl);
      const rotation = computeTotalRotation(nw, nh, location.map.flip180);
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
