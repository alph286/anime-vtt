# Gestione multi-location dall'editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettere di creare, rinominare, archiviare e ripristinare location dall'editor (senza mai toccare `data/state.json` a mano), scegliere una location predefinita che l'app carica sempre all'avvio del server, e ripulire i file caricati che non appartengono più a nessuna location.

**Architecture:** Due nuovi campi booleani (`archived`, `isDefault`) su ogni location esistente — nessun cambio al modello dati per mappa/griglia/fog/immagini. Nuovi eventi socket per il CRUD, due nuovi endpoint REST per la pulizia file orfani (stesso stile di `/api/map/clear`), e un pannello nella sidebar dell'editor che riusa lo stile già esistente di Immagini/Fog of war.

**Tech Stack:** Node.js + Express + socket.io lato server (invariato); vanilla JS lato client (invariato); nessuna dipendenza nuova.

## Global Constraints

- Le location rappresentano luoghi/stanze diversi (taverna, dungeon, foresta...), riusano al 100% l'infrastruttura per-location già esistente (mappa/griglia/fog/immagini) — nessun cambio al loro modello dati.
- "Eliminare" una location dall'editor significa **archiviarla**, mai cancellarla: resta in `state.locations`, i suoi file restano su disco, ed è ripristinabile.
- La pulizia dei file orfani è una funzione **separata** dall'archiviazione, più difficile da raggiungere (link discreto, non un pulsante in evidenza), e agisce su **tutti** i file non referenziati da nessuna location — attiva o archiviata — non solo quelli delle location archiviate.
- La location attiva resta un **concetto unico condiviso** tra editor, controllo e display: nessuno stato "in modifica" separato da quello "in onda" sulla TV.
- Quando non c'è nessuna location attiva, display e controllo mostrano il placeholder "nessuna mappa" **già esistente** — nessun nuovo stato visivo da inventare.
- Fog of war, griglia e immagini persistono già per sempre per ogni location, indipendentemente da quale sia attiva o da riavvii del server — comportamento esistente, non toccarlo.
- La location "predefinita" forza sempre `activeLocationId` all'avvio del processo Node, **ignorando** quale fosse rimasta attiva l'ultima volta.
- Mai `window.prompt()`/`window.alert()` (vincolo di progetto pre-esistente) — tutte le conferme distruttive (archivia, purge orfani) usano il pattern arma-poi-conferma già in uso ovunque nell'app (primo click arma per 2.5s con classe `.confirm`, secondo click conferma).
- Nessuna suite di test automatica in questo progetto (scelta di progetto pre-esistente) — verifica tramite `node -c` (sintassi), `node -e` con fixture usa-e-getta su una `DATA_DIR`/`STORAGE_DIR` temporanea, `curl` per gli endpoint REST, e browser dal vivo per socket/UI.
- Non toccare mai lo stato reale della campagna durante la verifica — usare sempre directory/porte temporanee dedicate ai test, mai `data/state.json` o `storage/` del progetto.

---

### Task 1: Modello dati — campi `archived`/`isDefault`

**Files:**
- Modify: `server/state.js`

**Interfaces:**
- Consumes: niente (primo task).
- Produces: ogni location in `state.locations[]` ha sempre i campi `archived: boolean` e `isDefault: boolean` dopo `loadState()`, sia per lo stato di default sia per stati esistenti migrati. I Task 2-3 leggono/scrivono questi due campi.

- [ ] **Step 1: Verifica lo stato "prima"**

Run: `grep -n "archived\|isDefault" /home/kratos/Documenti/Projects/anime-vtt/server/state.js`
Expected: nessun risultato (i campi non esistono ancora).

- [ ] **Step 2: Aggiungi i campi al `DEFAULT_STATE`**

In `server/state.js`, nell'oggetto `DEFAULT_STATE.locations[0]`, aggiungi due righe subito dopo `images: []`:

```js
      images: [],
      archived: false,
      isDefault: true
```

(l'unica location di default è anche quella predefinita all'avvio — altrimenti un'installazione nuova non avrebbe nessuna location predefinita).

- [ ] **Step 3: Estendi `migrate()` per retrocompatibilità**

Nel blocco `(state.locations || []).forEach((location) => { ... })` di `migrate()`, aggiungi due righe subito prima di `(location.images || []).forEach(...)`:

```js
    if (location.archived === undefined) location.archived = false;
    if (location.isDefault === undefined) location.isDefault = false;
```

- [ ] **Step 4: Verifica con una fixture usa-e-getta**

Run:
```bash
rm -rf /tmp/anime-vtt-test-task1
mkdir -p /tmp/anime-vtt-test-task1
cat > /tmp/anime-vtt-test-task1/state.json << 'EOF'
{
  "campaign": {"name": "Test"},
  "gridPreset": {"cellSize": 100, "offsetX": 0, "offsetY": 0, "color": "#ffffff", "lineWidth": 0.3},
  "locations": [
    {"id": "vecchia", "name": "Vecchia location", "map": {"file": null, "type": "image", "scale": 1, "flip180": false, "grid": {"enabled": false, "cellSize": 100, "offsetX": 0, "offsetY": 0, "color": "#ffffff", "lineWidth": 0.3}, "polygons": []}, "images": []}
  ],
  "activeLocationId": "vecchia",
  "activeImageId": null,
  "liveView": {"scale": 1, "offsetX": 0, "offsetY": 0}
}
EOF
cd /home/kratos/Documenti/Projects/anime-vtt
DATA_DIR=/tmp/anime-vtt-test-task1 node -e "
const { loadState } = require('./server/state');
const state = loadState();
const loc = state.locations[0];
console.log(JSON.stringify({ archived: loc.archived, isDefault: loc.isDefault }));
"
```
Expected: `{"archived":false,"isDefault":false}` (una location esistente senza i campi viene migrata a `false`/`false`, non a `true` — solo `DEFAULT_STATE` per un'installazione nuova parte con `isDefault: true`).

Poi verifica anche l'installazione nuova (nessun `state.json` esistente):
```bash
rm -rf /tmp/anime-vtt-test-task1b
DATA_DIR=/tmp/anime-vtt-test-task1b node -e "
const { loadState } = require('./server/state');
const state = loadState();
const loc = state.locations[0];
console.log(JSON.stringify({ archived: loc.archived, isDefault: loc.isDefault }));
"
rm -rf /tmp/anime-vtt-test-task1 /tmp/anime-vtt-test-task1b
```
Expected: `{"archived":false,"isDefault":true}`.

- [ ] **Step 5: Commit**

```bash
cd /home/kratos/Documenti/Projects/anime-vtt
git add server/state.js
git commit -m "Add archived/isDefault fields to location model"
```

---

### Task 2: Location predefinita forzata all'avvio del server

**Files:**
- Modify: `server/state.js`
- Modify: `server/index.js:21` (subito dopo `let state = loadState();`)

**Interfaces:**
- Consumes: `location.archived`/`location.isDefault` dal Task 1.
- Produces: `applyStartupDefault(state)`, esportata da `server/state.js`, firma `(state: object) => object` (muta e ritorna lo stesso oggetto `state`). Chiamata una sola volta in `server/index.js`, subito dopo `loadState()`. Nessun altro task dipende da questa funzione.

- [ ] **Step 1: Aggiungi `applyStartupDefault` a `server/state.js`**

Subito prima di `module.exports`, aggiungi:

```js
// Chiamata una sola volta all'avvio del processo, dopo loadState(): forza
// l'app a partire dalla location marcata come predefinita, ignorando quale
// fosse rimasta attiva l'ultima volta che il server si è fermato. Ricade
// sulla prima location non archiviata se quella predefinita è stata nel
// frattempo archiviata o rimossa, o su nessuna location (null) se non ne
// resta nessuna.
function applyStartupDefault(state) {
  const nonArchived = (state.locations || []).filter((l) => !l.archived);
  const preferred = nonArchived.find((l) => l.isDefault);
  const chosen = preferred || nonArchived[0] || null;
  state.activeLocationId = chosen ? chosen.id : null;
  state.activeImageId = null;
  state.liveView = { scale: 1, offsetX: 0, offsetY: 0 };
  return state;
}
```

- [ ] **Step 2: Esporta la nuova funzione**

Cambia l'ultima riga di `server/state.js` da:
```js
module.exports = { loadState, saveState, DATA_DIR, STATE_FILE };
```
a:
```js
module.exports = { loadState, saveState, applyStartupDefault, DATA_DIR, STATE_FILE };
```

- [ ] **Step 3: Verifica con fixture — la predefinita vince sull'ultima attiva**

Run:
```bash
rm -rf /tmp/anime-vtt-test-task2
mkdir -p /tmp/anime-vtt-test-task2
cat > /tmp/anime-vtt-test-task2/state.json << 'EOF'
{
  "campaign": {"name": "Test"},
  "gridPreset": {"cellSize": 100, "offsetX": 0, "offsetY": 0, "color": "#ffffff", "lineWidth": 0.3},
  "locations": [
    {"id": "a", "name": "A", "map": {"file": null, "type": "image", "scale": 1, "flip180": false, "grid": {"enabled": false, "cellSize": 100, "offsetX": 0, "offsetY": 0, "color": "#ffffff", "lineWidth": 0.3}, "polygons": []}, "images": [], "archived": false, "isDefault": true},
    {"id": "b", "name": "B", "map": {"file": null, "type": "image", "scale": 1, "flip180": false, "grid": {"enabled": false, "cellSize": 100, "offsetX": 0, "offsetY": 0, "color": "#ffffff", "lineWidth": 0.3}, "polygons": []}, "images": [], "archived": false, "isDefault": false}
  ],
  "activeLocationId": "b",
  "activeImageId": null,
  "liveView": {"scale": 2, "offsetX": 5, "offsetY": 5}
}
EOF
cd /home/kratos/Documenti/Projects/anime-vtt
DATA_DIR=/tmp/anime-vtt-test-task2 node -e "
const { loadState, applyStartupDefault } = require('./server/state');
const state = applyStartupDefault(loadState());
console.log(JSON.stringify({ activeLocationId: state.activeLocationId, liveView: state.liveView }));
"
```
Expected: `{"activeLocationId":"a","liveView":{"scale":1,"offsetX":0,"offsetY":0}}` — nonostante `activeLocationId` fosse persistito su `"b"`, l'avvio forza `"a"` (la predefinita) e resetta `liveView`.

- [ ] **Step 4: Verifica il fallback — predefinita archiviata**

Run:
```bash
cat > /tmp/anime-vtt-test-task2/state.json << 'EOF'
{
  "campaign": {"name": "Test"},
  "gridPreset": {"cellSize": 100, "offsetX": 0, "offsetY": 0, "color": "#ffffff", "lineWidth": 0.3},
  "locations": [
    {"id": "a", "name": "A", "map": {"file": null, "type": "image", "scale": 1, "flip180": false, "grid": {"enabled": false, "cellSize": 100, "offsetX": 0, "offsetY": 0, "color": "#ffffff", "lineWidth": 0.3}, "polygons": []}, "images": [], "archived": true, "isDefault": true},
    {"id": "b", "name": "B", "map": {"file": null, "type": "image", "scale": 1, "flip180": false, "grid": {"enabled": false, "cellSize": 100, "offsetX": 0, "offsetY": 0, "color": "#ffffff", "lineWidth": 0.3}, "polygons": []}, "images": [], "archived": false, "isDefault": false}
  ],
  "activeLocationId": "a",
  "activeImageId": null,
  "liveView": {"scale": 1, "offsetX": 0, "offsetY": 0}
}
EOF
DATA_DIR=/tmp/anime-vtt-test-task2 node -e "
const { loadState, applyStartupDefault } = require('./server/state');
const state = applyStartupDefault(loadState());
console.log(state.activeLocationId);
"
rm -rf /tmp/anime-vtt-test-task2
```
Expected: `b` (la predefinita `a` è archiviata, si ricade sulla prima non archiviata).

- [ ] **Step 5: Collega la chiamata in `server/index.js`**

Cambia:
```js
const { loadState, saveState } = require('./state');
```
in:
```js
const { loadState, saveState, applyStartupDefault } = require('./state');
```

Cambia:
```js
let state = loadState();
```
in:
```js
let state = applyStartupDefault(loadState());
```

- [ ] **Step 6: Verifica sintassi**

Run: `node -c /home/kratos/Documenti/Projects/anime-vtt/server/index.js && node -c /home/kratos/Documenti/Projects/anime-vtt/server/state.js`
Expected: nessun errore (uscita silenziosa).

- [ ] **Step 7: Commit**

```bash
cd /home/kratos/Documenti/Projects/anime-vtt
git add server/state.js server/index.js
git commit -m "Force startup on the default location, ignoring last-active"
```

---

### Task 3: Eventi socket per creare/rinominare/archiviare/ripristinare/impostare predefinita

**Files:**
- Modify: `server/state.js` (esporta `DEFAULT_GRID`)
- Modify: `server/index.js` (nuovi handler socket)

**Interfaces:**
- Consumes: `DEFAULT_GRID` da `server/state.js`; `archived`/`isDefault` dal Task 1.
- Produces: eventi socket `location:create` `{}`, `location:rename` `{locationId, name}`, `location:archive` `{locationId}`, `location:restore` `{locationId}`, `location:setDefault` `{locationId}`. Il Task 5 (editor UI) li consuma via `socket.emit(...)`.

- [ ] **Step 1: Esporta `DEFAULT_GRID` da `server/state.js`**

Cambia l'ultima riga da:
```js
module.exports = { loadState, saveState, applyStartupDefault, DATA_DIR, STATE_FILE };
```
a:
```js
module.exports = { loadState, saveState, applyStartupDefault, DEFAULT_GRID, DATA_DIR, STATE_FILE };
```

- [ ] **Step 2: Importa `DEFAULT_GRID` in `server/index.js`**

Cambia:
```js
const { loadState, saveState, applyStartupDefault } = require('./state');
```
in:
```js
const { loadState, saveState, applyStartupDefault, DEFAULT_GRID } = require('./state');
```

- [ ] **Step 3: Aggiungi i cinque handler socket**

In `server/index.js`, subito dopo l'handler `location:set` esistente (dopo la sua chiusura `});`, aggiungi:

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
```

- [ ] **Step 4: Verifica sintassi**

Run: `node -c /home/kratos/Documenti/Projects/anime-vtt/server/index.js`
Expected: nessun errore.

- [ ] **Step 5: Verifica dal vivo via browser (l'editor esistente ha già un oggetto `socket` globale, anche prima che esista l'interfaccia dei Task successivi)**

Avvia il server in una directory di test isolata (mai `data/`/`storage/` reali):
```bash
mkdir -p /tmp/anime-vtt-test-task3/data /tmp/anime-vtt-test-task3/storage
cd /home/kratos/Documenti/Projects/anime-vtt
DATA_DIR=/tmp/anime-vtt-test-task3/data STORAGE_DIR=/tmp/anime-vtt-test-task3/storage PORT=3099 node server/index.js &
sleep 1
curl -s http://localhost:3099/api/state | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const s=JSON.parse(d);console.log('locations iniziali:', s.locations.length);});"
```

Se hai accesso a strumenti browser: apri `http://localhost:3099/editor`, poi nella console della pagina (che ha già `const socket = io();` globale) esegui in sequenza, verificando `curl http://localhost:3099/api/state` dopo ciascuno:
1. `socket.emit('location:create', {})` → `state.locations.length` passa da 1 a 2, la nuova ha `name: "Nuova location"`, `archived: false`, `isDefault: false`, e `state.activeLocationId` punta a lei.
2. `socket.emit('location:rename', { locationId: <id nuova location>, name: 'Prova' })` → il suo `name` diventa `"Prova"`.
3. `socket.emit('location:archive', { locationId: <id nuova location> })` → `archived: true` e `state.activeLocationId` torna `null` (era quella attiva).
4. `socket.emit('location:restore', { locationId: <id nuova location> })` → `archived: false`.
5. `socket.emit('location:setDefault', { locationId: <id nuova location> })` → la nuova ha `isDefault: true`, la location originale (`taverna`) ha `isDefault: false`.

Se non hai strumenti browser disponibili in questo ambiente, annotalo esplicitamente nel report — il controller farà questa verifica dal vivo separatamente.

Ferma il server di test e pulisci:
```bash
kill %1 2>/dev/null
rm -rf /tmp/anime-vtt-test-task3
```

- [ ] **Step 6: Commit**

```bash
cd /home/kratos/Documenti/Projects/anime-vtt
git add server/state.js server/index.js
git commit -m "Add location create/rename/archive/restore/setDefault socket events"
```

---

### Task 4: Endpoint REST per lo scan e la pulizia dei file orfani

**Files:**
- Modify: `server/index.js`

**Interfaces:**
- Consumes: `state.locations` (letto direttamente, nessuna nuova dipendenza da task precedenti oltre a quanto già presente).
- Produces: `POST /api/storage/orphans/scan` → `{ orphans: [{file, kind, size}, ...] }` dove `kind` è `"maps"` o `"images"`. `POST /api/storage/orphans/purge` con body `{ files: [{file, kind}, ...] }` → `{ deleted: [{file, kind}, ...] }`. Il Task 6 (editor UI) consuma entrambi via `fetch`.

- [ ] **Step 1: Aggiungi `findOrphanFiles()` e i due endpoint**

In `server/index.js`, subito dopo la funzione `deleteUploadedFile` esistente (dopo la sua chiusura `}`), aggiungi:

```js
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
```

- [ ] **Step 2: Verifica sintassi**

Run: `node -c /home/kratos/Documenti/Projects/anime-vtt/server/index.js`
Expected: nessun errore.

- [ ] **Step 3: Verifica con server di test isolato e file di prova**

```bash
mkdir -p /tmp/anime-vtt-test-task4/data /tmp/anime-vtt-test-task4/storage/maps /tmp/anime-vtt-test-task4/storage/images
echo "file di prova orfano" > /tmp/anime-vtt-test-task4/storage/maps/orfano-test.png
cd /home/kratos/Documenti/Projects/anime-vtt
DATA_DIR=/tmp/anime-vtt-test-task4/data STORAGE_DIR=/tmp/anime-vtt-test-task4/storage PORT=3098 node server/index.js &
sleep 1

echo "--- scan (deve trovare orfano-test.png) ---"
curl -s -X POST http://localhost:3098/api/storage/orphans/scan

echo ""
echo "--- purge (deve cancellarlo) ---"
curl -s -X POST http://localhost:3098/api/storage/orphans/purge -H "Content-Type: application/json" -d '{"files":[{"file":"orfano-test.png","kind":"maps"}]}'

echo ""
echo "--- il file è sparito dal disco? ---"
ls /tmp/anime-vtt-test-task4/storage/maps/ | grep orfano-test.png || echo "confermato: cancellato"

echo "--- secondo scan (deve essere vuoto) ---"
curl -s -X POST http://localhost:3098/api/storage/orphans/scan

kill %1 2>/dev/null
rm -rf /tmp/anime-vtt-test-task4
```
Expected: primo scan restituisce `{"orphans":[{"file":"orfano-test.png","kind":"maps","size":22}]}` (size può variare leggermente in base a newline); purge restituisce `{"deleted":[{"file":"orfano-test.png","kind":"maps"}]}`; il file è confermato cancellato; il secondo scan restituisce `{"orphans":[]}`.

- [ ] **Step 4: Commit**

```bash
cd /home/kratos/Documenti/Projects/anime-vtt
git add server/index.js
git commit -m "Add orphan file scan/purge REST endpoints"
```

---

### Task 5: Editor — pannello Location (crea/rinomina/archivia/ripristina/predefinita) e gestione assenza location attiva

Questo task è volutamente unico invece di due task separati: il pannello introduce l'unico modo di arrivare allo stato "nessuna location attiva" (archiviando l'ultima), quindi la pagina deve già saper gestire quello stato in sicurezza nello stesso commit — altrimenti un singolo click romperebbe la pagina tra un task e l'altro.

**Files:**
- Modify: `public/editor/index.html`
- Modify: `public/editor/editor.js`
- Modify: `public/editor/editor.css`

**Interfaces:**
- Consumes: eventi socket `location:create`/`rename`/`archive`/`restore`/`setDefault` dal Task 3.
- Produces: `renderLocationPanel()`, `setLocationControlsDisabled(disabled: boolean)` — funzioni locali a `editor.js`, nessun altro task le consuma (il Task 8, la verifica finale, le esercita solo tramite l'interfaccia, non chiamandole direttamente).

- [ ] **Step 1: Aggiungi le due nuove icone allo sprite SVG**

In `public/editor/index.html`, dentro il blocco `<svg style="display:none">`, subito dopo il `<symbol id="i-expand" ...>` esistente, aggiungi:

```html
  <symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 4v16M4 12h16"/></symbol>
  <symbol id="i-star" viewBox="0 0 24 24"><path d="M12 3l2.6 5.8 6.4.6-4.8 4.3 1.4 6.3L12 16.9 6.4 20l1.4-6.3-4.8-4.3 6.4-.6z"/></symbol>
```

- [ ] **Step 2: Aggiungi il pulsante "nuova location" nell'header**

Cambia:
```html
<header class="topbar">
  <select id="location-select"></select>
</header>
```
in:
```html
<header class="topbar">
  <select id="location-select"></select>
  <button id="location-create" class="icon-btn" title="Nuova location">
    <svg class="icon"><use href="#i-plus"></use></svg>
  </button>
</header>
```

- [ ] **Step 3: Aggiungi il pannello "Location" come prima sezione della sidebar**

Cambia:
```html
  <aside class="col col-sidebar">
    <section>
      <h2>Immagini</h2>
```
in:
```html
  <aside class="col col-sidebar">
    <section>
      <h2>Location</h2>
      <div id="location-list" class="image-editor-list"></div>
      <div id="location-archived-wrap" hidden>
        <p class="hint">Archiviate</p>
        <div id="location-archived-list" class="image-editor-list"></div>
      </div>
    </section>

    <section>
      <h2>Immagini</h2>
```

- [ ] **Step 4: Aggiungi lo stile per la stella "predefinita"**

In `public/editor/editor.css`, subito dopo la regola `.icon-btn.confirm { ... }` esistente, aggiungi:

```css
.icon-btn.starred .icon {
  fill: var(--accent);
  color: var(--accent);
}
```

- [ ] **Step 5: Verifica sintassi CSS**

Run: `node -e "const fs=require('fs'); const c=fs.readFileSync('/home/kratos/Documenti/Projects/anime-vtt/public/editor/editor.css','utf8'); const o=(c.match(/{/g)||[]).length; const cl=(c.match(/}/g)||[]).length; console.log(o===cl ? 'OK '+o : 'MISMATCH open='+o+' close='+cl);"`
Expected: `OK` seguito dal numero di blocchi.

- [ ] **Step 6: Aggiungi i riferimenti DOM in `editor.js`**

Subito dopo la riga esistente `const locationSelect = document.getElementById('location-select');`, aggiungi:

```js
const locationCreateBtn = document.getElementById('location-create');
const locationList = document.getElementById('location-list');
const locationArchivedWrap = document.getElementById('location-archived-wrap');
const locationArchivedList = document.getElementById('location-archived-list');
```

- [ ] **Step 7: Aggiungi la lista dei controlli da disabilitare senza location attiva**

Subito dopo il blocco di `const X = document.getElementById(...)` esistente (dopo `const lightboxCloseBtn = document.getElementById('lightbox-close');`), aggiungi:

```js
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
```

- [ ] **Step 8: Sostituisci `render()` per aggiungere il pannello e la guardia "nessuna location"**

Sostituisci l'intera funzione `render()` esistente con:

```js
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
```

- [ ] **Step 9: Chiudi l'unico altro varco che crasherebbe senza location attiva**

Nel listener `overlayBox.addEventListener('pointerdown', (e) => { ... })` esistente, trova questo blocco:
```js
  if (mode !== 'select') return;
  const location = getActiveLocation();
  const point = basePointFromClientXY(e.clientX, e.clientY);
```
e cambialo in:
```js
  if (mode !== 'select') return;
  const location = getActiveLocation();
  if (!location) return;
  const point = basePointFromClientXY(e.clientX, e.clientY);
```

(gli altri modi, `'draw'` e `'grid-align'`, sono raggiungibili solo cliccando pulsanti ora dentro `LOCATION_DEPENDENT_CONTROLS` e quindi disabilitati senza location attiva — ma `mode` parte da `'select'` di default, quindi questo percorso resta raggiungibile anche a pagina appena caricata senza alcuna location, cliccando direttamente sul canvas/placeholder).

Come difesa aggiuntiva, in `renderPolygonsSvg()`, subito dopo la riga `const location = getActiveLocation();`, aggiungi una guardia. Cambia:
```js
function renderPolygonsSvg() {
  const location = getActiveLocation();
  polygonSvg.innerHTML = '';
  overlayBox.querySelectorAll('.vertex-handle, .draw-point').forEach((el) => el.remove());
```
in:
```js
function renderPolygonsSvg() {
  const location = getActiveLocation();
  polygonSvg.innerHTML = '';
  overlayBox.querySelectorAll('.vertex-handle, .draw-point').forEach((el) => el.remove());
  if (!location) return;
```

- [ ] **Step 10: Aggiungi `renderLocationPanel()` e i suoi handler**

Alla fine di `editor.js`, aggiungi:

```js
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
```

- [ ] **Step 11: Verifica sintassi**

Run: `node -c /home/kratos/Documenti/Projects/anime-vtt/public/editor/editor.js`
Expected: nessun errore.

- [ ] **Step 12: Verifica dal vivo nel browser**

Avvia un server di test isolato (stesso schema del Task 3/4, `DATA_DIR`/`STORAGE_DIR`/`PORT` dedicati, mai i dati reali) e apri `/editor`. Se hai strumenti browser:
1. Click su "+" nell'header → una riga "Nuova location" appare nel pannello Location, il canvas mostra il placeholder vuoto (nessuna mappa), tutti i controlli della toolbar sono di nuovo attivi.
2. Rinomina la nuova location dal campo testo nel pannello → il nome cambia anche nel menu a tendina in alto.
3. Click sulla stella della nuova location → diventa piena/ambra; la stella di "Taverna" (la predefinita di default) si svuota.
4. Click sul cestino della nuova location due volte (arma-poi-conferma) → la riga sparisce dall'elenco attive, compare in "Archiviate"; siccome era quella attiva, il canvas torna al placeholder e **tutti i controlli della toolbar diventano disabilitati** (verifica visivamente che siano grigi/non cliccabili).
5. Con nessuna location attiva, clicca direttamente sul canvas placeholder → nessun errore in console (verifica con gli strumenti di lettura console del browser).
6. Click su "ripristina" nella lista Archiviate → la location torna nella lista attive (ma non diventa automaticamente quella attiva/selezionata — verifica che il menu a tendina in alto NON cambi).

Se non hai strumenti browser disponibili, annotalo esplicitamente nel report — il controller farà questa verifica dal vivo separatamente.

Ferma il server di test e pulisci la directory temporanea.

- [ ] **Step 13: Commit**

```bash
cd /home/kratos/Documenti/Projects/anime-vtt
git add public/editor/index.html public/editor/editor.js public/editor/editor.css
git commit -m "Add editor Location panel: create/rename/archive/restore/default"
```

---

### Task 6: Editor — pulizia file orfani

**Files:**
- Modify: `public/editor/index.html`
- Modify: `public/editor/editor.js`
- Modify: `public/editor/editor.css`

**Interfaces:**
- Consumes: `POST /api/storage/orphans/scan` e `POST /api/storage/orphans/purge` dal Task 4.
- Produces: niente che altri task consumino — è l'ultima funzionalità isolata prima della verifica finale.

- [ ] **Step 1: Aggiungi la sezione in fondo alla sidebar**

In `public/editor/index.html`, subito prima della chiusura `</aside>` (dopo la sezione "Fine tuning griglia" esistente), aggiungi:

```html
    <section>
      <button id="orphans-scan-btn" class="link-btn">pulisci file orfani</button>
      <div id="orphans-panel" hidden>
        <div id="orphans-list" class="hint"></div>
        <button id="orphans-purge-btn" hidden>conferma cancellazione</button>
      </div>
    </section>
```

- [ ] **Step 2: Aggiungi lo stile del link discreto**

In `public/editor/editor.css`, subito dopo la regola `.file-btn input { display: none; }` esistente, aggiungi:

```css
.link-btn {
  background: none;
  border: none;
  padding: 0;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  text-decoration: underline;
}

button.confirm {
  background: var(--danger);
  border-color: var(--danger);
  color: #fff;
}
```

- [ ] **Step 3: Verifica sintassi CSS**

Run: `node -e "const fs=require('fs'); const c=fs.readFileSync('/home/kratos/Documenti/Projects/anime-vtt/public/editor/editor.css','utf8'); const o=(c.match(/{/g)||[]).length; const cl=(c.match(/}/g)||[]).length; console.log(o===cl ? 'OK '+o : 'MISMATCH open='+o+' close='+cl);"`
Expected: `OK` seguito dal numero di blocchi.

- [ ] **Step 4: Aggiungi la logica in `editor.js`**

Alla fine del file, aggiungi:

```js
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
```

- [ ] **Step 5: Verifica sintassi**

Run: `node -c /home/kratos/Documenti/Projects/anime-vtt/public/editor/editor.js`
Expected: nessun errore.

- [ ] **Step 6: Verifica dal vivo nel browser**

Server di test isolato come nei task precedenti, con un file di prova orfano piazzato a mano in `storage/maps/` (mai nei dati reali). Se hai strumenti browser: apri `/editor`, click su "pulisci file orfani" → il file di prova compare nell'elenco con nome e dimensione; click sul pulsante di conferma due volte (arma-poi-conferma) → il file sparisce dall'elenco e dal disco (verifica con `ls`); un secondo scan risulta vuoto.

Se non hai strumenti browser disponibili, annotalo nel report — il controller verifica dal vivo separatamente.

Ferma il server di test e pulisci la directory temporanea.

- [ ] **Step 7: Commit**

```bash
cd /home/kratos/Documenti/Projects/anime-vtt
git add public/editor/index.html public/editor/editor.js public/editor/editor.css
git commit -m "Add orphan file cleanup UI to editor sidebar"
```

---

### Task 7: Display e Controllo — gestione assenza location attiva

**Files:**
- Modify: `public/display/display.js`
- Modify: `public/control/control.js`

**Interfaces:**
- Consumes: `state.activeLocationId` può ora essere `null` (dai Task 2/3).
- Produces: niente che altri task consumino.

- [ ] **Step 1: Estendi la guardia in `public/display/display.js`**

Sostituisci l'intera funzione `renderMap` con:

```js
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
```

(l'unico cambio rispetto a prima: rimosso il primo `return` su `!location`, e le due condizioni ora controllano anche `location &&` — così l'assenza di location cade nello stesso ramo già esistente per "nessuna mappa caricata", che già mostra il placeholder corretto).

- [ ] **Step 2: Estendi le guardie in `public/control/control.js`**

Sostituisci l'intera funzione `render` con:

```js
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
```

Sostituisci l'intera funzione `renderMapPreview` con:

```js
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
```

(due cambi rispetto a prima: `locationSelect` ora filtra le location archiviate — non devono comparire come selezionabili dal telefono; ed entrambe le funzioni ora gestiscono `location` assente cadendo nello stesso placeholder già esistente per "nessuna mappa").

- [ ] **Step 3: Verifica sintassi**

Run: `node -c /home/kratos/Documenti/Projects/anime-vtt/public/display/display.js && node -c /home/kratos/Documenti/Projects/anime-vtt/public/control/control.js`
Expected: nessun errore.

- [ ] **Step 4: Verifica dal vivo nel browser**

Server di test isolato. Se hai strumenti browser: apri `/display` e `/control` in due tab; usa la console della tab editor (o direttamente il `socket` globale di una qualunque pagina) per emettere `socket.emit('location:archive', { locationId: <id location attiva> })` (una volta che il Task 5 è già mergiato questo si può fare anche dal pulsante vero e proprio) — verifica che sia `/display` sia `/control` mostrino il placeholder "nessuna mappa" senza errori in console, e che il menu a tendina di `/control` non elenchi la location appena archiviata.

Se non hai strumenti browser disponibili, annotalo nel report — il controller verifica dal vivo separatamente.

- [ ] **Step 5: Commit**

```bash
cd /home/kratos/Documenti/Projects/anime-vtt
git add public/display/display.js public/control/control.js
git commit -m "Handle no-active-location gracefully in display and control"
```

---

### Task 8: Verifica finale end-to-end

Nessun file nuovo da modificare in questo task oltre a eventuali piccole correzioni emerse dalla verifica — è il test di integrazione completo, sulla falsariga della sezione "Verifica" dello spec.

**Files:**
- Nessuno pianificato (solo verifica; eventuali fix minori vanno nei file toccati dai task precedenti).

**Interfaces:**
- Consumes: tutto quanto prodotto dai Task 1-7.
- Produces: niente — è l'ultimo task del piano.

- [ ] **Step 1: Verifica sintattica completa**

Run:
```bash
cd /home/kratos/Documenti/Projects/anime-vtt
node -c server/index.js
node -c server/state.js
node -c public/editor/editor.js
node -c public/display/display.js
node -c public/control/control.js
```
Expected: nessun errore su nessuno dei cinque file.

- [ ] **Step 2: Avvia un server di verifica isolato**

```bash
mkdir -p /tmp/anime-vtt-test-final/data /tmp/anime-vtt-test-final/storage/maps /tmp/anime-vtt-test-final/storage/images
cd /home/kratos/Documenti/Projects/anime-vtt
DATA_DIR=/tmp/anime-vtt-test-final/data STORAGE_DIR=/tmp/anime-vtt-test-final/storage PORT=3097 node server/index.js &
sleep 1
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3097/api/state
```
Expected: `200`.

- [ ] **Step 3: Flusso completo dall'editor (browser, se disponibile)**

Apri `/editor` (porta 3097). In sequenza: crea una location, rinominala, impostala come predefinita, verifica che appaia subito nel menu e sia attiva; crea una seconda location, archivia la prima (quella predefinita) — verifica che la seconda resti attiva e visibile mentre la prima sparisce dal menu principale ma compare in "Archiviate"; ripristina la prima.

- [ ] **Step 4: Nessuna location attiva — sicurezza su tutte e tre le superfici**

Archivia tutte le location esistenti una per una (compresa l'ultima — deve essere permesso). Apri `/display` e `/control` in tab separate: entrambe devono mostrare il placeholder senza errori in console. Nell'editor, tutti i controlli della toolbar devono risultare disabilitati e un click sul canvas placeholder non deve produrre errori.

- [ ] **Step 5: La location predefinita vince sull'ultima attiva dopo un riavvio**

Ripristina una location e impostala come predefinita. Cambia manualmente a un'altra location (se ne hai create più di una) così che `activeLocationId` persistito sia diverso da quella predefinita. Ferma il server (`kill %1`) e riavvialo con lo stesso `DATA_DIR`:
```bash
kill %1 2>/dev/null
sleep 1
DATA_DIR=/tmp/anime-vtt-test-final/data STORAGE_DIR=/tmp/anime-vtt-test-final/storage PORT=3097 node server/index.js &
sleep 1
curl -s http://localhost:3097/api/state | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const s=JSON.parse(d);console.log('activeLocationId:', s.activeLocationId);});"
```
Expected: `activeLocationId` è quello della location marcata predefinita, non quello scelto manualmente prima del riavvio.

- [ ] **Step 6: Pulizia file orfani, end-to-end**

Piazza un file di prova non referenziato in `storage/maps/`, esegui uno scan dall'editor (o via curl), conferma che compaia, esegui la purge con conferma, verifica che sparisca dal disco.

- [ ] **Step 7: Ferma e rimuovi l'ambiente di test**

```bash
kill %1 2>/dev/null
rm -rf /tmp/anime-vtt-test-final
```

- [ ] **Step 8: Commit finale (solo se la verifica ha richiesto una correzione)**

Se tutti i controlli precedenti sono passati senza modifiche, non c'è nulla da committare in questo task. Se invece è emersa una piccola correzione non prevista nei task precedenti:

```bash
cd /home/kratos/Documenti/Projects/anime-vtt
git add -A
git commit -m "Fix: <descrizione della correzione trovata in verifica>"
```
