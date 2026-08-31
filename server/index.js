require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const { nanoid } = require('nanoid');
const { loadState, saveState, applyStartupDefault, DEFAULT_GRID } = require('./state');

const PORT = process.env.PORT || 3000;
const STORAGE_DIR = process.env.STORAGE_DIR || path.join(__dirname, '..', 'storage');
const MAPS_DIR = path.join(STORAGE_DIR, 'maps');
const IMAGES_DIR = path.join(STORAGE_DIR, 'images');

for (const dir of [MAPS_DIR, IMAGES_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

let state = applyStartupDefault(loadState());

function getActiveLocation() {
  return state.locations.find((l) => l.id === state.activeLocationId);
}

const app = express();
app.use(express.json());
app.use('/storage', express.static(STORAGE_DIR));
app.use('/display', express.static(path.join(__dirname, '..', 'public', 'display')));
app.use('/control', express.static(path.join(__dirname, '..', 'public', 'control')));
app.use('/editor', express.static(path.join(__dirname, '..', 'public', 'editor')));
app.use('/shared', express.static(path.join(__dirname, '..', 'public', 'shared')));

app.get('/', (req, res) => {
  res.send(
    '<p>Anime VTT server attivo.</p><ul>' +
      '<li><a href="/display">/display</a> — vista TV</li>' +
      '<li><a href="/control">/control</a> — controllo da smartphone</li>' +
      '<li><a href="/editor">/editor</a> — editor da PC</li>' +
      '</ul>'
  );
});

app.get('/api/state', (req, res) => {
  res.json(state);
});

function makeUpload(destDir, { allowVideo = false, maxFileSize = 50 * 1024 * 1024 } = {}) {
  return multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, destDir),
      filename: (req, file, cb) => cb(null, `${nanoid()}${path.extname(file.originalname)}`)
    }),
    limits: { fileSize: maxFileSize },
    fileFilter: (req, file, cb) => {
      const ok = /^image\//.test(file.mimetype) || (allowVideo && /^video\//.test(file.mimetype));
      cb(null, ok);
    }
  });
}

// Le mappe possono essere anche video (usati come sfondo animato in loop, muto);
// un tetto più alto perché un video anche breve pesa molto più di un'immagine.
const uploadMap = makeUpload(MAPS_DIR, { allowVideo: true, maxFileSize: 300 * 1024 * 1024 });
const uploadImage = makeUpload(IMAGES_DIR);

/**
 * Removes an uploaded file from disk, but only if it genuinely resolves inside
 * `dir` — a stored filename must never be able to reach outside its own folder.
 * A missing file is not an error: the state entry is what the user asked to
 * remove, and an orphaned reference should still clean up silently.
 */
function deleteUploadedFile(dir, filename) {
  if (!filename) return;
  const target = path.resolve(dir, filename);
  if (path.dirname(target) !== path.resolve(dir)) return;
  try {
    fs.unlinkSync(target);
  } catch (err) {
    if (err.code !== 'ENOENT') console.error(`Impossibile eliminare ${target}:`, err.message);
  }
}

app.post('/api/upload/map', uploadMap.single('file'), (req, res) => {
  const location = state.locations.find((l) => l.id === req.body.locationId);
  if (!location || !req.file) {
    return res.status(400).json({ error: 'location o file mancante' });
  }
  location.map.file = req.file.filename;
  saveState(state);
  broadcastState();
  res.json({ ok: true, file: req.file.filename });
});

// Via di fuga indipendente dal browser: se una mappa (tipicamente un video
// troppo pesante) manda in crash editor/display/controllo, questo endpoint
// resetta la mappa attiva senza che nessun client debba prima riuscire a
// caricarla. Richiamabile anche da un semplice curl da terminale:
//   curl -X POST http://localhost:3000/api/map/clear -H "Content-Type: application/json" -d '{"locationId":"taverna"}'
app.post('/api/map/clear', (req, res) => {
  const location = state.locations.find((l) => l.id === req.body.locationId);
  if (!location) {
    return res.status(400).json({ error: 'location mancante' });
  }
  location.map.file = null;
  saveState(state);
  broadcastState();
  res.json({ ok: true });
});

app.post('/api/upload/image', uploadImage.single('file'), (req, res) => {
  const location = state.locations.find((l) => l.id === req.body.locationId);
  if (!location || !req.file) {
    return res.status(400).json({ error: 'location o file mancante' });
  }
  location.images.push({
    id: nanoid(),
    name: req.body.name || req.file.originalname,
    file: req.file.filename
  });
  saveState(state);
  broadcastState();
  res.json({ ok: true, file: req.file.filename });
});

const server = http.createServer(app);
const io = new Server(server);

const controlSockets = new Set();

function broadcastState() {
  io.emit('state:update', state);
}

function broadcastControlStatus() {
  io.emit('control:status', { connected: controlSockets.size > 0 });
}

io.on('connection', (socket) => {
  socket.emit('state:update', state);
  socket.emit('control:status', { connected: controlSockets.size > 0 });

  socket.on('hello', ({ role }) => {
    if (role === 'control') {
      controlSockets.add(socket.id);
      broadcastControlStatus();
    }
  });

  socket.on('location:set', ({ locationId }) => {
    if (!state.locations.some((l) => l.id === locationId)) return;
    state.activeLocationId = locationId;
    state.activeImageId = null;
    state.liveView = { scale: 1, offsetX: 0, offsetY: 0 };
    saveState(state);
    broadcastState();
  });

  socket.on('location:create', () => {
    const location = {
      id: nanoid(),
      name: 'Nuova location',
      map: {
        file: null,
        type: 'image',
        scale: 1,
        flip180: false,
        grid: { ...DEFAULT_GRID },
        polygons: []
      },
      images: [],
      archived: false,
      isDefault: false
    };
    state.locations.push(location);
    state.activeLocationId = location.id;
    state.activeImageId = null;
    state.liveView = { scale: 1, offsetX: 0, offsetY: 0 };
    saveState(state);
    broadcastState();
  });

  socket.on('location:rename', ({ locationId, name }) => {
    const location = state.locations.find((l) => l.id === locationId);
    if (!location) return;
    location.name = String(name || '').slice(0, 120);
    saveState(state);
    broadcastState();
  });

  socket.on('location:archive', ({ locationId }) => {
    const location = state.locations.find((l) => l.id === locationId);
    if (!location) return;
    location.archived = true;
    if (state.activeLocationId === locationId) state.activeLocationId = null;
    saveState(state);
    broadcastState();
  });

  socket.on('location:restore', ({ locationId }) => {
    const location = state.locations.find((l) => l.id === locationId);
    if (!location) return;
    location.archived = false;
    saveState(state);
    broadcastState();
  });

  socket.on('location:setDefault', ({ locationId }) => {
    if (!state.locations.some((l) => l.id === locationId)) return;
    state.locations.forEach((l) => { l.isDefault = l.id === locationId; });
    saveState(state);
    broadcastState();
  });

  socket.on('fow:toggle', ({ polygonId }) => {
    const location = getActiveLocation();
    const polygon = location?.map.polygons.find((p) => p.id === polygonId);
    if (!polygon) return;
    polygon.revealed = !polygon.revealed;
    saveState(state);
    broadcastState();
  });

  socket.on('image:show', ({ imageId }) => {
    const location = getActiveLocation();
    if (!location?.images.some((i) => i.id === imageId)) return;
    state.activeImageId = imageId;
    broadcastState();
  });

  socket.on('image:hide', () => {
    state.activeImageId = null;
    broadcastState();
  });

  socket.on('image:rename', ({ locationId, imageId, name }) => {
    const location = state.locations.find((l) => l.id === locationId);
    const image = location?.images.find((i) => i.id === imageId);
    if (!image) return;
    image.name = String(name || '').slice(0, 120);
    saveState(state);
    broadcastState();
  });

  socket.on('image:delete', ({ locationId, imageId }) => {
    const location = state.locations.find((l) => l.id === locationId);
    const image = location?.images.find((i) => i.id === imageId);
    if (!image) return;

    location.images = location.images.filter((i) => i.id !== imageId);
    if (state.activeImageId === imageId) state.activeImageId = null;
    deleteUploadedFile(IMAGES_DIR, image.file);

    saveState(state);
    broadcastState();
  });

  socket.on('view:pan', ({ dx, dy }) => {
    state.liveView.offsetX += dx;
    state.liveView.offsetY += dy;
    broadcastState();
  });

  socket.on('view:zoom', ({ scale }) => {
    state.liveView.scale = scale;
    broadcastState();
  });

  socket.on('view:reset', () => {
    state.liveView = { scale: 1, offsetX: 0, offsetY: 0 };
    broadcastState();
  });

  socket.on('polygon:create', ({ locationId, name, points }) => {
    const location = state.locations.find((l) => l.id === locationId);
    if (!location || !Array.isArray(points) || points.length < 3) return;
    location.map.polygons.push({ id: nanoid(), name: name || 'nuova area', points, revealed: false });
    saveState(state);
    broadcastState();
  });

  socket.on('polygon:update', ({ locationId, polygonId, points, name }) => {
    const location = state.locations.find((l) => l.id === locationId);
    const polygon = location?.map.polygons.find((p) => p.id === polygonId);
    if (!polygon) return;
    if (points) polygon.points = points;
    if (name !== undefined) polygon.name = name;
    saveState(state);
    broadcastState();
  });

  socket.on('polygon:delete', ({ locationId, polygonId }) => {
    const location = state.locations.find((l) => l.id === locationId);
    if (!location) return;
    location.map.polygons = location.map.polygons.filter((p) => p.id !== polygonId);
    saveState(state);
    broadcastState();
  });

  socket.on('mapScale:set', ({ locationId, scale }) => {
    const location = state.locations.find((l) => l.id === locationId);
    if (!location) return;
    location.map.scale = scale;
    saveState(state);
    broadcastState();
  });

  socket.on('mapFlip:toggle', ({ locationId }) => {
    const location = state.locations.find((l) => l.id === locationId);
    if (!location) return;
    location.map.flip180 = !location.map.flip180;
    saveState(state);
    broadcastState();
  });

  socket.on('grid:update', ({ locationId, enabled, cellSize, offsetX, offsetY, color, lineWidth }) => {
    const location = state.locations.find((l) => l.id === locationId);
    if (!location) return;
    if (enabled !== undefined) location.map.grid.enabled = enabled;
    if (cellSize !== undefined) location.map.grid.cellSize = cellSize;
    if (offsetX !== undefined) location.map.grid.offsetX = offsetX;
    if (offsetY !== undefined) location.map.grid.offsetY = offsetY;
    if (color !== undefined) location.map.grid.color = color;
    if (lineWidth !== undefined) location.map.grid.lineWidth = lineWidth;
    saveState(state);
    broadcastState();
  });

  socket.on('gridPreset:save', ({ locationId }) => {
    const location = state.locations.find((l) => l.id === locationId);
    if (!location) return;
    state.gridPreset = {
      cellSize: location.map.grid.cellSize,
      offsetX: location.map.grid.offsetX,
      offsetY: location.map.grid.offsetY,
      color: location.map.grid.color,
      lineWidth: location.map.grid.lineWidth
    };
    saveState(state);
    broadcastState();
  });

  socket.on('gridPreset:apply', ({ locationId }) => {
    const location = state.locations.find((l) => l.id === locationId);
    if (!location || !state.gridPreset) return;
    location.map.grid.cellSize = state.gridPreset.cellSize;
    location.map.grid.offsetX = state.gridPreset.offsetX;
    location.map.grid.offsetY = state.gridPreset.offsetY;
    location.map.grid.color = state.gridPreset.color;
    location.map.grid.lineWidth = state.gridPreset.lineWidth;
    saveState(state);
    broadcastState();
  });

  socket.on('disconnect', () => {
    controlSockets.delete(socket.id);
    broadcastControlStatus();
  });
});

server.listen(PORT, () => {
  console.log(`Anime VTT in ascolto su http://localhost:${PORT}`);
});
