require('dotenv').config();

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const { nanoid } = require('nanoid');
const { loadState, saveState, migrate, applyStartupDefault, DEFAULT_GRID, DEFAULT_COMPASS, DATA_DIR } = require('./state');
const { normalizeWebUrl, handleWebProxy } = require('./webproxy');
const { AOE_COLORS, AOE_SHADER_OVERRIDE_IDS } = require('../public/shared/media.js');
const { createTelegramClient } = require('./telegram');
const { createTelegramConfig } = require('./telegram-config');
const { registerTelegramRoutes, sendStoredMedia } = require('./telegram-routes');
const audioModel = require('./audio');
const { createAuth } = require('./auth');
const handoutModel = require('./handout');
const { normalizeDisplayAudioStatus } = require('../public/shared/audio-fade.js');
const tar = require('tar-stream');
const exportImport = require('./exportImport');
const packageJson = require('../package.json');
const { registerAudioEvents } = require('./socket-audio');
const { registerShaderEvents } = require('./socket-shader');
const { registerAoeEvents } = require('./socket-aoe');
const { registerGridEvents } = require('./socket-grid');
const { registerPolygonEvents } = require('./socket-polygons');
const { registerViewEvents } = require('./socket-view');
const { registerImageEvents } = require('./socket-images');
const { registerFogEvents } = require('./socket-fog');
const { registerLocationEvents } = require('./socket-location');

const PORT = process.env.PORT || 3000;
const STORAGE_DIR = process.env.STORAGE_DIR || path.join(__dirname, '..', 'storage');
const MAPS_DIR = path.join(STORAGE_DIR, 'maps');
const IMAGES_DIR = path.join(STORAGE_DIR, 'images');
const AUDIO_DIR = path.join(STORAGE_DIR, 'audio');
const HANDOUT_DIR = path.join(STORAGE_DIR, 'handout');
const IMPORTS_DIR = path.join(DATA_DIR, 'imports');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const telegramConfig = createTelegramConfig(path.join(DATA_DIR, 'telegram.json'));
const telegramClient = createTelegramClient();

for (const dir of [MAPS_DIR, IMAGES_DIR, AUDIO_DIR, HANDOUT_DIR, IMPORTS_DIR, BACKUPS_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

// Nessun token di importazione in sospeso può essere ancora valido dopo un
// riavvio (vive solo in memoria nel browser che ha caricato il file): ripulisci
// eventuali file temporanei rimasti da una sessione precedente.
fs.readdirSync(IMPORTS_DIR).forEach((f) => {
  try { fs.unlinkSync(path.join(IMPORTS_DIR, f)); } catch (err) { /* best effort */ }
});

// Chiave di contenuto di un file audio: file caricati più volte con lo stesso
// contenuto diventano una sola voce dell'archivio. null se illeggibile (la
// migrazione ripiega sul nome del file).
function audioContentKey(file) {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(path.join(AUDIO_DIR, file))).digest('hex');
  } catch (err) {
    return null;
  }
}

// Migrazione del vecchio default di /handout: copia il file del media in
// storage/handout, così l'archivio possiede i suoi file. null se non riesce.
function copyHandoutFile(file) {
  const source = path.resolve(IMAGES_DIR, file);
  if (path.dirname(source) !== path.resolve(IMAGES_DIR)) return null;
  const name = `${nanoid()}${path.extname(file)}`;
  try {
    fs.copyFileSync(source, path.join(HANDOUT_DIR, name));
    return name;
  } catch (err) {
    console.error(`Impossibile copiare ${source} nell'archivio handout:`, err.message);
    return null;
  }
}

const migrateOptions = { audioKey: audioContentKey, copyHandoutFile };

let state = applyStartupDefault(loadState(migrateOptions));

function getActiveLocation() {
  return state.locations.find((l) => l.id === state.activeLocationId);
}

const app = express();
app.use(express.json());
const auth = createAuth({ pin: process.env.DM_PIN });
app.use(auth.httpGuard);
auth.registerRoutes(app);
app.use('/login', express.static(path.join(__dirname, '..', 'public', 'login')));
app.use('/storage', express.static(STORAGE_DIR));
app.use('/display', express.static(path.join(__dirname, '..', 'public', 'display')));
app.use('/control', express.static(path.join(__dirname, '..', 'public', 'control')));
app.use('/party', express.static(path.join(__dirname, '..', 'public', 'party')));
app.use('/handout', express.static(path.join(__dirname, '..', 'public', 'handout')));
app.use('/editor', express.static(path.join(__dirname, '..', 'public', 'editor')));
app.use('/shared', express.static(path.join(__dirname, '..', 'public', 'shared')));
app.use('/home', express.static(path.join(__dirname, '..', 'public', 'home')));
app.use('/opzioni', express.static(path.join(__dirname, '..', 'public', 'opzioni')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'home', 'index.html'));
});

app.get('/api/state', (req, res) => {
  res.json(state);
});

app.get('/api/info', (req, res) => {
  res.json({
    version: packageJson.version,
    dataDir: DATA_DIR,
    storageDir: STORAGE_DIR
  });
});

app.post('/api/settings', (req, res) => {
  const { campaignName } = req.body;
  if (!state.campaign) state.campaign = { name: '' };
  if (typeof campaignName === 'string') state.campaign.name = campaignName.trim();
  saveState(state);
  broadcastState();
  res.json({ ok: true });
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
// Gli handout possono essere anche video (loop muto su /display); tetto più basso
// delle mappe, in linea col limite lato editor.
const uploadImage = makeUpload(IMAGES_DIR, { allowVideo: true, maxFileSize: 150 * 1024 * 1024 });
// Archivio dei default di /handout: stessi tipi e limite degli handout.
const uploadHandout = makeUpload(HANDOUT_DIR, { allowVideo: true, maxFileSize: 150 * 1024 * 1024 });

// L'audio non riusa makeUpload(): filtro mime (audio/*) e limite dimensione
// diversi da mappe/immagini, e vogliamo poter cambiare l'uno senza rischiare
// di toccare i percorsi di upload già in uso da mappe e immagini.
const uploadAudio = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, AUDIO_DIR),
    filename: (req, file, cb) => cb(null, `${nanoid()}${path.extname(file.originalname)}`)
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^audio\//.test(file.mimetype))
});

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
  const referencedAudio = new Set();
  state.locations.forEach((location) => {
    if (location.map.file) referencedMaps.add(location.map.file);
    (location.images || []).forEach((img) => { if (img.file) referencedImages.add(img.file); });
  });
  // Un audio è referenziato se sta nell'archivio, anche se nessuna location lo usa.
  audioModel.libraryFiles(state).forEach((f) => referencedAudio.add(f));
  const referencedHandout = new Set(handoutModel.handoutLibraryFiles(state));

  // .gitkeep (nelle cartelle storage/*) è un segnaposto che tiene la
  // cartella tracciata da git quando è vuota: non è mai referenziato da
  // nessuna location per definizione, ma non è comunque un file "orfano"
  // da segnalare/cancellare.
  const scanDir = (dir, referenced, kind) =>
    fs.readdirSync(dir)
      .filter((name) => name !== '.gitkeep' && !referenced.has(name))
      .map((name) => ({ dir, name, kind, size: fs.statSync(path.join(dir, name)).size }));

  return [
    ...scanDir(MAPS_DIR, referencedMaps, 'maps'),
    ...scanDir(IMAGES_DIR, referencedImages, 'images'),
    ...scanDir(AUDIO_DIR, referencedAudio, 'audio'),
    ...scanDir(HANDOUT_DIR, referencedHandout, 'handout')
  ];
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

// Elemento "Web" tra i media: nessun file, solo l'indirizzo da mostrare in un iframe.
// proxy=true fa passare la pagina da /api/webproxy per aggirare i siti che vietano l'iframe.
app.post('/api/media/web', (req, res) => {
  const location = state.locations.find((l) => l.id === req.body.locationId);
  const url = normalizeWebUrl(req.body.url);
  if (!location || !url) {
    return res.status(400).json({ error: 'location mancante o URL non valido (solo http/https)' });
  }
  location.images.push({
    id: nanoid(),
    name: String(req.body.name || '').slice(0, 120) || new URL(url).host,
    file: null,
    url,
    proxy: req.body.proxy !== false,
    caption: '',
    telegramDestination: null
  });
  saveState(state);
  broadcastState();
  res.json({ ok: true });
});

app.get('/api/webproxy', (req, res) => handleWebProxy(req, res));

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

// Carica nell'archivio audio; con `locationId` + `kind` aggiunge anche subito
// una riga a quella location.
app.post('/api/upload/audio', uploadAudio.single('file'), (req, res) => {
  const { locationId, kind } = req.body;
  const location = locationId ? state.locations.find((l) => l.id === locationId) : null;
  const wantsRow = !!(locationId || kind);
  if (!req.file || (wantsRow && (!location || !audioModel.AUDIO_KINDS.includes(kind)))) {
    // File già scritto da multer ma non assegnabile: non lasciarlo orfano.
    if (req.file) deleteUploadedFile(AUDIO_DIR, req.file.filename);
    return res.status(400).json({ error: 'file, location o kind mancante/non valido' });
  }
  // Stesso contenuto di una voce gia presente: la riusa e scarta il file appena caricato.
  const { item, reused } = audioModel.addLibraryItemDeduped(state, {
    name: req.body.name || req.file.originalname,
    file: req.file.filename
  }, audioContentKey);
  if (reused) deleteUploadedFile(AUDIO_DIR, req.file.filename);
  const track = wantsRow ? audioModel.addTrackFromLibrary(state, location, kind, item.id) : undefined;
  saveState(state);
  broadcastState();
  res.json({ ok: true, item, track });
});

// Carica nell'archivio di /handout; con `locationId` (o `global=1`) la voce
// diventa anche il default di quella location (o quello globale).
app.post('/api/upload/handout', uploadHandout.single('file'), (req, res) => {
  const { locationId } = req.body;
  const isGlobal = req.body.global === '1';
  if (!req.file || (locationId && !state.locations.some((l) => l.id === locationId))) {
    if (req.file) deleteUploadedFile(HANDOUT_DIR, req.file.filename);
    return res.status(400).json({ error: 'file o location mancante/non valido' });
  }
  const item = handoutModel.addHandoutItem(state, {
    name: req.body.name || req.file.originalname,
    file: req.file.filename
  });
  if (locationId || isGlobal) handoutModel.setHandoutDefault(state, { locationId: locationId || null, id: item.id });
  saveState(state);
  broadcastState();
  res.json({ ok: true, item });
});

registerTelegramRoutes(app, { config: telegramConfig, client: telegramClient });

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
      migrate(state, migrateOptions);
      saveState(state);
      broadcastState();
      res.json({ ok: true, kind: 'location', name: newLocation.name });
    } else if (manifest.kind === 'backup') {
      const oldMapFiles = new Set();
      const oldImageFiles = new Set();
      state.locations.forEach((l) => {
        if (l.map.file) oldMapFiles.add(l.map.file);
        (l.images || []).forEach((img) => { if (img.file) oldImageFiles.add(img.file); });
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
      migrate(candidate, migrateOptions);
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

// Stato reale dell'audio di /display, riportato dal display stesso. Come
// displayViewport: volutamente fuori da `state` (mai persistito), si ripopola
// alla riconnessione del display e si azzera quando l'ultimo display se ne va.
let displayAudio = null;

function statePayload() {
  return { ...state, displayViewport, displayAudio };
}

function broadcastState() {
  io.emit('state:update', statePayload());
}

// Un trascinamento (pan della mappa, spostamento di un'AoE o di una
// decorazione) emette un evento per ogni pixel di movimento del dito:
// senza un limite, ognuno di questi scriveva l'intero state.json su disco
// in modo sincrono (saveState usa fs.writeFileSync) E lo ritrasmetteva per
// intero a OGNI socket connesso (DM, display, ogni telefono su /party) --
// decine di volte al secondo durante un trascinamento fluido. Qui si
// limita a un salvataggio+broadcast ogni SAVE_BROADCAST_THROTTLE_MS al
// massimo, a trailing edge: la posizione intermedia più recente è sempre
// quella salvata/trasmessa (mai un salto all'indietro), e l'ultima
// posizione del gesto arriva sempre entro quell'intervallo anche se il
// dito si ferma esattamente a metà di una finestra di throttle.
const SAVE_BROADCAST_THROTTLE_MS = 60;
let saveBroadcastTimer = null;
let lastSaveBroadcastAt = 0;

function scheduleSaveAndBroadcast() {
  const now = Date.now();
  const elapsed = now - lastSaveBroadcastAt;
  if (elapsed >= SAVE_BROADCAST_THROTTLE_MS) {
    lastSaveBroadcastAt = now;
    saveState(state);
    broadcastState();
    return;
  }
  if (saveBroadcastTimer) return;
  saveBroadcastTimer = setTimeout(() => {
    saveBroadcastTimer = null;
    lastSaveBroadcastAt = Date.now();
    saveState(state);
    broadcastState();
  }, SAVE_BROADCAST_THROTTLE_MS - elapsed);
}

function broadcastControlStatus() {
  io.emit('control:status', { connected: controlSockets.size > 0 });
}

function broadcastDisplayStatus() {
  io.emit('display:status', { connected: displaySockets.size > 0 });
}

// Eventi di sistema di socket.io: il primo argomento non è un payload
// (`disconnect` riceve la stringa `reason`), quindi non si normalizza.
const RESERVED_SOCKET_EVENTS = new Set([
  'connect', 'connect_error', 'disconnect', 'disconnecting', 'newListener', 'removeListener'
]);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Un client qualunque può mandare un evento senza payload o con un payload di
// tipo sbagliato: gli handler destrutturano il primo argomento e il TypeError,
// lanciato da socket.io in process.nextTick, farebbe terminare il processo.
// Qui il primo argomento non oggetto diventa `{}` (gli altri, per esempio
// l'ack, restano) e le eccezioni, anche i rifiuti di promise, si registrano.
function protectSocketHandlers(socket) {
  const originalOn = socket.on.bind(socket);
  socket.on = (event, handler) => originalOn(event, function (...args) {
    if (!RESERVED_SOCKET_EVENTS.has(event) && !isPlainObject(args[0])) args[0] = {};
    const fail = (err) => console.error(`[socket] errore in "${event}": ${err && err.message ? err.message : err}`);
    try {
      const result = handler.apply(this, args);
      if (result && typeof result.then === 'function') result.then(undefined, fail);
    } catch (err) {
      fail(err);
    }
  });
  return socket;
}

// Dipendenze dei moduli server/socket-*.js. `state`, `displayViewport` e
// `displayAudio` vengono riassegnati (ripristino di un backup, display che
// riporta il suo stato): i moduli li leggono solo tramite questi getter.
const socketCtx = {
  getState: () => state,
  saveState,
  broadcastState,
  scheduleSaveAndBroadcast,
  statePayload,
  getActiveLocation,
  io,
  controlSockets,
  displaySockets,
  broadcastControlStatus,
  broadcastDisplayStatus,
  setDisplayViewport: (value) => { displayViewport = value; },
  getDisplayAudio: () => displayAudio,
  setDisplayAudio: (value) => { displayAudio = value; },
  deleteUploadedFile,
  IMAGES_DIR,
  HANDOUT_DIR,
  AUDIO_DIR,
  telegramConfig,
  telegramClient
};

io.on('connection', (socket) => {
  auth.socketGuard(socket);
  protectSocketHandlers(socket);
  socket.emit('state:update', statePayload());
  socket.emit('control:status', { connected: controlSockets.size > 0 });
  socket.emit('display:status', { connected: displaySockets.size > 0 });

  socket.on('hello', ({ role }) => {
    if (role === 'control') {
      controlSockets.add(socket.id);
      broadcastControlStatus();
    } else if (role === 'display') {
      displaySockets.add(socket.id);
      broadcastDisplayStatus();
      // Un display nuovo o ricaricato non deve far ripartire one-shot "in corso".
      if (audioModel.clearOneshots(state)) broadcastState();
    }
  });

  socket.on('display:viewport', ({ width, height }) => {
    displayViewport = { width, height };
    broadcastState();
  });

  registerAudioEvents(socket, socketCtx);

  registerLocationEvents(socket, socketCtx);

  registerFogEvents(socket, socketCtx);

  registerImageEvents(socket, socketCtx);

  registerViewEvents(socket, socketCtx);

  registerPolygonEvents(socket, socketCtx);

  registerGridEvents(socket, socketCtx);

  registerAoeEvents(socket, socketCtx);

  registerShaderEvents(socket, socketCtx);

  socket.on('disconnect', () => {
    controlSockets.delete(socket.id);
    broadcastControlStatus();
    const wasDisplay = displaySockets.delete(socket.id);
    broadcastDisplayStatus();
    if (wasDisplay && displaySockets.size === 0) {
      const cleared = audioModel.clearOneshots(state);
      if (displayAudio || cleared) {
        displayAudio = null;
        broadcastState();
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Anime VTT in ascolto su http://localhost:${PORT}`);
  if (!auth.enabled) console.log('DM_PIN non impostato: le pagine del DM sono aperte a chiunque sulla rete.');
});
