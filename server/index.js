require('dotenv').config();

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { nanoid } = require('nanoid');
const { loadState, saveState, applyStartupDefault, DATA_DIR } = require('./state');
const { handleWebProxy } = require('./webproxy');
const { createTelegramClient } = require('./telegram');
const { createTelegramConfig } = require('./telegram-config');
const { registerTelegramRoutes } = require('./telegram-routes');
const { createAuth } = require('./auth');
const packageJson = require('../package.json');
const { deleteUploadedFile } = require('./files');
const { registerBackupRoutes } = require('./routes-backup');
const { registerStorageRoutes } = require('./routes-storage');
const { registerPresenceEvents } = require('./socket-presence');
const { registerAudioEvents } = require('./socket-audio');
const { registerLocationEvents } = require('./socket-location');
const { registerFogEvents } = require('./socket-fog');
const { registerImageEvents } = require('./socket-images');
const { registerViewEvents } = require('./socket-view');
const { registerPolygonEvents } = require('./socket-polygons');
const { registerGridEvents } = require('./socket-grid');
const { registerAoeEvents } = require('./socket-aoe');
const { registerShaderEvents } = require('./socket-shader');

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

// Dipendenze dei moduli server/routes-*.js. Niente `io` qui: viene creato
// più sotto (broadcastState lo usa solo quando arriva una richiesta).
const httpCtx = {
  getState: () => state,
  setState: (next) => { state = next; },
  saveState,
  broadcastState,
  deleteUploadedFile,
  audioContentKey,
  migrateOptions,
  MAPS_DIR,
  IMAGES_DIR,
  AUDIO_DIR,
  HANDOUT_DIR,
  IMPORTS_DIR,
  BACKUPS_DIR
};

app.get('/api/webproxy', (req, res) => handleWebProxy(req, res));

registerStorageRoutes(app, httpCtx);

registerTelegramRoutes(app, { config: telegramConfig, client: telegramClient });

registerBackupRoutes(app, httpCtx);

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

  registerPresenceEvents(socket, socketCtx);
  registerAudioEvents(socket, socketCtx);
  registerLocationEvents(socket, socketCtx);
  registerFogEvents(socket, socketCtx);
  registerImageEvents(socket, socketCtx);
  registerViewEvents(socket, socketCtx);
  registerPolygonEvents(socket, socketCtx);
  registerGridEvents(socket, socketCtx);
  registerAoeEvents(socket, socketCtx);
  registerShaderEvents(socket, socketCtx);
});

server.listen(PORT, () => {
  console.log(`Anime VTT in ascolto su http://localhost:${PORT}`);
  if (!auth.enabled) console.log('DM_PIN non impostato: le pagine del DM sono aperte a chiunque sulla rete.');
});
