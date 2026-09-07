require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const { nanoid } = require('nanoid');
const { loadState, saveState, migrate, applyStartupDefault, DEFAULT_GRID, DEFAULT_COMPASS, DATA_DIR } = require('./state');
const picsender = require('./picsender');
const tar = require('tar-stream');
const exportImport = require('./exportImport');

const PORT = process.env.PORT || 3000;
const STORAGE_DIR = process.env.STORAGE_DIR || path.join(__dirname, '..', 'storage');
const MAPS_DIR = path.join(STORAGE_DIR, 'maps');
const IMAGES_DIR = path.join(STORAGE_DIR, 'images');
const IMPORTS_DIR = path.join(DATA_DIR, 'imports');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');

for (const dir of [MAPS_DIR, IMAGES_DIR, IMPORTS_DIR, BACKUPS_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

// Nessun token di importazione in sospeso può essere ancora valido dopo un
// riavvio (vive solo in memoria nel browser che ha caricato il file): ripulisci
// eventuali file temporanei rimasti da una sessione precedente.
fs.readdirSync(IMPORTS_DIR).forEach((f) => {
  try { fs.unlinkSync(path.join(IMPORTS_DIR, f)); } catch (err) { /* best effort */ }
});

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
app.use('/home', express.static(path.join(__dirname, '..', 'public', 'home')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'home', 'index.html'));
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

function resolveImportPath(token) {
  if (!token || typeof token !== 'string') return null;
  const target = path.resolve(IMPORTS_DIR, token);
  if (path.dirname(target) !== path.resolve(IMPORTS_DIR)) return null;
  return target;
}

// Un file è orfano solo se NESSUNA location — attiva o archiviata — lo
// referenzia più. Pensata per essere raggiunta raramente e con calma:
// separata dall'archiviazione, mai un "elimina tutto" a un click.
function findOrphanFiles() {
  const referencedMaps = new Set();
  const referencedImages = new Set();
  state.locations.forEach((location) => {
    if (location.map.file) referencedMaps.add(location.map.file);
    (location.images || []).forEach((img) => referencedImages.add(img.file));
  });

  const scanDir = (dir, referenced, kind) =>
    fs.readdirSync(dir)
      .filter((name) => !referenced.has(name))
      .map((name) => ({ dir, name, kind, size: fs.statSync(path.join(dir, name)).size }));

  return [...scanDir(MAPS_DIR, referencedMaps, 'maps'), ...scanDir(IMAGES_DIR, referencedImages, 'images')];
}

app.post('/api/storage/orphans/scan', (req, res) => {
  const orphans = findOrphanFiles().map(({ name, kind, size }) => ({ file: name, kind, size }));
  res.json({ orphans });
});

app.post('/api/storage/orphans/purge', (req, res) => {
  const requested = Array.isArray(req.body.files) ? req.body.files : [];
  // Ri-verifica al momento della cancellazione (non fidarsi della lista che
  // arriva dal client): se nel frattempo un file è tornato referenziato, non
  // va toccato.
  const stillOrphan = findOrphanFiles().filter((f) =>
    requested.some((r) => r.file === f.name && r.kind === f.kind)
  );
  const deleted = stillOrphan.map(({ dir, name, kind }) => {
    deleteUploadedFile(dir, name);
    return { file: name, kind };
  });
  res.json({ deleted });
});

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
    file: req.file.filename,
    caption: '',
    telegramDestination: null
  });
  saveState(state);
  broadcastState();
  res.json({ ok: true, file: req.file.filename });
});

app.get('/api/telegram/destinations', async (req, res) => {
  try {
    const destinations = await picsender.getDestinations();
    res.json(destinations);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get('/api/export/location/:id', (req, res) => {
  const location = state.locations.find((l) => l.id === req.params.id);
  if (!location) return res.status(404).json({ error: 'location non trovata' });
  const pack = tar.pack();
  pack.on('error', (err) => { console.error('Export location fallito (pack):', err.message); });
  const safeName = (location.name || 'location').replace(/[^\w\-. ]/g, '').trim() || 'location';
  res.setHeader('Content-Type', 'application/x-tar');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}.vttlocation"`);
  pack.pipe(res);
  exportImport.writeLocationArchive(pack, location, MAPS_DIR, IMAGES_DIR).catch((err) => {
    console.error('Export location fallito:', err.message);
    res.destroy();
  });
});

app.get('/api/export/backup', (req, res) => {
  const pack = tar.pack();
  pack.on('error', (err) => { console.error('Export backup fallito (pack):', err.message); });
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/x-tar');
  res.setHeader('Content-Disposition', `attachment; filename="backup-${date}.vttbackup"`);
  pack.pipe(res);
  exportImport.writeBackupArchive(pack, state, MAPS_DIR, IMAGES_DIR).catch((err) => {
    console.error('Export backup fallito:', err.message);
    res.destroy();
  });
});

const uploadImportFile = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, IMPORTS_DIR),
    filename: (req, file, cb) => cb(null, `${nanoid()}.tar`)
  }),
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }
});

app.post('/api/import/inspect', uploadImportFile.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file mancante' });
  try {
    const result = await exportImport.inspectImport(req.file.path);
    res.json({ token: req.file.filename, kind: result.kind, summary: result.summary });
  } catch (err) {
    fs.unlink(req.file.path, () => {});
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/import/cancel', (req, res) => {
  const filePath = resolveImportPath(req.body.token);
  if (filePath) fs.unlink(filePath, () => {});
  res.json({ ok: true });
});

app.post('/api/import/apply', async (req, res) => {
  const filePath = resolveImportPath(req.body.token);
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(400).json({ error: 'Importazione scaduta o non trovata: ricarica il file.' });
  }
  try {
    const manifest = await exportImport.readManifest(filePath);
    if (manifest.kind === 'location') {
      const newLocation = await exportImport.applyLocationImport(filePath, manifest, MAPS_DIR, IMAGES_DIR);
      state.locations.push(newLocation);
      // Un archivio esportato prima che un campo esistesse (es. map.compass)
      // reintroduce una location "legacy" nello stato vivo: senza migrate()
      // resterebbe senza quel campo -- e quindi coi controlli muti -- fino al
      // prossimo riavvio del server, l'unico momento in cui loadState()
      // ri-esegue la migrazione.
      migrate(state);
      saveState(state);
      broadcastState();
      res.json({ ok: true, kind: 'location', name: newLocation.name });
    } else if (manifest.kind === 'backup') {
      const oldMapFiles = new Set();
      const oldImageFiles = new Set();
      state.locations.forEach((l) => {
        if (l.map.file) oldMapFiles.add(l.map.file);
        (l.images || []).forEach((img) => oldImageFiles.add(img.file));
      });

      await exportImport.saveSafetySnapshot(state, MAPS_DIR, IMAGES_DIR, BACKUPS_DIR);
      const restored = await exportImport.applyBackupRestore(filePath, manifest, MAPS_DIR, IMAGES_DIR);

      // Lo stato nuovo va costruito a parte e salvato PRIMA di diventare quello
      // vivo: se saveState fallisce (disco pieno, permessi), `state` -- letto da
      // ogni richiesta -- non è stato toccato, altrimenti il server servirebbe i
      // dati del backup pur avendo risposto errore, e il primo saveState(state)
      // successivo (da un'azione qualunque) renderebbe definitivo un ripristino
      // mai confermato.
      const candidate = { ...state, locations: restored.locations, campaign: restored.campaign, gridPreset: restored.gridPreset };
      // Stesso motivo del ramo 'location': un backup più vecchio dei campi
      // aggiunti dopo va migrato subito, non al prossimo riavvio.
      migrate(candidate);
      applyStartupDefault(candidate);
      saveState(candidate);
      state = candidate;

      oldMapFiles.forEach((f) => deleteUploadedFile(MAPS_DIR, f));
      oldImageFiles.forEach((f) => deleteUploadedFile(IMAGES_DIR, f));

      broadcastState();
      res.json({ ok: true, kind: 'backup', locationCount: state.locations.length });
    } else {
      res.status(400).json({ error: `Tipo di file sconosciuto: "${manifest.kind}"` });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    fs.unlink(filePath, () => {});
  }
});

const server = http.createServer(app);
const io = new Server(server);

const controlSockets = new Set();
const displaySockets = new Set();
// Dimensioni del viewport della TV, riportate da display.js — servono a
// control.js per calcolare il rettangolo di inquadratura live. Deliberatamente
// NON dentro `state`: non va mai persistita (saveState() serializza solo
// `state`), si ri-popola da sé alla riconnessione del display.
let displayViewport = null;

function broadcastState() {
  io.emit('state:update', { ...state, displayViewport });
}

function broadcastControlStatus() {
  io.emit('control:status', { connected: controlSockets.size > 0 });
}

function broadcastDisplayStatus() {
  io.emit('display:status', { connected: displaySockets.size > 0 });
}

io.on('connection', (socket) => {
  socket.emit('state:update', { ...state, displayViewport });
  socket.emit('control:status', { connected: controlSockets.size > 0 });
  socket.emit('display:status', { connected: displaySockets.size > 0 });

  socket.on('hello', ({ role }) => {
    if (role === 'control') {
      controlSockets.add(socket.id);
      broadcastControlStatus();
    } else if (role === 'display') {
      displaySockets.add(socket.id);
      broadcastDisplayStatus();
    }
  });

  socket.on('display:viewport', ({ width, height }) => {
    displayViewport = { width, height };
    broadcastState();
  });

  socket.on('location:set', ({ locationId }) => {
    if (!state.locations.some((l) => l.id === locationId)) return;
    state.activeLocationId = locationId;
    state.activeImageId = null;
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
        rotate90: false,
        liveView: { scale: 1, offsetX: 0, offsetY: 0 },
        grid: { ...DEFAULT_GRID },
        compass: { ...DEFAULT_COMPASS },
        polygons: []
      },
      images: [],
      archived: false,
      isDefault: false
    };
    state.locations.push(location);
    state.activeLocationId = location.id;
    state.activeImageId = null;
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

  socket.on('location:delete', ({ locationId }) => {
    const location = state.locations.find((l) => l.id === locationId);
    if (!location || !location.archived) return;
    state.locations = state.locations.filter((l) => l.id !== locationId);
    saveState(state);
    broadcastState();
  });

  socket.on('location:setDefault', ({ locationId }) => {
    if (!state.locations.some((l) => l.id === locationId)) return;
    state.locations.forEach((l) => { l.isDefault = l.id === locationId; });
    saveState(state);
    broadcastState();
  });

  socket.on('location:reorder', ({ orderedIds }) => {
    if (!Array.isArray(orderedIds)) {
      socket.emit('state:update', { ...state, displayViewport });
      return;
    }
    const activeIds = state.locations.filter((l) => !l.archived).map((l) => l.id);
    const activeSet = new Set(activeIds);
    const seen = new Set();
    const validOrder = orderedIds.filter((id) => {
      if (!activeSet.has(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    if (validOrder.length !== activeIds.length) {
      socket.emit('state:update', { ...state, displayViewport });
      return;
    }
    const byId = new Map(state.locations.map((l) => [l.id, l]));
    const reorderedActive = validOrder.map((id) => byId.get(id));
    const archivedInPlace = state.locations.filter((l) => l.archived);
    state.locations = [...reorderedActive, ...archivedInPlace];
    saveState(state);
    broadcastState();
  });

  socket.on('fow:toggle', ({ locationId, polygonId }) => {
    const location = state.locations.find((l) => l.id === locationId);
    const polygon = location?.map.polygons.find((p) => p.id === polygonId);
    if (!polygon) return;
    polygon.revealed = !polygon.revealed;
    saveState(state);
    broadcastState();
  });

  socket.on('fow:setAll', ({ locationId, revealed }) => {
    const location = state.locations.find((l) => l.id === locationId);
    if (!location) return;
    (location.map.polygons || []).forEach((p) => { p.revealed = Boolean(revealed); });
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

  socket.on('image:caption', ({ locationId, imageId, caption }) => {
    const location = state.locations.find((l) => l.id === locationId);
    const image = location?.images.find((i) => i.id === imageId);
    if (!image) return;
    image.caption = String(caption || '').slice(0, 1024); // limite didascalia di Telegram
    saveState(state);
    broadcastState();
  });

  socket.on('image:destination', ({ locationId, imageId, destination }) => {
    const location = state.locations.find((l) => l.id === locationId);
    const image = location?.images.find((i) => i.id === imageId);
    if (!image) return;
    image.telegramDestination = destination || null;
    saveState(state);
    broadcastState();
  });

  socket.on('image:sendTelegram', async ({ locationId, imageId }) => {
    const location = state.locations.find((l) => l.id === locationId);
    const image = location?.images.find((i) => i.id === imageId);
    if (!image) {
      socket.emit('telegram:sendResult', { imageId, ok: false, error: 'Immagine non trovata' });
      return;
    }
    const result = await picsender.sendImage({
      filePath: path.join(IMAGES_DIR, image.file),
      caption: image.caption,
      destinationName: image.telegramDestination
    });
    socket.emit('telegram:sendResult', { imageId, ok: result.ok, error: result.error });
  });

  socket.on('view:pan', ({ locationId, dx, dy }) => {
    const location = state.locations.find((l) => l.id === locationId);
    if (!location) return;
    location.map.liveView.offsetX += dx;
    location.map.liveView.offsetY += dy;
    saveState(state);
    broadcastState();
  });

  socket.on('view:zoom', ({ locationId, scale }) => {
    const location = state.locations.find((l) => l.id === locationId);
    if (!location) return;
    location.map.liveView.scale = scale;
    saveState(state);
    broadcastState();
  });

  socket.on('view:reset', ({ locationId }) => {
    const location = state.locations.find((l) => l.id === locationId);
    if (!location) return;
    location.map.liveView = { scale: 1, offsetX: 0, offsetY: 0 };
    saveState(state);
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

  socket.on('polygon:reorder', ({ locationId, orderedIds }) => {
    const location = state.locations.find((l) => l.id === locationId);
    if (!location || !Array.isArray(orderedIds)) {
      if (location) socket.emit('state:update', { ...state, displayViewport });
      return;
    }
    const currentIds = (location.map.polygons || []).map((p) => p.id);
    const currentSet = new Set(currentIds);
    const seen = new Set();
    const validOrder = orderedIds.filter((id) => {
      if (!currentSet.has(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    if (validOrder.length !== currentIds.length) {
      socket.emit('state:update', { ...state, displayViewport });
      return;
    }
    const byId = new Map((location.map.polygons || []).map((p) => [p.id, p]));
    location.map.polygons = validOrder.map((id) => byId.get(id));
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

  socket.on('mapRotate90:toggle', ({ locationId }) => {
    const location = state.locations.find((l) => l.id === locationId);
    if (!location) return;
    location.map.rotate90 = !location.map.rotate90;
    saveState(state);
    broadcastState();
  });

  socket.on('grid:update', ({ locationId, enabled, cellSize, offsetX, offsetY, color, lineWidth, opacity }) => {
    const location = state.locations.find((l) => l.id === locationId);
    if (!location) return;
    if (enabled !== undefined) location.map.grid.enabled = enabled;
    if (cellSize !== undefined) location.map.grid.cellSize = cellSize;
    if (offsetX !== undefined) location.map.grid.offsetX = offsetX;
    if (offsetY !== undefined) location.map.grid.offsetY = offsetY;
    if (color !== undefined) location.map.grid.color = color;
    if (lineWidth !== undefined) location.map.grid.lineWidth = lineWidth;
    if (opacity !== undefined) location.map.grid.opacity = opacity;
    saveState(state);
    broadcastState();
  });

  socket.on('compass:update', ({ locationId, visible, x, y, rotation }) => {
    const location = state.locations.find((l) => l.id === locationId);
    if (!location || !location.map.compass) return;
    if (visible !== undefined) location.map.compass.visible = Boolean(visible);
    if (x !== undefined) location.map.compass.x = Math.min(100, Math.max(0, x));
    if (y !== undefined) location.map.compass.y = Math.min(100, Math.max(0, y));
    if (rotation !== undefined) location.map.compass.rotation = ((Math.round(rotation) % 360) + 360) % 360;
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
      lineWidth: location.map.grid.lineWidth,
      opacity: location.map.grid.opacity
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
    location.map.grid.opacity = state.gridPreset.opacity;
    saveState(state);
    broadcastState();
  });

  socket.on('disconnect', () => {
    controlSockets.delete(socket.id);
    broadcastControlStatus();
    displaySockets.delete(socket.id);
    broadcastDisplayStatus();
  });
});

server.listen(PORT, () => {
  console.log(`Anime VTT in ascolto su http://localhost:${PORT}`);
});
