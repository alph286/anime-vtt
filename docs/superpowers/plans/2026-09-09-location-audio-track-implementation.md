# Traccia Audio per Location Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** poter caricare da `/editor` una traccia audio (mp3 o simile) legata a una location, e controllarne la riproduzione (play/pausa/stop, volume) da `/control`, con l'audio che esce fisicamente dalla TV via HDMI del Raspberry Pi che serve `/display`.

**Architecture:** un unico elemento `<audio>` su `/display`, guidato interamente dallo stato trasmesso dal server — stesso schema già in uso per griglia, fog, rosa dei venti. `/control` non riproduce nulla in locale: invia comandi, il server aggiorna lo stato e lo trasmette a tutti i client, `/display` reagisce. A differenza di griglia/fog/rosa dei venti, i comandi audio agiscono sempre sulla location **attiva** (mai su `previewLocationId`): non esiste un'anteprima silenziosa della riproduzione.

**Tech Stack:** stesso stack del resto del progetto (Node/Express/socket.io lato server, vanilla JS/CSS lato client). Nessuna nuova dipendenza.

**Spec:** `docs/superpowers/specs/2026-09-09-location-audio-track-design.md`

## Global Constraints

- `location.map.audio` è per-location, con default `{ name: '', file: null, volume: 0.7 }` — backfill per le location esistenti, nessuna sorpresa dopo l'aggiornamento.
- `state.audioState` è un campo top-level con tre valori possibili: `'stopped'` (default), `'playing'`, `'paused'`. Mai un booleano.
- I comandi `audio:play`/`audio:pause`/`audio:stop` agiscono **sempre** sulla location attiva (`getActiveLocation()` lato server), mai su una location passata per id — a differenza di `grid:update`/`compass:update`/`view:pan` che prendono `locationId` dal client.
- `location.map.audio.volume` è una frazione 0-1 (come `grid.opacity`), clampata lato server, regolata a passi di 0.1 da `/control`.
- Cambiare location (`location:set`, `location:create`) ferma sempre l'audio (`state.audioState = 'stopped'`). Il riavvio del server (`applyStartupDefault`) fa lo stesso, senza mai far ripartire la riproduzione da solo.
- Sostituire o eliminare la traccia da `/editor` ferma sempre la riproduzione **solo se** la location modificata è quella attiva (`state.activeLocationId === location.id`) — modificare una traccia su una location non attiva non deve interrompere l'audio in corso altrove.
- Nessuna suite di test automatica in questo progetto: ogni task si verifica manualmente su un server isolato.

---

### Task 1: Server — modello dati, upload, eventi socket

**Files:**
- Modify: `server/state.js`
- Modify: `server/index.js`
- Modify: `server/exportImport.js`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `location.map.audio = { name: string, file: string|null, volume: number }` su ogni location, esistente o nuova. `state.audioState: 'stopped'|'playing'|'paused'`, top-level. Route `POST /api/upload/audio` (`multipart/form-data`: `file`, `locationId`, `name`). Eventi socket: `audio:play {}`, `audio:pause {}`, `audio:stop {}` (nessun payload, agiscono sulla location attiva), `audio:volume { volume }`, `audio:delete { locationId }`, `audio:rename { locationId, name }`. File audio serviti da `/storage/audio/<file>` (già coperto da `app.use('/storage', express.static(STORAGE_DIR))`, nessuna modifica necessaria lì).
- Consumes: nessuna interfaccia da altri task (è il primo task).

- [ ] **Step 1: Aggiungi `DEFAULT_AUDIO`, il default nella location di esempio e `audioState` in `server/state.js`**

Dopo la riga `const DEFAULT_COMPASS = { visible: false, x: 88, y: 85, rotation: 0 };` aggiungi:

```js
const DEFAULT_AUDIO = { name: '', file: null, volume: 0.7 };
```

Nella location di esempio dentro `DEFAULT_STATE`, l'attuale:

```js
        grid: { ...DEFAULT_GRID },
        compass: { ...DEFAULT_COMPASS },
        polygons: [
```

diventa:

```js
        grid: { ...DEFAULT_GRID },
        compass: { ...DEFAULT_COMPASS },
        audio: { ...DEFAULT_AUDIO },
        polygons: [
```

Subito dopo, l'attuale:

```js
  activeLocationId: 'taverna',
  activeImageId: null
};
```

diventa:

```js
  activeLocationId: 'taverna',
  activeImageId: null,
  audioState: 'stopped'
};
```

- [ ] **Step 2: Aggiungi il backfill in `migrate()`**

Nel blocco iniziale di `migrate()` (dopo i controlli su `state.gridPreset`), aggiungi:

```js
  if (state.audioState === undefined) state.audioState = 'stopped';
```

Nel blocco `(state.locations || []).forEach((location) => { ... })`, dopo le righe che backfillano `location.map.compass`, aggiungi:

```js
    if (!location.map.audio) location.map.audio = { ...DEFAULT_AUDIO };
    if (location.map.audio.name === undefined) location.map.audio.name = '';
    if (location.map.audio.file === undefined) location.map.audio.file = null;
    if (location.map.audio.volume === undefined) location.map.audio.volume = DEFAULT_AUDIO.volume;
```

- [ ] **Step 3: Aggiorna `applyStartupDefault()` ed esporta `DEFAULT_AUDIO`**

Nella funzione `applyStartupDefault(state)`, l'attuale:

```js
  state.activeLocationId = chosen ? chosen.id : null;
  state.activeImageId = null;
  return state;
```

diventa:

```js
  state.activeLocationId = chosen ? chosen.id : null;
  state.activeImageId = null;
  state.audioState = 'stopped';
  return state;
```

L'attuale riga finale del file:

```js
module.exports = { loadState, saveState, migrate, applyStartupDefault, DEFAULT_GRID, DEFAULT_COMPASS, DATA_DIR, STATE_FILE };
```

diventa:

```js
module.exports = { loadState, saveState, migrate, applyStartupDefault, DEFAULT_GRID, DEFAULT_COMPASS, DEFAULT_AUDIO, DATA_DIR, STATE_FILE };
```

- [ ] **Step 4: `server/index.js` — importa `DEFAULT_AUDIO`, aggiungi `AUDIO_DIR`**

L'attuale:

```js
const { loadState, saveState, migrate, applyStartupDefault, DEFAULT_GRID, DEFAULT_COMPASS, DATA_DIR } = require('./state');
```

diventa:

```js
const { loadState, saveState, migrate, applyStartupDefault, DEFAULT_GRID, DEFAULT_COMPASS, DEFAULT_AUDIO, DATA_DIR } = require('./state');
```

L'attuale:

```js
const MAPS_DIR = path.join(STORAGE_DIR, 'maps');
const IMAGES_DIR = path.join(STORAGE_DIR, 'images');
const IMPORTS_DIR = path.join(DATA_DIR, 'imports');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');

for (const dir of [MAPS_DIR, IMAGES_DIR, IMPORTS_DIR, BACKUPS_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}
```

diventa:

```js
const MAPS_DIR = path.join(STORAGE_DIR, 'maps');
const IMAGES_DIR = path.join(STORAGE_DIR, 'images');
const AUDIO_DIR = path.join(STORAGE_DIR, 'audio');
const IMPORTS_DIR = path.join(DATA_DIR, 'imports');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');

for (const dir of [MAPS_DIR, IMAGES_DIR, AUDIO_DIR, IMPORTS_DIR, BACKUPS_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}
```

Nel `.gitignore` alla radice del progetto, l'attuale:

```
storage/maps/*
storage/images/*
!storage/maps/.gitkeep
!storage/images/.gitkeep
```

diventa:

```
storage/maps/*
storage/images/*
storage/audio/*
!storage/maps/.gitkeep
!storage/images/.gitkeep
!storage/audio/.gitkeep
```

- [ ] **Step 5: Aggiungi l'upload multer per l'audio**

Subito dopo la riga `const uploadImage = makeUpload(IMAGES_DIR);` aggiungi:

```js
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
```

- [ ] **Step 6: Estendi `findOrphanFiles()` alla cartella audio**

L'attuale:

```js
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
```

diventa:

```js
function findOrphanFiles() {
  const referencedMaps = new Set();
  const referencedImages = new Set();
  const referencedAudio = new Set();
  state.locations.forEach((location) => {
    if (location.map.file) referencedMaps.add(location.map.file);
    (location.images || []).forEach((img) => referencedImages.add(img.file));
    if (location.map.audio && location.map.audio.file) referencedAudio.add(location.map.audio.file);
  });

  const scanDir = (dir, referenced, kind) =>
    fs.readdirSync(dir)
      .filter((name) => !referenced.has(name))
      .map((name) => ({ dir, name, kind, size: fs.statSync(path.join(dir, name)).size }));

  return [
    ...scanDir(MAPS_DIR, referencedMaps, 'maps'),
    ...scanDir(IMAGES_DIR, referencedImages, 'images'),
    ...scanDir(AUDIO_DIR, referencedAudio, 'audio')
  ];
}
```

- [ ] **Step 7: Aggiungi la route `POST /api/upload/audio`**

Subito dopo la route `app.post('/api/upload/image', ...)` (prima di `app.get('/api/telegram/destinations', ...)`), aggiungi:

```js
app.post('/api/upload/audio', uploadAudio.single('file'), (req, res) => {
  const location = state.locations.find((l) => l.id === req.body.locationId);
  if (!location || !req.file) {
    return res.status(400).json({ error: 'location o file mancante' });
  }
  const previousFile = location.map.audio.file;
  const previousVolume = location.map.audio.volume === undefined ? DEFAULT_AUDIO.volume : location.map.audio.volume;
  location.map.audio = {
    name: req.body.name || req.file.originalname,
    file: req.file.filename,
    // Il volume di default (70%) vale solo alla prima assegnazione di una
    // traccia: sostituire una traccia già presente conserva il volume già
    // impostato dall'utente su /control.
    volume: previousFile ? previousVolume : DEFAULT_AUDIO.volume
  };
  if (previousFile) deleteUploadedFile(AUDIO_DIR, previousFile);
  if (state.activeLocationId === location.id) state.audioState = 'stopped';
  saveState(state);
  broadcastState();
  res.json({ ok: true, file: req.file.filename });
});
```

- [ ] **Step 8: Ferma sempre l'audio al cambio location**

Nell'handler `socket.on('location:set', ...)`, l'attuale:

```js
  socket.on('location:set', ({ locationId }) => {
    if (!state.locations.some((l) => l.id === locationId)) return;
    state.activeLocationId = locationId;
    state.activeImageId = null;
    saveState(state);
    broadcastState();
  });
```

diventa:

```js
  socket.on('location:set', ({ locationId }) => {
    if (!state.locations.some((l) => l.id === locationId)) return;
    state.activeLocationId = locationId;
    state.activeImageId = null;
    state.audioState = 'stopped';
    saveState(state);
    broadcastState();
  });
```

Nell'handler `socket.on('location:create', ...)`, l'attuale:

```js
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
```

diventa:

```js
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
        audio: { ...DEFAULT_AUDIO },
        polygons: []
      },
      images: [],
      archived: false,
      isDefault: false
    };
    state.locations.push(location);
    state.activeLocationId = location.id;
    state.activeImageId = null;
    state.audioState = 'stopped';
    saveState(state);
    broadcastState();
  });
```

- [ ] **Step 9: Aggiungi `audio:play` / `audio:pause` / `audio:stop`**

Subito dopo l'handler `socket.on('compass:update', ...)` (prima di `gridPreset:save`), aggiungi:

```js
  // A differenza di griglia/fog/rosa dei venti, questi comandi agiscono
  // sempre sulla location attiva -- non esiste un'anteprima silenziosa per
  // l'audio (suonerebbe comunque subito ai giocatori), quindi niente
  // locationId dal client: previewLocationId non c'entra qui.
  socket.on('audio:play', () => {
    const location = getActiveLocation();
    if (!location || !location.map.audio || !location.map.audio.file) return;
    state.audioState = 'playing';
    broadcastState();
  });

  socket.on('audio:pause', () => {
    const location = getActiveLocation();
    if (!location || !location.map.audio || !location.map.audio.file) return;
    state.audioState = 'paused';
    broadcastState();
  });

  socket.on('audio:stop', () => {
    const location = getActiveLocation();
    if (!location || !location.map.audio || !location.map.audio.file) return;
    state.audioState = 'stopped';
    broadcastState();
  });
```

- [ ] **Step 10: Aggiungi `audio:volume`**

Subito dopo `audio:stop`, aggiungi:

```js
  socket.on('audio:volume', ({ volume }) => {
    const location = getActiveLocation();
    if (!location || !location.map.audio || volume === undefined) return;
    location.map.audio.volume = Math.min(1, Math.max(0, volume));
    saveState(state);
    broadcastState();
  });
```

- [ ] **Step 11: Aggiungi `audio:delete` e `audio:rename`**

Subito dopo `audio:volume`, aggiungi:

```js
  socket.on('audio:delete', ({ locationId }) => {
    const location = state.locations.find((l) => l.id === locationId);
    if (!location || !location.map.audio || !location.map.audio.file) return;

    deleteUploadedFile(AUDIO_DIR, location.map.audio.file);
    location.map.audio = { ...DEFAULT_AUDIO };
    if (state.activeLocationId === locationId) state.audioState = 'stopped';

    saveState(state);
    broadcastState();
  });

  socket.on('audio:rename', ({ locationId, name }) => {
    const location = state.locations.find((l) => l.id === locationId);
    if (!location || !location.map.audio || !location.map.audio.file) return;
    location.map.audio.name = String(name || '').slice(0, 120);
    saveState(state);
    broadcastState();
  });
```

- [ ] **Step 12: Evita il riferimento pendente nell'export/import**

In `server/exportImport.js`, la funzione `manifestForLocation()` spargono `...location.map` per intero nel manifest, quindi un `location.map.audio.file` ci finirebbe dentro automaticamente — ma `planLocationFiles()` copia nell'archivio solo `map.file` e `images[].file`, mai `map.audio.file`. Senza questa modifica, esportare una location con una traccia audio produrrebbe un `.vttlocation`/`.vttbackup` con un riferimento a un file audio che non esiste nell'archivio. L'audio è deliberatamente fuori scope per l'export/import (non menzionato nella spec) — la traccia va sempre resettata, mai copiata.

L'attuale:

```js
function manifestForLocation(location) {
  return {
    name: location.name,
    map: { ...location.map, polygons: (location.map.polygons || []).map((p) => ({ ...p })) },
    images: (location.images || []).map((img) => ({
      name: img.name || '',
      file: img.file,
      caption: img.caption || '',
      telegramDestination: img.telegramDestination || null
    }))
  };
}
```

diventa:

```js
function manifestForLocation(location) {
  return {
    name: location.name,
    map: {
      ...location.map,
      polygons: (location.map.polygons || []).map((p) => ({ ...p })),
      // L'audio non fa parte dell'export (fuori scope, vedi design doc):
      // resettato a un default sicuro per non lasciare nel manifest un
      // riferimento a un file che planLocationFiles() non copia nell'archivio.
      audio: { name: '', file: null, volume: 0.7 }
    },
    images: (location.images || []).map((img) => ({
      name: img.name || '',
      file: img.file,
      caption: img.caption || '',
      telegramDestination: img.telegramDestination || null
    }))
  };
}
```

Nessuna modifica necessaria lato import: `rebuildLocationFromManifest()` sparge già `...loc.map` per intero, e `migrate(state)` (già chiamato sia sull'import di una singola location sia dopo un ripristino di backup) backfilla comunque qualunque campo `audio` mancante o azzerato.

- [ ] **Step 13: Verifica manuale**

```bash
DATA_DIR=/tmp/anime-vtt-test-data STORAGE_DIR=/tmp/anime-vtt-test-storage PORT=3099 node server/index.js
```

1. `curl -s http://localhost:3099/api/state | grep -o '"audio":{[^}]*}\|"audioState":"[a-z]*"'` → deve mostrare `"audio":{"name":"","file":null,"volume":0.7}` per la location `taverna` e `"audioState":"stopped"`.
2. Crea un file audio fittizio: `touch /tmp/test.mp3` (il filtro multer controlla solo il Content-Type dichiarato, non il contenuto reale — sufficiente per verificare la route).
   ```bash
   curl -s -X POST http://localhost:3099/api/upload/audio \
     -F "file=@/tmp/test.mp3;type=audio/mpeg" -F "locationId=taverna" -F "name=Ambient"
   ```
   → risposta `{"ok":true,"file":"<nome generato>.mp3"}`; il file compare in `/tmp/anime-vtt-test-storage/audio/`.
   `curl -s http://localhost:3099/api/state | grep -o '"audio":{[^}]*}'` → `"name":"Ambient"`, `"file":"<stesso nome>"`, `"volume":0.7`.
3. Prova un upload con mimetype non-audio (deve essere rifiutato dal filtro):
   ```bash
   curl -s -X POST http://localhost:3099/api/upload/audio \
     -F "file=@/tmp/test.mp3;type=text/plain" -F "locationId=taverna" -F "name=Nope"
   ```
   → risposta 400 (`req.file` mancante, filtro multer ha scartato il file).
4. Dalla console del browser (apri `/editor`, che carica già `socket.io.js`):
   ```js
   const s = io();
   s.emit('audio:play', {});
   ```
   `curl -s http://localhost:3099/api/state | grep -o '"audioState":"[a-z]*"'` → `"playing"`.
   `s.emit('audio:pause', {})` → `"paused"`. `s.emit('audio:stop', {})` → `"stopped"`.
5. `s.emit('audio:volume', { volume: 0.35 })` → `curl` mostra `"volume":0.35`. `s.emit('audio:volume', { volume: 3 })` (fuori range) → resta clampato a `1`.
6. `s.emit('audio:play', {})` per rimettere `audioState` a `"playing"`, poi `s.emit('location:set', { locationId: 'taverna' })` → `audioState` torna `"stopped"` (verifica che il cambio location, anche verso la stessa location, fermi sempre l'audio).
7. `s.emit('audio:play', {})` di nuovo per rimettere `audioState` a `"playing"` (verifica: `curl` mostra `"playing"`), poi ferma il server (Ctrl+C sul processo avviato al punto 1) e riavvialo con lo stesso comando → `curl -s http://localhost:3099/api/state | grep -o '"audioState":"[a-z]*"'` mostra di nuovo `"stopped"` (`applyStartupDefault()` non lascia mai `"playing"` attraverso un riavvio, nessuna ripartenza automatica).
8. `s.emit('audio:rename', { locationId: 'taverna', name: 'Taverna ambient' })` → il nome cambia nello stato.
9. `curl -s -X POST http://localhost:3099/api/storage/orphans/scan` → non deve elencare il file audio appena caricato (è referenziato). Poi `s.emit('audio:delete', { locationId: 'taverna' })` → il file audio viene cancellato da `/tmp/anime-vtt-test-storage/audio/` e `location.map.audio` torna a `{"name":"","file":null,"volume":0.7}`.
10. Ripeti l'upload del punto 2, poi esporta la location (`curl -s http://localhost:3099/api/export/location/taverna -o /tmp/test-export.vttlocation`) ed estrai il manifest (`tar -xOf /tmp/test-export.vttlocation manifest.json | grep -o '"audio":{[^}]*}'`) → deve mostrare `"audio":{"name":"","file":null,"volume":0.7}`, mai il nome/file reale caricato.
11. Ferma il server e cancella `/tmp/anime-vtt-test-data`, `/tmp/anime-vtt-test-storage`, `/tmp/test.mp3`, `/tmp/test-export.vttlocation`.

- [ ] **Step 14: Commit**

```bash
git add server/state.js server/index.js server/exportImport.js .gitignore
git commit -m "feat: add per-location audio track data model, upload and playback events"
```

---

### Task 2: `/display` — riproduzione audio

**Files:**
- Modify: `public/display/index.html`
- Modify: `public/display/display.js`

**Interfaces:**
- Consumes: `location.map.audio` e `state.audioState` (Task 1).
- Produces: nessuna interfaccia per altri task.

- [ ] **Step 1: Aggiungi l'elemento `<audio>` in `public/display/index.html`**

Dopo la chiusura di `</div>` di `#compass` (prima di `#wifi-dot`), aggiungi:

```html
  <audio id="scene-audio" loop hidden></audio>
```

- [ ] **Step 2: Aggiungi il riferimento DOM e la resa in `public/display/display.js`**

Dopo la riga `const compassEl = document.getElementById('compass');` aggiungi:

```js
const sceneAudioEl = document.getElementById('scene-audio');
```

Nella funzione `render(state)`, l'attuale:

```js
  renderCompass(location, showingImage);

  if (showingImage) {
```

diventa:

```js
  renderCompass(location, showingImage);
  renderAudio(location, state.audioState);

  if (showingImage) {
```

Subito dopo la funzione `renderCompass(location, showingImage)`, aggiungi:

```js
// L'elemento <audio> non è mai visibile -- solo suono, indipendente da quale
// layer (mappa o immagine) è mostrato in quel momento, in linea con la
// scelta di design che mostrare un'immagine ai giocatori non ferma l'audio.
// `lastAudioFile` evita di riassegnare `src` (che farebbe ripartire da zero
// anche una traccia identica) a ogni singolo state:update.
let lastAudioFile = null;

function renderAudio(location, audioState) {
  const audio = location && location.map.audio;
  const file = audio && audio.file;

  if (file !== lastAudioFile) {
    lastAudioFile = file;
    sceneAudioEl.src = file ? `/storage/audio/${file}` : '';
  }

  sceneAudioEl.volume = audio && audio.volume !== undefined ? audio.volume : 0.7;

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
```

- [ ] **Step 3: Verifica manuale**

Con un server isolato (`DATA_DIR`/`STORAGE_DIR` temporanei come nel Task 1) e un vero file mp3 di prova (non `/dev/null`/`touch` questa volta — serve audio riproducibile):
1. Carica una traccia sulla location attiva via `curl -F "file=@/percorso/prova.mp3;type=audio/mpeg" -F "locationId=taverna" -F "name=Prova" http://localhost:3099/api/upload/audio`.
2. Apri `/display` nel browser (con audio non mutato dal sistema operativo/scheda). Dalla console: `io().emit('audio:play', {})` → l'audio parte e si sente.
3. `io().emit('audio:pause', {})` → si interrompe. `io().emit('audio:play', {})` di nuovo → riprende da dove si era fermata (non da capo) — verificabile guardando `document.getElementById('scene-audio').currentTime` prima e dopo la pausa.
4. `io().emit('audio:stop', {})` → si interrompe. `io().emit('audio:play', {})` → riparte da `currentTime === 0`.
5. `io().emit('audio:volume', { volume: 0.2 })` mentre suona → il volume cambia subito (`sceneAudioEl.volume` riflette `0.2`).
6. Mostra un'immagine ai giocatori (`io().emit('image:show', { imageId: '<id>' })`, previa creazione di un'immagine da `/editor`) mentre l'audio suona → l'audio continua (il layer immagine copre la mappa, ma `#scene-audio` è `hidden` e indipendente da entrambi i layer).
7. Cambia location attiva (`io().emit('location:set', { locationId: '<altra location>' })`) mentre l'audio suona → si ferma (il server ha già resettato `audioState`, verificato nel Task 1; qui si verifica solo che `/display` obbedisca).
8. Ferma il server e cancella le cartelle temporanee.

- [ ] **Step 4: Commit**

```bash
git add public/display/index.html public/display/display.js
git commit -m "feat: play location audio track on /display"
```

---

### Task 3: `/control` — comandi di riproduzione

**Files:**
- Modify: `public/control/index.html`
- Modify: `public/control/control.css`
- Modify: `public/control/control.js`

**Interfaces:**
- Consumes: `location.map.audio`, `state.audioState`, eventi `audio:play`/`audio:pause`/`audio:stop`/`audio:volume` (Task 1). Riusa `getActiveLocation()` già esistente in `control.js` — **non** `getPreviewLocation()`/`previewLocationId`, a differenza delle altre sezioni Mappa.
- Produces: nessuna interfaccia per altri task.

- [ ] **Step 1: Aggiungi le icone in `public/control/index.html`**

Dentro il blocco `<svg style="display:none">` (dopo l'ultimo `<symbol>` esistente, `i-compass`), aggiungi:

```html
  <symbol id="i-play" viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z"/></symbol>
  <symbol id="i-pause" viewBox="0 0 24 24"><path d="M8 4v16M16 4v16"/></symbol>
  <symbol id="i-stop" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12"/></symbol>
```

- [ ] **Step 2: Aggiungi la sezione Audio**

Subito dopo la chiusura `</section>` di `#compass-section` (prima della sezione Opacità FOG), aggiungi:

```html
      <section id="audio-section" class="control-section" hidden>
        <h2>Audio</h2>
        <div class="opacity-row">
          <button id="audio-play-pause" class="icon-btn" title="Play/Pausa">
            <svg class="icon"><use id="audio-play-pause-icon" href="#i-play"></use></svg>
          </button>
          <button id="audio-stop" class="icon-btn" title="Stop">
            <svg class="icon"><use href="#i-stop"></use></svg>
          </button>
        </div>
        <div class="zoom">
          <button id="audio-volume-out" title="Riduci volume">−</button>
          <span id="audio-volume-level">70%</span>
          <button id="audio-volume-in" title="Aumenta volume">+</button>
        </div>
      </section>
```

- [ ] **Step 3: Aggiungi lo stile attivo in `public/control/control.css`**

Dopo la regola `#compass-toggle.active { ... }`, aggiungi:

```css
#audio-play-pause.active {
  background: var(--accent);
  color: var(--accent-text);
  border-color: var(--accent);
}
```

- [ ] **Step 4: Aggiungi i riferimenti DOM in `public/control/control.js`**

Dopo la riga `const GRID_OPACITY_STEP = 0.1;` aggiungi:

```js
const audioSection = document.getElementById('audio-section');
const audioPlayPauseBtn = document.getElementById('audio-play-pause');
const audioPlayPauseIcon = document.getElementById('audio-play-pause-icon');
const audioStopBtn = document.getElementById('audio-stop');
const audioVolumeOutBtn = document.getElementById('audio-volume-out');
const audioVolumeInBtn = document.getElementById('audio-volume-in');
const audioVolumeLevel = document.getElementById('audio-volume-level');
const AUDIO_VOLUME_STEP = 0.1;
```

- [ ] **Step 5: Aggiungi la resa nella funzione `render()`**

L'attuale:

```js
  compassSection.style.display = hidePanZoomForImage ? 'none' : 'block';
  compassToggle.classList.toggle('active', Boolean(previewLocation && previewLocation.map.compass && previewLocation.map.compass.visible));

  updateViewportRect(previewLocation);
```

diventa:

```js
  compassSection.style.display = hidePanZoomForImage ? 'none' : 'block';
  compassToggle.classList.toggle('active', Boolean(previewLocation && previewLocation.map.compass && previewLocation.map.compass.visible));

  // A differenza delle sezioni sopra, l'audio riflette sempre la location
  // ATTIVA (`location`, non `previewLocation`): i comandi non hanno un
  // concetto di anteprima, quindi anche la UI non deve suggerirne uno.
  const audioTrack = location && location.map.audio;
  const hasAudio = Boolean(audioTrack && audioTrack.file);
  audioSection.style.display = hasAudio ? 'block' : 'none';
  if (hasAudio) {
    audioPlayPauseIcon.setAttribute('href', state.audioState === 'playing' ? '#i-pause' : '#i-play');
    audioPlayPauseBtn.classList.toggle('active', state.audioState === 'playing');
    audioVolumeLevel.textContent = `${Math.round((audioTrack.volume === undefined ? 0.7 : audioTrack.volume) * 100)}%`;
  }

  updateViewportRect(previewLocation);
```

- [ ] **Step 6: Aggiungi i click handler**

In fondo al file, aggiungi:

```js
audioPlayPauseBtn.addEventListener('click', () => {
  socket.emit(state.audioState === 'playing' ? 'audio:pause' : 'audio:play', {});
});

audioStopBtn.addEventListener('click', () => {
  socket.emit('audio:stop', {});
});

function stepAudioVolume(delta) {
  const location = getActiveLocation();
  if (!location || !location.map.audio || !location.map.audio.file) return;
  const current = location.map.audio.volume === undefined ? 0.7 : location.map.audio.volume;
  const next = Math.min(1, Math.max(0, Math.round((current + delta) * 10) / 10));
  socket.emit('audio:volume', { volume: next });
}
audioVolumeOutBtn.addEventListener('click', () => stepAudioVolume(-AUDIO_VOLUME_STEP));
audioVolumeInBtn.addEventListener('click', () => stepAudioVolume(AUDIO_VOLUME_STEP));
```

- [ ] **Step 7: Verifica manuale**

Con un server isolato e una traccia già caricata sulla location attiva (come nel Task 1, Step 13.2):
1. Apri `/control`, scheda Mappa: appare la sezione "Audio" con Play/Pausa, Stop e lo stepper volume (70% di default), sotto "Rosa dei venti".
2. Seleziona un'altra location dal menu in alto (modalità anteprima, senza una traccia caricata): la sezione "Audio" sparisce — riflette la location ATTIVA, non quella in anteprima. Torna sulla location con la traccia.
3. Clicca Play: apri anche `/display` in un'altra scheda — l'audio parte, il pulsante mostra l'icona Pausa ed è evidenziato in ambra.
4. Clicca di nuovo (ora Pausa): l'audio si interrompe, il pulsante torna a mostrare Play, non più evidenziato.
5. Clicca Play, poi Stop: l'audio si interrompe; un Play successivo riparte dall'inizio (verificabile su `/display`).
6. Usa +/− sullo stepper volume: la percentuale cambia a passi del 10%, clampata 0%-100%; il volume su `/display` cambia subito se l'audio sta suonando.
7. Mostra un'immagine ai giocatori: a differenza di Pan/zoom, Opacità griglia e Rosa dei venti (che si nascondono), la sezione Audio resta visibile — l'audio continua a suonare sotto l'immagine.
8. Ferma il server e cancella le cartelle temporanee.

- [ ] **Step 8: Commit**

```bash
git add public/control/index.html public/control/control.css public/control/control.js
git commit -m "feat: audio playback controls in /control"
```

---

### Task 4: `/editor` — caricamento e gestione della traccia

**Files:**
- Modify: `public/editor/index.html`
- Modify: `public/editor/editor.js`

**Interfaces:**
- Consumes: `location.map.audio`, route `POST /api/upload/audio`, eventi `audio:delete`/`audio:rename` (Task 1). Riusa `getActiveLocation()`, il pattern arma-poi-conferma già usato per `armedImageDeletes`/`imageDeleteTimers`, e le classi CSS `.panel`/`.file-btn`/`.image-card`/`.image-editor-row`/`.image-name-input`/`.image-delete` già esistenti in `editor.css` (nessuna nuova classe CSS necessaria).
- Produces: nessuna interfaccia per altri task (ultimo task del piano).

- [ ] **Step 1: Aggiungi la sezione in `public/editor/index.html`**

Subito dopo la chiusura `</section>` del pannello "Immagini" (prima del pannello "Fog of war"), aggiungi:

```html
    <section class="panel">
      <h2>Audio</h2>
      <div id="audio-content"></div>
    </section>
```

- [ ] **Step 2: Aggiungi il riferimento DOM in `public/editor/editor.js`**

Dopo la riga `const imageUpload = document.getElementById('image-upload');` aggiungi:

```js
const audioContent = document.getElementById('audio-content');
```

- [ ] **Step 3: Aggiungi la resa condizionale**

Subito dopo la funzione `renderImageList(location)` (prima del suo listener `imageList.addEventListener('click', ...)`), aggiungi:

```js
// Stesso pattern arma-poi-conferma delle immagini, ma per un solo elemento
// (non c'è un id per riga: la location attiva stessa fa da chiave).
let audioDeleteArmed = false;
let audioDeleteTimer = null;

function renderAudioPanel(location) {
  const audio = location.map.audio;
  if (!audio || !audio.file) {
    audioDeleteArmed = false;
    audioContent.innerHTML = `
      <label class="file-btn">Carica traccia audio<input type="file" id="audio-upload" accept="audio/*"></label>
    `;
    return;
  }
  audioContent.innerHTML = `
    <div class="image-card">
      <div class="image-editor-row">
        <input type="text" class="image-name-input" id="audio-name-input" value="${escapeHtml(audio.name)}" placeholder="etichetta">
        <button class="icon-btn image-delete ${audioDeleteArmed ? 'confirm' : ''}" id="audio-delete-btn"
                title="${audioDeleteArmed ? 'Click di nuovo per confermare' : 'Elimina traccia'}">
          <svg class="icon"><use href="#i-trash"></use></svg>
        </button>
      </div>
      <label class="file-btn">Sostituisci traccia<input type="file" id="audio-upload" accept="audio/*"></label>
    </div>
  `;
}
```

- [ ] **Step 4: Chiama `renderAudioPanel()` dal `render()` principale**

L'attuale:

```js
  renderPolygonList(location);
  renderImageList(location);
  updateZoomBox();
  updateOverlayBox();
}
```

diventa:

```js
  renderPolygonList(location);
  renderImageList(location);
  renderAudioPanel(location);
  updateZoomBox();
  updateOverlayBox();
}
```

Nel ramo iniziale di `render()` per "nessuna location attiva" (quello che fa `return` presto), l'attuale:

```js
    imageList.innerHTML = '<p class="hint">nessuna location attiva — creane una qui sopra.</p>';
    compassDragHandle.hidden = true;
```

diventa:

```js
    imageList.innerHTML = '<p class="hint">nessuna location attiva — creane una qui sopra.</p>';
    audioContent.innerHTML = '';
    compassDragHandle.hidden = true;
```

- [ ] **Step 5: Aggiungi gli event listener delegati**

In fondo al file, aggiungi:

```js
// L'input file viene ricreato a ogni renderAudioPanel() (l'id è lo stesso,
// "audio-upload", sia nello stato "nessuna traccia" che "sostituisci"), quindi
// il listener va sul contenitore stabile `audioContent`, non sull'input.
audioContent.addEventListener('change', async (e) => {
  const fileInput = e.target.closest('#audio-upload');
  if (fileInput) {
    const file = fileInput.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('locationId', state.activeLocationId);
    formData.append('name', file.name);
    await fetch('/api/upload/audio', { method: 'POST', body: formData });
    fileInput.value = '';
    return;
  }

  const nameInput = e.target.closest('#audio-name-input');
  if (nameInput) {
    socket.emit('audio:rename', { locationId: state.activeLocationId, name: nameInput.value });
  }
});

audioContent.addEventListener('click', (e) => {
  const deleteBtn = e.target.closest('#audio-delete-btn');
  if (!deleteBtn) return;

  if (!audioDeleteArmed) {
    audioDeleteArmed = true;
    renderAudioPanel(getActiveLocation());
    clearTimeout(audioDeleteTimer);
    audioDeleteTimer = setTimeout(() => {
      audioDeleteArmed = false;
      const loc = getActiveLocation();
      if (loc) renderAudioPanel(loc);
    }, 2500);
    return;
  }

  clearTimeout(audioDeleteTimer);
  audioDeleteArmed = false;
  socket.emit('audio:delete', { locationId: state.activeLocationId });
});
```

- [ ] **Step 6: Verifica manuale**

Con un server isolato:
1. Apri `/editor`. Nella sidebar compare il pannello "Audio", sotto "Immagini", con il pulsante "Carica traccia audio".
2. Carica un file audio (anche un `.mp3` di prova con `touch`, per verificare solo il flusso UI — il filtro server accetta in base al Content-Type dichiarato dal browser, che per un'estensione `.mp3` sarà `audio/mpeg`): il pannello passa a mostrare il nome del file (modificabile) e un pulsante di eliminazione, più "Sostituisci traccia".
3. Modifica il campo nome e clicca fuori (evento `change`): il nome si aggiorna (verificabile con `curl http://localhost:<porta>/api/state`).
4. Clicca una volta il pulsante di eliminazione: si arma (icona/colore di conferma, come per le immagini). Aspetta 2.5s senza ricliccare: torna allo stato normale, nessuna eliminazione avvenuta.
5. Clicca di nuovo, poi riclicca entro 2.5s: la traccia viene eliminata, il pannello torna a mostrare "Carica traccia audio", il file sparisce dalla cartella storage.
6. Apri `/control` in un'altra scheda con la sezione Audio visibile e la riproduzione in corso: sostituisci la traccia da `/editor` mentre suona → la riproduzione si ferma su `/control`/`/display` (verificato lato server nel Task 1, qui si conferma che il pulsante Play/Pausa di `/control` torna allo stato "fermo").
7. Ferma il server e cancella le cartelle temporanee.

- [ ] **Step 7: Commit**

```bash
git add public/editor/index.html public/editor/editor.js
git commit -m "feat: upload and manage location audio track in /editor"
```
