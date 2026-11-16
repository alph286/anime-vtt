// Rotte HTTP di upload e storage (mappe, immagini, audio, handout, media Web,
// file orfani). Registrate da server/index.js con registerStorageRoutes(app,
// httpCtx). Lo stato si legge con getState() dentro ogni rotta, mai fuori (il
// ripristino di un backup lo riassegna).
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { nanoid } = require('nanoid');
const { normalizeWebUrl } = require('./webproxy');
const audioModel = require('./audio');
const handoutModel = require('./handout');

function registerStorageRoutes(app, { getState, saveState, broadcastState, deleteUploadedFile, audioContentKey, MAPS_DIR, IMAGES_DIR, AUDIO_DIR, HANDOUT_DIR }) {
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

  // Un file è orfano solo se NESSUNA location — attiva o archiviata — lo
  // referenzia più. Pensata per essere raggiunta raramente e con calma:
  // separata dall'archiviazione, mai un "elimina tutto" a un click.
  function findOrphanFiles() {
    const state = getState();
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
    const state = getState();
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
    const state = getState();
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
    const state = getState();
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

  app.post('/api/upload/image', uploadImage.single('file'), (req, res) => {
    const state = getState();
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
    const state = getState();
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
    const state = getState();
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
}

module.exports = { registerStorageRoutes };
