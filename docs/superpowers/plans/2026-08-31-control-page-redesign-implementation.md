# Redesign pagina di controllo (telefono/tablet) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ridisegnare `/control` (mappa, fog of war, pan/zoom, immagini) perché sia comodamente utilizzabile da telefono e tablet, in verticale e in orizzontale, chiudendo i tre nodi di usabilità individuati da una revisione UX dedicata: spazio insufficiente per la mappa, bersagli fog troppo piccoli, ciclo di feedback aperto verso il DM.

**Architecture:** Un solo breakpoint di larghezza (700px) sostituisce quattro casi per dispositivo/orientamento — sotto: colonna singola; sopra: due colonne (mappa + pannello laterale). L'elenco fog diventa permanente invece che un ripiego nascosto. Il server inizia a tracciare le dimensioni del viewport della TV (in memoria, mai persistite) per calcolare un rettangolo di inquadratura live, trascinabile dietro un interruttore esplicito.

**Tech Stack:** Node.js + Express + socket.io lato server (invariato); vanilla JS/CSS lato client (invariato); nessuna dipendenza nuova, nessun framework, nessun build step.

## Global Constraints

- Nessun cambio alla palette colori (`public/shared/theme.css`) — si usano solo i token già esistenti.
- Nessuna nuova dipendenza npm, nessun framework, nessun build step.
- Mai `window.prompt()`/`window.alert()` — le conferme (cambio location, rivela-tutto) usano varianti del pattern arma-poi-conferma già in uso nell'app.
- Breakpoint di layout: esattamente 700px di larghezza viewport.
- `state.displayViewport` non va MAI persistito in `data/state.json` — vive come variabile separata in `server/index.js`, mai come proprietà dell'oggetto `state` che `saveState()` serializza; viene solo unito (`{ ...state, displayViewport }`) nei payload `state:update` inviati ai client.
- Nessuna suite di test automatica nel progetto (scelta di progetto pre-esistente) — verifica tramite `node -c`, server isolati con `DATA_DIR`/`STORAGE_DIR`/`PORT` temporanei, curl per gli endpoint REST, e browser dal vivo (incluso `resize_window` per emulare le quattro combinazioni dispositivo/orientamento) — mai sui dati reali della campagna.
- "Nascondi tutto" (fog) è sempre istantaneo, senza conferma. "Rivela tutto" usa sempre arma-poi-conferma. Non invertire questa asimmetria: è deliberata (nascondere non è mai dannoso, rivelare rischia lo spoiler).
- Il pulsante "sposta inquadratura" (drag-to-pan) resta disabilitato finché `state.displayViewport` non è noto — nessun vicolo cieco, il pad direzionale resta sempre disponibile come alternativa.

---

## Riferimento: contenuto attuale dei file toccati

Prima di iniziare, questi sono i file che i task modificano, nel loro stato più recente (per orientarsi — i task successivi mostrano gli esatti diff):
- `server/index.js` — server Express + socket.io, tutti gli handler di stato.
- `public/control/index.html`, `public/control/control.css`, `public/control/control.js` — la pagina da ridisegnare.
- `public/display/display.js`, `public/display/index.html` — per il pattern del puntino wifi da riusare, e per aggiungere l'invio delle dimensioni del proprio viewport.
- `public/shared/media.js` — funzioni condivise (`fitRect`, `layoutMapWrap`, `escapeHtml`, `loadMapMedia`, `mediaW`/`mediaH`, `computeTotalRotation`) — nessuna di queste viene modificata, solo riusate.

---

### Task 1: Server — viewport del display, tracciamento connessione display, azione di massa sul fog

**Files:**
- Modify: `server/index.js`
- Modify: `public/display/display.js`

**Interfaces:**
- Consumes: nessuna (primo task di questo piano).
- Produces: evento socket in ingresso `display:viewport` `{width, height}`; evento socket in ingresso `fow:setAll` `{locationId, revealed}`; evento socket in uscita `display:status` `{connected}`; ogni payload `state:update` d'ora in poi include anche `displayViewport` (oggetto `{width,height}` o `null`) accanto ai campi esistenti. I Task 4 e 5 (client) consumano `state.displayViewport` e l'evento `display:status`. Il Task 3 consuma `fow:setAll`.

- [ ] **Step 1: Verifica lo stato "prima"**

Run: `grep -n "displaySockets\|displayViewport\|fow:setAll" /home/kratos/Documenti/Projects/anime-vtt/server/index.js`
Expected: nessun risultato.

- [ ] **Step 2: Aggiungi lo stato del viewport display e il tracciamento connessione**

In `server/index.js`, cambia:
```js
const controlSockets = new Set();

function broadcastState() {
  io.emit('state:update', state);
}

function broadcastControlStatus() {
  io.emit('control:status', { connected: controlSockets.size > 0 });
}
```
in:
```js
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
```

- [ ] **Step 3: Aggiorna gli invii iniziali alla connessione e l'handler `hello`**

Cambia:
```js
io.on('connection', (socket) => {
  socket.emit('state:update', state);
  socket.emit('control:status', { connected: controlSockets.size > 0 });

  socket.on('hello', ({ role }) => {
    if (role === 'control') {
      controlSockets.add(socket.id);
      broadcastControlStatus();
    }
  });
```
in:
```js
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
```

- [ ] **Step 4: Aggiungi la pulizia alla disconnessione**

Cambia:
```js
  socket.on('disconnect', () => {
    controlSockets.delete(socket.id);
    broadcastControlStatus();
  });
```
in:
```js
  socket.on('disconnect', () => {
    controlSockets.delete(socket.id);
    broadcastControlStatus();
    displaySockets.delete(socket.id);
    broadcastDisplayStatus();
  });
```

- [ ] **Step 5: Aggiungi l'evento di massa sul fog**

Subito dopo l'handler `fow:toggle` esistente (dopo la sua chiusura `});`), aggiungi:
```js
  socket.on('fow:setAll', ({ locationId, revealed }) => {
    const location = state.locations.find((l) => l.id === locationId);
    if (!location) return;
    (location.map.polygons || []).forEach((p) => { p.revealed = Boolean(revealed); });
    saveState(state);
    broadcastState();
  });
```

- [ ] **Step 6: `display.js` riporta le proprie dimensioni al server**

In `public/display/display.js`, cambia:
```js
socket.on('connect', () => {
  socketConnected = true;
  socket.emit('hello', { role: 'display' });
  updateWifi();
});
```
in:
```js
function reportViewport() {
  socket.emit('display:viewport', { width: window.innerWidth, height: window.innerHeight });
}

socket.on('connect', () => {
  socketConnected = true;
  socket.emit('hello', { role: 'display' });
  reportViewport();
  updateWifi();
});
```

Poi cambia:
```js
window.addEventListener('resize', () => {
  if (lastState) render(lastState);
});
```
in:
```js
window.addEventListener('resize', () => {
  reportViewport();
  if (lastState) render(lastState);
});
```

- [ ] **Step 7: Verifica sintassi**

Run: `node -c /home/kratos/Documenti/Projects/anime-vtt/server/index.js && node -c /home/kratos/Documenti/Projects/anime-vtt/public/display/display.js`
Expected: nessun errore.

- [ ] **Step 8: Verifica dal vivo su server isolato**

```bash
mkdir -p /tmp/anime-vtt-test-task1/data /tmp/anime-vtt-test-task1/storage/maps /tmp/anime-vtt-test-task1/storage/images
cd /home/kratos/Documenti/Projects/anime-vtt
DATA_DIR=/tmp/anime-vtt-test-task1/data STORAGE_DIR=/tmp/anime-vtt-test-task1/storage PORT=3089 nohup node server/index.js > /tmp/anime-vtt-test-task1/server.log 2>&1 &
sleep 1
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3089/api/state
```
Expected: `200`.

Se hai strumenti browser: apri `http://localhost:3089/display`. Nella console della pagina (`lastState` è già una variabile globale del file):
1. Attendi ~1s dopo il caricamento, poi leggi `lastState.displayViewport` — deve corrispondere a `{width: window.innerWidth, height: window.innerHeight}` (inviato automaticamente alla connessione).
2. Ridimensiona la finestra del browser (`resize_window` se disponibile) e verifica che `lastState.displayViewport` si aggiorni di conseguenza.

Apri anche `/editor` in un'altra tab (ha già `const socket = io();` globale) ed esegui `socket.emit('fow:setAll', { locationId: 'taverna', revealed: true });`, poi verifica via `curl http://localhost:3089/api/state` che tutti i poligoni della location `taverna` abbiano `revealed: true`. Riporta poi lo stato a `revealed: false` con un secondo emit, per non lasciare lo stato di test alterato.

Se non hai strumenti browser, annotalo nel report — il controller verifica dal vivo separatamente.

```bash
kill %1 2>/dev/null
rm -rf /tmp/anime-vtt-test-task1
```

- [ ] **Step 9: Commit**

```bash
cd /home/kratos/Documenti/Projects/anime-vtt
git add server/index.js public/display/display.js
git commit -m "Add display viewport reporting, display connection tracking, fow:setAll"
```

---

### Task 2: Layout responsive — breakpoint, mappa dinamica, riordino, bug fix

**Files:**
- Modify: `public/control/index.html` (sostituzione integrale)
- Modify: `public/control/control.css` (sostituzione integrale)
- Modify: `public/control/control.js`

**Interfaces:**
- Consumes: nessuna dai task precedenti (usa solo l'infrastruttura client già esistente).
- Produces: markup con i nuovi id `#app`, `#map-column`, `#control-column`, `#showing-banner`/`#showing-banner-name`, `#viewport-rect`, `#pan-mode-toggle`, `#wifi-dot`, `#location-confirm-row`/`#location-confirm-name`/`#location-confirm-yes`/`#location-confirm-no`, `#fow-hide-all`/`#fow-reveal-all` — presenti nel DOM da questo task in poi ma senza comportamento proprio finché i Task 3-6 non li cablano. Variabile modulo `currentImageRect` in `control.js` (il riquadro dell'ultima mappa posizionata, in pixel locali) — i Task 4 la leggono.

- [ ] **Step 1: Sostituisci integralmente `public/control/index.html`**

```html
<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Anime VTT — Controllo</title>
<link rel="stylesheet" href="/shared/theme.css">
<link rel="stylesheet" href="control.css">
</head>
<body>
<svg style="display:none">
  <symbol id="i-move" viewBox="0 0 24 24"><path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/></symbol>
</svg>

<div id="wifi-dot" class="bad">
  <svg viewBox="0 0 24 24"><path d="M12 20a1.6 1.6 0 1 0 0-3.2A1.6 1.6 0 0 0 12 20Zm-6.4-6.2a9 9 0 0 1 12.8 0l-2 2a6.2 6.2 0 0 0-8.8 0l-2-2Zm-3.8-4a14 14 0 0 1 20.4 0l-2 2a11.2 11.2 0 0 0-16.4 0l-2-2Z"/></svg>
</div>

<div id="app">
  <div id="map-column">
    <div id="showing-banner" class="showing-banner" hidden>Stai mostrando <strong id="showing-banner-name"></strong> ai giocatori</div>
    <div id="map-preview" class="map-preview">
      <div class="media-wrap" id="map-media-wrap">
        <div class="fit-box" id="map-fit-box">
          <img id="map-img" class="media-img" draggable="false" hidden>
          <video id="map-video" class="media-img" muted loop playsinline disablepictureinpicture hidden></video>
          <div class="map-placeholder" id="map-placeholder" hidden></div>
          <div class="fog-layer" id="map-fog-layer"></div>
        </div>
      </div>
      <div id="viewport-rect" hidden></div>
      <button id="pan-mode-toggle" class="icon-btn" title="Sposta inquadratura trascinando" disabled>
        <svg class="icon"><use href="#i-move"></use></svg>
      </button>
    </div>
  </div>

  <div id="control-column">
    <div class="row">
      <select id="location-select"></select>
    </div>
    <div id="location-confirm-row" class="confirm-row" hidden>
      <span>Passare a "<strong id="location-confirm-name"></strong>"?</span>
      <button id="location-confirm-yes">Conferma</button>
      <button id="location-confirm-no">Annulla</button>
    </div>

    <section id="pan-zoom-section">
      <h2>Vista live sulla mappa (pan / zoom)</h2>
      <div class="pan-zoom">
        <div class="pad">
          <span></span>
          <button data-pan="0,-1">▲</button>
          <span></span>
          <button data-pan="-1,0">◀</button>
          <span></span>
          <button data-pan="1,0">▶</button>
          <span></span>
          <button data-pan="0,1">▼</button>
          <span></span>
        </div>
        <button id="view-reset" title="Reset vista">⟳</button>
        <div class="zoom">
          <span>-</span>
          <input type="range" id="zoom-range" min="1" max="20" step="1" value="5">
          <span>+</span>
        </div>
      </div>
    </section>

    <section>
      <h2>Fog of war — tocca una zona per rivelarla/nasconderla</h2>
      <div class="fow-bulk">
        <button id="fow-hide-all">Nascondi tutto</button>
        <button id="fow-reveal-all">Rivela tutto</button>
      </div>
      <div id="fow-list" class="list"></div>
    </section>

    <section>
      <h2>Immagini</h2>
      <div id="images-list" class="thumb-row"></div>
      <button id="back-to-map" class="primary">Torna alla mappa</button>
    </section>

    <section>
      <div class="opacity-row">
        <label for="fog-opacity">opacità fog (solo qui, non sul display)</label>
        <input type="range" id="fog-opacity" min="0" max="100" value="45">
      </div>
    </section>
  </div>
</div>
<script src="/socket.io/socket.io.js"></script>
<script src="/shared/media.js"></script>
<script src="control.js"></script>
</body>
</html>
```

- [ ] **Step 2: Sostituisci integralmente `public/control/control.css`**

```css
* {
  box-sizing: border-box;
}

/* Un [hidden] senza questa regola può essere vinto da un display d'autore
   con la stessa specificità — già successo una volta in editor.css. */
[hidden] {
  display: none !important;
}

body {
  margin: 0;
  font-family: system-ui, sans-serif;
  background: var(--bg-page);
  color: var(--text-primary);
}

select, button, input[type="range"] {
  font-size: 15px;
  font-family: inherit;
}

h2 {
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary);
  margin: 0 0 8px;
}

#wifi-dot {
  position: fixed;
  top: 12px;
  right: 12px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 20;
  transition: background-color 0.3s, opacity 0.3s;
}

#wifi-dot.ok {
  background: #2e7d32;
  opacity: 0;
}

#wifi-dot.bad {
  background: #c62828;
  opacity: 1;
}

#wifi-dot svg {
  width: 18px;
  height: 18px;
  fill: #fff;
}

#app {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  padding: 16px;
  gap: 16px;
  max-width: 1400px;
  margin: 0 auto;
}

#map-column {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

#control-column {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.row {
  display: flex;
  gap: 8px;
}

.row select {
  flex: 1;
  height: 44px;
  border-radius: 8px;
  border: 1px solid var(--border-control);
  background: var(--bg-control);
  color: var(--text-primary);
}

.confirm-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 13px;
  color: var(--text-secondary);
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 10px;
}

.confirm-row strong {
  color: var(--text-primary);
}

.showing-banner {
  font-size: 14px;
  color: var(--accent);
  background: var(--accent-bg-subtle);
  border: 1px solid var(--accent);
  border-radius: 8px;
  padding: 8px 12px;
}

.map-preview {
  position: relative;
  width: 100%;
  aspect-ratio: var(--map-aspect, 4 / 3);
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg-canvas);
}

.map-preview .media-wrap {
  position: absolute;
}

.map-preview .fit-box {
  position: absolute;
}

.map-preview .media-img,
.map-preview .map-placeholder,
.map-preview .fog-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.map-preview .media-img {
  object-fit: contain;
  display: block;
  -webkit-user-drag: none;
  user-drag: none;
  -webkit-user-select: none;
  user-select: none;
  pointer-events: none;
}

.map-preview .map-placeholder {
  background-color: var(--bg-canvas);
  background-image:
    repeating-linear-gradient(0deg, transparent 0 15px, var(--grid-line) 15px 16px),
    repeating-linear-gradient(90deg, transparent 0 15px, var(--grid-line) 15px 16px);
}

/* Il fog of war resta nero puro, stesso motivo di editor.css/display.css. */
.map-preview .fog-overlay {
  position: absolute;
  inset: 0;
  background: #000;
  border: none;
  padding: 0;
  cursor: pointer;
}

.map-preview .fog-overlay.revealed {
  background: transparent;
  outline: 1.5px dashed var(--accent);
  outline-offset: -1px;
}

#viewport-rect {
  position: absolute;
  border: 2px solid var(--accent);
  background: var(--accent-bg-subtle);
  pointer-events: none;
  z-index: 5;
}

#pan-mode-toggle {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 6;
}

.opacity-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary);
}

.opacity-row input {
  flex: 1;
}

.link-btn {
  background: none;
  border: none;
  padding: 0;
  font-size: 13px;
  color: var(--accent);
}

.list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fow-bulk {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}

.fow-bulk button {
  flex: 1;
}

.fow-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  min-height: 48px;
  border-radius: 8px;
  border: 1px solid var(--border-control);
  background: var(--bg-control);
  font-size: 15px;
}

.fow-row.revealed {
  background: var(--accent-bg-subtle);
  border-color: var(--accent);
  color: var(--accent);
}

.fow-state {
  font-size: 12px;
  color: var(--text-secondary);
}

.fow-row.revealed .fow-state {
  color: var(--accent);
}

.thumb-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.image-thumb {
  position: relative;
  width: 84px;
  height: 84px;
  border-radius: 8px;
  border: 1px solid var(--border-control);
  overflow: hidden;
  padding: 0;
  background: var(--bg-control);
}

.image-thumb.active {
  border: 2px solid var(--accent);
}

.image-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.hint {
  font-size: 13px;
  color: var(--text-secondary);
}

button {
  border-radius: 8px;
  border: 1px solid var(--border-control);
  background: var(--bg-control);
  color: var(--text-primary);
  padding: 10px 14px;
  min-height: 44px;
}

button.primary {
  width: 100%;
  background: var(--bg-control);
  color: var(--text-primary);
  border: 1px solid var(--border-control);
  padding: 12px;
}

.pan-zoom {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.pad {
  display: grid;
  grid-template-columns: repeat(3, 44px);
  grid-template-rows: repeat(3, 44px);
  gap: 4px;
}

.pad button, .pad span {
  width: 44px;
  height: 44px;
  padding: 0;
  min-height: 0;
}

#view-reset {
  width: 44px;
  height: 44px;
  padding: 0;
}

.zoom {
  flex: 1;
  min-width: 140px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.zoom input {
  flex: 1;
}

@media (min-width: 700px) {
  #app {
    flex-direction: row;
    align-items: stretch;
    height: 100vh;
    padding: 20px;
  }

  #map-column {
    flex: 1 1 62%;
    min-width: 0;
  }

  .map-preview {
    aspect-ratio: auto;
    flex: 1;
    min-height: 0;
  }

  #control-column {
    flex: 1 1 38%;
    min-width: 300px;
    max-width: 460px;
    overflow-y: auto;
    padding-right: 4px;
  }
}
```

- [ ] **Step 3: Verifica sintassi CSS**

Run: `node -e "const fs=require('fs'); const c=fs.readFileSync('/home/kratos/Documenti/Projects/anime-vtt/public/control/control.css','utf8'); const o=(c.match(/{/g)||[]).length; const cl=(c.match(/}/g)||[]).length; console.log(o===cl ? 'OK '+o : 'MISMATCH open='+o+' close='+cl);"`
Expected: `OK` seguito dal numero di blocchi.

- [ ] **Step 4: Aggiorna `control.js`: rimuovi l'elenco fog collassabile, aggiungi resize + aspect-ratio dinamico + `currentImageRect`**

Cambia:
```js
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
```
in:
```js
const socket = io();
let state = null;
let fogOpacity = 0.45;
let currentImageRect = null;

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

window.addEventListener('resize', () => {
  if (state) renderMapPreview(getActiveLocation());
});
```

- [ ] **Step 5: Rimuovi il codice del pulsante toggle-elenco (non esiste più nel markup)**

Cancella queste righe (l'elenco è ora sempre visibile, nessun toggle):
```js
toggleFowListBtn.addEventListener('click', () => {
  fowListVisible = !fowListVisible;
  fowList.hidden = !fowListVisible;
  toggleFowListBtn.textContent = fowListVisible ? 'nascondi elenco testuale' : 'mostra elenco testuale';
});

```

- [ ] **Step 6: Aggiungi il rapporto d'aspetto dinamico e traccia `currentImageRect`**

Cambia:
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
in:
```js
function renderMapPreview(location) {
  const polygons = (location && location.map.polygons) || [];

  if (location && location.map.file) {
    mapPlaceholder.hidden = true;
    activeMapEl = loadMapMedia(mapImg, mapVideo, location.map.file, `/storage/maps/${location.map.file}`, () => {
      const nw = mediaW(activeMapEl);
      const nh = mediaH(activeMapEl);
      if (nw && nh) mapPreview.style.setProperty('--map-aspect', `${nw} / ${nh}`);
      const rotation = computeTotalRotation(nw, nh, location.map.flip180);
      const effective = layoutMapWrap(mapPreview, mapMediaWrap, rotation);
      const rect = fitRect(effective.width, effective.height, nw, nh);
      positionFitBox(mapFitBox, rect);
      currentImageRect = rect;
      renderFogOverlays(polygons);
    });
  } else {
    mapImg.hidden = true;
    mapVideo.hidden = true;
    mapPlaceholder.hidden = false;
    mapPreview.style.removeProperty('--map-aspect');
    const effective = layoutMapWrap(mapPreview, mapMediaWrap, 0);
    const rect = { left: 0, top: 0, width: effective.width, height: effective.height };
    positionFitBox(mapFitBox, rect);
    currentImageRect = rect;
    renderFogOverlays(polygons);
  }
}
```

- [ ] **Step 7: Verifica sintassi**

Run: `node -c /home/kratos/Documenti/Projects/anime-vtt/public/control/control.js`
Expected: nessun errore.

- [ ] **Step 8: Verifica dal vivo**

Server isolato (stesso schema del Task 1, porta diversa). Se hai strumenti browser: apri `/control`, verifica che la pagina carichi senza errori console; ridimensiona la finestra sotto e sopra 700px di larghezza e conferma che il layout passi da colonna singola a due colonne; con `resize_window` (preset `mobile`, poi `tablet`, poi dimensioni custom in landscape) verifica che nessun contenuto finisca sotto uno scroll nascosto in nessuna delle quattro combinazioni orientamento/larghezza. Verifica anche che `document.getElementById('pan-mode-toggle').disabled === true` (nessun `displayViewport` ancora arrivato in questo test, corretto).

Se non hai strumenti browser, annotalo nel report.

- [ ] **Step 9: Commit**

```bash
cd /home/kratos/Documenti/Projects/anime-vtt
git add public/control/index.html public/control/control.css public/control/control.js
git commit -m "Responsive layout for control page: single breakpoint, dynamic map aspect ratio, permanent fog list markup"
```

---

### Task 3: Elenco fog permanente con azioni di massa

**Files:**
- Modify: `public/control/control.css`
- Modify: `public/control/control.js`

**Interfaces:**
- Consumes: evento socket `fow:setAll` dal Task 1; markup `#fow-hide-all`/`#fow-reveal-all` dal Task 2.
- Produces: nessuna nuova interfaccia per altri task.

- [ ] **Step 1: Aggiungi lo stile del pulsante arma-poi-conferma**

In `public/control/control.css`, subito dopo la regola `button.primary { ... }` esistente, aggiungi:
```css
button.confirm {
  background: var(--danger);
  border-color: var(--danger);
  color: #fff;
}
```

- [ ] **Step 2: Verifica sintassi CSS**

Run: `node -e "const fs=require('fs'); const c=fs.readFileSync('/home/kratos/Documenti/Projects/anime-vtt/public/control/control.css','utf8'); const o=(c.match(/{/g)||[]).length; const cl=(c.match(/}/g)||[]).length; console.log(o===cl ? 'OK '+o : 'MISMATCH open='+o+' close='+cl);"`
Expected: `OK` seguito dal numero di blocchi.

- [ ] **Step 3: Aggiungi i riferimenti DOM e la logica di massa in `control.js`**

Subito dopo la riga `const zoomRange = document.getElementById('zoom-range');`, aggiungi:
```js
const fowHideAllBtn = document.getElementById('fow-hide-all');
const fowRevealAllBtn = document.getElementById('fow-reveal-all');
```

Alla fine del file, aggiungi:
```js
fowHideAllBtn.addEventListener('click', () => {
  if (!state.activeLocationId) return;
  socket.emit('fow:setAll', { locationId: state.activeLocationId, revealed: false });
});

// Arma-poi-conferma, stesso pattern già in uso nel resto dell'app: primo
// click arma per 2.5s, secondo click entro la finestra conferma.
let revealAllArmed = false;
let revealAllArmTimeout = null;

function resetRevealAllArm() {
  revealAllArmed = false;
  clearTimeout(revealAllArmTimeout);
  fowRevealAllBtn.classList.remove('confirm');
  fowRevealAllBtn.textContent = 'Rivela tutto';
}

fowRevealAllBtn.addEventListener('click', () => {
  if (!state.activeLocationId) return;
  if (!revealAllArmed) {
    revealAllArmed = true;
    fowRevealAllBtn.classList.add('confirm');
    fowRevealAllBtn.textContent = 'Click di nuovo per confermare';
    clearTimeout(revealAllArmTimeout);
    revealAllArmTimeout = setTimeout(resetRevealAllArm, 2500);
    return;
  }
  resetRevealAllArm();
  socket.emit('fow:setAll', { locationId: state.activeLocationId, revealed: true });
});
```

- [ ] **Step 4: Verifica sintassi**

Run: `node -c /home/kratos/Documenti/Projects/anime-vtt/public/control/control.js`
Expected: nessun errore.

- [ ] **Step 5: Verifica dal vivo**

Server isolato. Se hai strumenti browser: apri `/control`, clicca "Nascondi tutto" — verifica via `curl .../api/state` che tutti i poligoni della location attiva abbiano `revealed: false` immediatamente (nessuna conferma richiesta). Poi clicca "Rivela tutto" una volta — verifica che il pulsante diventi rosso con testo "Click di nuovo per confermare" e che lo stato NON sia ancora cambiato; clicca di nuovo entro 2.5s — verifica che ora tutti i poligoni abbiano `revealed: true`. Riporta lo stato a `revealed: false` per non lasciare dati di test alterati.

Se non hai strumenti browser, annotalo nel report.

- [ ] **Step 6: Commit**

```bash
cd /home/kratos/Documenti/Projects/anime-vtt
git add public/control/control.css public/control/control.js
git commit -m "Add fog mass actions: instant hide-all, arm-then-confirm reveal-all"
```

---

### Task 4: Rettangolo di inquadratura live e trascinamento dietro interruttore

**Files:**
- Modify: `public/control/control.css`
- Modify: `public/control/control.js`

**Interfaces:**
- Consumes: `state.displayViewport` dal Task 1; markup `#viewport-rect`/`#pan-mode-toggle` e variabile `currentImageRect` dal Task 2.
- Produces: nessuna nuova interfaccia per altri task.

- [ ] **Step 1: Aggiungi lo stile per lo stato attivo del pulsante e per il cursore in modalità sposta**

In `public/control/control.css`, subito dopo la regola `#pan-mode-toggle { ... }` esistente, aggiungi:
```css
#pan-mode-toggle.active {
  background: var(--accent);
  color: var(--accent-text);
  border-color: var(--accent);
}

.map-preview.pan-mode-active {
  cursor: move;
}
```

- [ ] **Step 2: Verifica sintassi CSS**

Run: `node -e "const fs=require('fs'); const c=fs.readFileSync('/home/kratos/Documenti/Projects/anime-vtt/public/control/control.css','utf8'); const o=(c.match(/{/g)||[]).length; const cl=(c.match(/}/g)||[]).length; console.log(o===cl ? 'OK '+o : 'MISMATCH open='+o+' close='+cl);"`
Expected: `OK` seguito dal numero di blocchi.

- [ ] **Step 3: Aggiungi i riferimenti DOM**

Subito dopo `const fowRevealAllBtn = document.getElementById('fow-reveal-all');`, aggiungi:
```js
const viewportRect = document.getElementById('viewport-rect');
const panModeToggle = document.getElementById('pan-mode-toggle');
```

- [ ] **Step 4: Aggiungi `updateViewportRect()` e chiamala da `render()`**

Alla fine del file, aggiungi:
```js
// Il rettangolo mostra quale porzione della mappa la TV sta effettivamente
// inquadrando in questo momento. Si ricalcola, per le dimensioni del
// viewport della TV, lo stesso posizionamento che display.js applica alla
// mappa — poi si inverte la trasformazione pan/zoom per trovare quale
// rettangolo del map-layer riempie lo schermo della TV, e lo si riesprime
// come frazione del riquadro mappa mostrato qui in locale (currentImageRect).
function updateViewportRect(location) {
  if (!location || !state.displayViewport || !mediaW(activeMapEl) || !currentImageRect) {
    viewportRect.hidden = true;
    panModeToggle.disabled = true;
    return;
  }

  const { width: vw, height: vh } = state.displayViewport;
  const nw = mediaW(activeMapEl);
  const nh = mediaH(activeMapEl);
  const rotation = computeTotalRotation(nw, nh, location.map.flip180);
  const swapped = rotation === 90 || rotation === 270;
  const tvEffectiveW = swapped ? vh : vw;
  const tvEffectiveH = swapped ? vw : vh;
  const tvFit = fitRect(tvEffectiveW, tvEffectiveH, nw, nh);

  const mapScale = location.map.scale || 1;
  const live = state.liveView || { scale: 1, offsetX: 0, offsetY: 0 };
  const S = mapScale * (live.scale || 1);

  const viewLeft = -(live.offsetX || 0) / S;
  const viewTop = -(live.offsetY || 0) / S;
  const viewW = tvEffectiveW / S;
  const viewH = tvEffectiveH / S;

  const fracLeft = (viewLeft - tvFit.left) / tvFit.width;
  const fracTop = (viewTop - tvFit.top) / tvFit.height;
  const fracW = viewW / tvFit.width;
  const fracH = viewH / tvFit.height;

  viewportRect.hidden = false;
  viewportRect.style.left = `${currentImageRect.left + fracLeft * currentImageRect.width}px`;
  viewportRect.style.top = `${currentImageRect.top + fracTop * currentImageRect.height}px`;
  viewportRect.style.width = `${fracW * currentImageRect.width}px`;
  viewportRect.style.height = `${fracH * currentImageRect.height}px`;

  panModeToggle.disabled = false;
}
```

Poi cambia la fine di `render()` da:
```js
  zoomRange.value = String(Math.round((state.liveView.scale || 1) * 5));
  panZoomSection.style.display = showingImage ? 'none' : 'block';
}
```
in:
```js
  zoomRange.value = String(Math.round((state.liveView.scale || 1) * 5));
  panZoomSection.style.display = showingImage ? 'none' : 'block';
  updateViewportRect(location);
}
```

- [ ] **Step 5: Aggiungi l'interruttore e il trascinamento**

Alla fine del file, aggiungi:
```js
let panModeActive = false;
let panDrag = null;

panModeToggle.addEventListener('click', () => {
  panModeActive = !panModeActive;
  panModeToggle.classList.toggle('active', panModeActive);
  mapPreview.classList.toggle('pan-mode-active', panModeActive);
});

// In modalità sposta, il tocco sul fog viene sospeso del tutto: nessuna
// ambiguità tap-vs-trascinamento da risolvere, ogni gesto sull'anteprima è
// per forza un trascinamento.
mapPreview.addEventListener('pointerdown', (e) => {
  if (!panModeActive) return;
  panDrag = { lastX: e.clientX, lastY: e.clientY };
  mapPreview.setPointerCapture(e.pointerId);
});

mapPreview.addEventListener('pointermove', (e) => {
  if (!panDrag) return;
  const dxLocal = e.clientX - panDrag.lastX;
  const dyLocal = e.clientY - panDrag.lastY;
  panDrag.lastX = e.clientX;
  panDrag.lastY = e.clientY;

  const location = getActiveLocation();
  if (!location || !state.displayViewport || !currentImageRect) return;

  const nw = mediaW(activeMapEl);
  const nh = mediaH(activeMapEl);
  const rotation = computeTotalRotation(nw, nh, location.map.flip180);
  const swapped = rotation === 90 || rotation === 270;
  const tvEffectiveW = swapped ? state.displayViewport.height : state.displayViewport.width;
  const tvEffectiveH = swapped ? state.displayViewport.width : state.displayViewport.height;
  const tvFit = fitRect(tvEffectiveW, tvEffectiveH, nw, nh);

  const mapScale = location.map.scale || 1;
  const S = mapScale * ((state.liveView && state.liveView.scale) || 1);

  // Stessa conversione usata per disegnare il rettangolo, invertita: da
  // pixel dell'anteprima locale a pixel del viewport della TV.
  const dxTv = (dxLocal / currentImageRect.width) * tvFit.width * S;
  const dyTv = (dyLocal / currentImageRect.height) * tvFit.height * S;

  socket.emit('view:pan', { dx: -dxTv, dy: -dyTv });
});

mapPreview.addEventListener('pointerup', () => { panDrag = null; });
mapPreview.addEventListener('pointercancel', () => { panDrag = null; });
```

- [ ] **Step 6: Sospendi il tap sul fog mentre la modalità sposta è attiva**

Cambia:
```js
mapFogLayer.addEventListener('click', (e) => {
  const overlay = e.target.closest('.fog-overlay');
  if (overlay) socket.emit('fow:toggle', { polygonId: overlay.dataset.id });
});
```
in:
```js
mapFogLayer.addEventListener('click', (e) => {
  if (panModeActive) return;
  const overlay = e.target.closest('.fog-overlay');
  if (overlay) socket.emit('fow:toggle', { polygonId: overlay.dataset.id });
});
```

- [ ] **Step 7: Verifica sintassi**

Run: `node -c /home/kratos/Documenti/Projects/anime-vtt/public/control/control.js`
Expected: nessun errore.

- [ ] **Step 8: Verifica dal vivo**

Server isolato. Se hai strumenti browser: apri `/display` in una tab (così `displayViewport` si popola) e `/control` in un'altra. Verifica che `#pan-mode-toggle` diventi abilitato una volta che `/display` si è connesso. Attiva la modalità sposta, verifica la classe `.active` e il cursore `move`; simula un trascinamento con una tripletta completa `pointerdown`+`pointermove`+`pointerup` (mai un solo evento isolato) sull'anteprima mappa, e verifica via `curl .../api/state` che `liveView.offsetX`/`offsetY` siano cambiati nella direzione attesa (trascinando verso destra, il rettangolo — e quindi l'inquadratura sulla TV — deve spostarsi verso destra, non verso sinistra: verificalo confrontando la posizione del rettangolo in `/control` prima e dopo con quanto mostra realmente `/display`). Verifica poi che con la modalità sposta ATTIVA un tap secco (pointerdown+pointerup senza movimento) su una zona fog NON la riveli/nasconda; disattiva la modalità e verifica che lo stesso tap torni a funzionare come prima. Riporta `view:reset` alla fine per non lasciare la vista live alterata.

Se non hai strumenti browser, annotalo nel report — il controller verifica dal vivo (incluso il segno del trascinamento, il punto più delicato) separatamente.

- [ ] **Step 9: Commit**

```bash
cd /home/kratos/Documenti/Projects/anime-vtt
git add public/control/control.css public/control/control.js
git commit -m "Add live viewport rectangle and toggleable drag-to-pan"
```

---

### Task 5: Indicatori di stato — connessione e "stai mostrando ai giocatori"

**Files:**
- Modify: `public/control/control.js`

**Interfaces:**
- Consumes: evento socket `display:status` dal Task 1; markup `#wifi-dot`/`#showing-banner`/`#showing-banner-name` dal Task 2.
- Produces: nessuna nuova interfaccia per altri task.

- [ ] **Step 1: Aggiungi l'indicatore di connessione**

Cambia:
```js
const socket = io();
let state = null;
let fogOpacity = 0.45;
let currentImageRect = null;
```
in:
```js
const socket = io();
let state = null;
let fogOpacity = 0.45;
let currentImageRect = null;
let socketConnected = false;
let displayConnected = false;
```

Subito dopo `const zoomRange = document.getElementById('zoom-range');` (o dove già aggiunto dai task precedenti), aggiungi:
```js
const wifiDot = document.getElementById('wifi-dot');
const showingBanner = document.getElementById('showing-banner');
const showingBannerName = document.getElementById('showing-banner-name');
```

Cambia:
```js
socket.on('connect', () => socket.emit('hello', { role: 'control' }));
socket.on('state:update', (s) => {
  state = s;
  render();
});
```
in:
```js
function updateWifi() {
  const ok = socketConnected && displayConnected;
  wifiDot.classList.toggle('ok', ok);
  wifiDot.classList.toggle('bad', !ok);
}

socket.on('connect', () => {
  socketConnected = true;
  socket.emit('hello', { role: 'control' });
  updateWifi();
});
socket.on('disconnect', () => {
  socketConnected = false;
  updateWifi();
});
socket.on('display:status', ({ connected }) => {
  displayConnected = connected;
  updateWifi();
});
socket.on('state:update', (s) => {
  state = s;
  render();
});
```

- [ ] **Step 2: Aggiungi la barra "stai mostrando ai giocatori"**

Nella funzione `render()`, subito dopo la riga `const showingImage = Boolean(state.activeImageId);`, aggiungi:
```js
  if (showingImage && location) {
    const shownImg = (location.images || []).find((i) => i.id === state.activeImageId);
    showingBanner.hidden = !shownImg;
    if (shownImg) showingBannerName.textContent = shownImg.name || '';
  } else {
    showingBanner.hidden = true;
  }
```

- [ ] **Step 3: Verifica sintassi**

Run: `node -c /home/kratos/Documenti/Projects/anime-vtt/public/control/control.js`
Expected: nessun errore.

- [ ] **Step 4: Verifica dal vivo**

Server isolato. Se hai strumenti browser: apri `/control` da sola — verifica che `#wifi-dot` sia rosso/visibile (nessun display connesso). Apri anche `/display` — verifica che il puntino diventi verde/invisibile. Chiudi la tab `/display` — verifica che torni rosso entro qualche secondo. Poi, con almeno un'immagine caricata per la location attiva (se non ce n'è nessuna nei dati di prova, carica un file di prova via l'editor e ricordati di ripulirlo a fine test), mostrala tramite l'elenco immagini — verifica che la barra "stai mostrando" appaia col nome corretto, e che sparisca tornando alla mappa.

Se non hai strumenti browser, annotalo nel report.

- [ ] **Step 5: Commit**

```bash
cd /home/kratos/Documenti/Projects/anime-vtt
git add public/control/control.js
git commit -m "Add connection indicator and showing-to-players banner"
```

---

### Task 6: Conferma leggera sul cambio location

**Files:**
- Modify: `public/control/control.js`

**Interfaces:**
- Consumes: markup `#location-confirm-row`/`#location-confirm-name`/`#location-confirm-yes`/`#location-confirm-no` dal Task 2.
- Produces: nessuna nuova interfaccia per altri task.

- [ ] **Step 1: Aggiungi i riferimenti DOM e la logica di conferma**

Subito dopo `const locationSelect = document.getElementById('location-select');`, aggiungi:
```js
const locationConfirmRow = document.getElementById('location-confirm-row');
const locationConfirmName = document.getElementById('location-confirm-name');
const locationConfirmYes = document.getElementById('location-confirm-yes');
const locationConfirmNo = document.getElementById('location-confirm-no');
let pendingLocationId = null;
let locationConfirmTimeout = null;
```

- [ ] **Step 2: Sostituisci l'handler di cambio location**

Cambia:
```js
locationSelect.addEventListener('change', () => {
  socket.emit('location:set', { locationId: locationSelect.value });
});
```
in:
```js
function resetLocationConfirm() {
  pendingLocationId = null;
  clearTimeout(locationConfirmTimeout);
  locationConfirmRow.hidden = true;
  locationSelect.value = state.activeLocationId || '';
}

locationSelect.addEventListener('change', () => {
  const targetId = locationSelect.value;
  if (!targetId || targetId === state.activeLocationId) return;
  const target = state.locations.find((l) => l.id === targetId);
  locationSelect.value = state.activeLocationId || '';
  if (!target) return;
  pendingLocationId = targetId;
  locationConfirmName.textContent = target.name;
  locationConfirmRow.hidden = false;
  clearTimeout(locationConfirmTimeout);
  locationConfirmTimeout = setTimeout(resetLocationConfirm, 4000);
});

locationConfirmYes.addEventListener('click', () => {
  if (!pendingLocationId) return;
  socket.emit('location:set', { locationId: pendingLocationId });
  resetLocationConfirm();
});

locationConfirmNo.addEventListener('click', resetLocationConfirm);
```

- [ ] **Step 3: Verifica sintassi**

Run: `node -c /home/kratos/Documenti/Projects/anime-vtt/public/control/control.js`
Expected: nessun errore.

- [ ] **Step 4: Verifica dal vivo**

Server isolato con almeno due location (usa l'editor per crearne una seconda di prova, poi archiviala/eliminala a fine test se non era già lì). Se hai strumenti browser: apri `/control`, seleziona una location diversa nel menu — verifica che il menu torni visivamente a mostrare quella attiva, che appaia la riga di conferma col nome corretto, e che `state.activeLocationId` NON sia ancora cambiato (`curl .../api/state`). Clicca "Conferma" — verifica che ora sia cambiato davvero e che il menu mostri il nuovo valore. Ripeti selezionando un'altra location e cliccando "Annulla" — verifica che non cambi nulla e che il menu torni a quella originale. Ripeti una terza volta e lascia scadere i 4 secondi senza toccare nulla — verifica lo stesso risultato di "Annulla".

Se non hai strumenti browser, annotalo nel report.

- [ ] **Step 5: Commit**

```bash
cd /home/kratos/Documenti/Projects/anime-vtt
git add public/control/control.js
git commit -m "Add soft confirm on location switch"
```

---

### Task 7: Rifiniture — passo pan, etichette immagini, feedback tocco, slider zoom

**Files:**
- Modify: `public/control/control.css`
- Modify: `public/control/control.js`

**Interfaces:**
- Consumes: nessuna nuova interfaccia dai task precedenti oltre a quanto già presente.
- Produces: nessuna nuova interfaccia per altri task (ultimo task di modifica prima della verifica finale).

- [ ] **Step 1: Rinforza il contrasto delle zone fog rivelate sulla mappa**

In `public/control/control.css`, cambia:
```css
.map-preview .fog-overlay.revealed {
  background: transparent;
  outline: 1.5px dashed var(--accent);
  outline-offset: -1px;
}
```
in:
```css
.map-preview .fog-overlay.revealed {
  background: var(--accent-bg-subtle);
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
```

- [ ] **Step 2: Aggiungi l'etichetta visibile sulle miniature immagini**

Subito dopo la regola `.image-thumb.active { ... }`, aggiungi:
```css
.image-thumb-label {
  position: absolute;
  inset: auto 0 0 0;
  font-size: 11px;
  line-height: 1.3;
  padding: 2px 4px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

- [ ] **Step 3: Aggiungi feedback di pressione e `touch-action` su tutti gli elementi interattivi**

Alla fine di `public/control/control.css`, aggiungi:
```css
button, .fog-overlay, .image-thumb, .fow-row, select, #pan-mode-toggle {
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  -webkit-user-select: none;
  user-select: none;
}

button:active, .fow-row:active, .image-thumb:active {
  background: var(--accent-bg-subtle);
}

.map-preview .fog-overlay:active {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
```

- [ ] **Step 4: Verifica sintassi CSS**

Run: `node -e "const fs=require('fs'); const c=fs.readFileSync('/home/kratos/Documenti/Projects/anime-vtt/public/control/control.css','utf8'); const o=(c.match(/{/g)||[]).length; const cl=(c.match(/}/g)||[]).length; console.log(o===cl ? 'OK '+o : 'MISMATCH open='+o+' close='+cl);"`
Expected: `OK` seguito dal numero di blocchi.

- [ ] **Step 5: Passo di pan proporzionale allo zoom**

In `public/control/control.js`, cambia:
```js
document.querySelectorAll('[data-pan]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const [dx, dy] = btn.dataset.pan.split(',').map(Number);
    socket.emit('view:pan', { dx: dx * 20, dy: dy * 20 });
  });
});
```
in:
```js
document.querySelectorAll('[data-pan]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const [dx, dy] = btn.dataset.pan.split(',').map(Number);
    const scale = (state && state.liveView && state.liveView.scale) || 1;
    const step = 20 / Math.max(scale, 0.01);
    socket.emit('view:pan', { dx: dx * step, dy: dy * step });
  });
});
```

- [ ] **Step 6: Etichette visibili sulle miniature immagini**

Cambia:
```js
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
```
in:
```js
  imagesList.innerHTML =
    ((location && location.images) || [])
      .map(
        (img) => `
          <button class="image-thumb ${state.activeImageId === img.id ? 'active' : ''}" data-id="${img.id}">
            <img src="/storage/images/${img.file}" alt="${escapeHtml(img.name)}">
            <span class="image-thumb-label">${escapeHtml(img.name)}</span>
          </button>
        `
      )
      .join('') || '<p class="hint">nessuna immagine per questa location</p>';
```

- [ ] **Step 7: Lo slider zoom non "tira indietro" il dito durante il trascinamento**

Subito dopo `let panDrag = null;`, aggiungi:
```js
let zoomSliderActive = false;
```

Cambia:
```js
  zoomRange.value = String(Math.round((state.liveView.scale || 1) * 5));
  panZoomSection.style.display = showingImage ? 'none' : 'block';
  updateViewportRect(location);
}
```
in:
```js
  if (!zoomSliderActive) {
    zoomRange.value = String(Math.round((state.liveView.scale || 1) * 5));
  }
  panZoomSection.style.display = showingImage ? 'none' : 'block';
  updateViewportRect(location);
}
```

Cambia:
```js
zoomRange.addEventListener('input', () => {
  socket.emit('view:zoom', { scale: Number(zoomRange.value) / 5 });
});
```
in:
```js
zoomRange.addEventListener('pointerdown', () => { zoomSliderActive = true; });
zoomRange.addEventListener('pointerup', () => { zoomSliderActive = false; });
zoomRange.addEventListener('input', () => {
  socket.emit('view:zoom', { scale: Number(zoomRange.value) / 5 });
});
```

- [ ] **Step 8: Verifica sintassi**

Run: `node -c /home/kratos/Documenti/Projects/anime-vtt/public/control/control.js`
Expected: nessun errore.

- [ ] **Step 9: Verifica dal vivo**

Server isolato. Se hai strumenti browser: verifica che le etichette con il nome compaiano sotto le miniature immagini; verifica che le zone fog rivelate sulla mappa abbiano ora un riempimento leggero oltre al contorno più marcato; premi (senza rilasciare) un pulsante del pad di pan e verifica visivamente il feedback `:active`; trascina lo slider zoom lentamente e verifica che il pallino segua il dito senza scatti all'indietro durante il trascinamento (via `read_console_messages`/ispezione diretta, non serve altro); verifica che il passo di pan a zoom alto (es. `scale=4` impostato temporaneamente da slider) produca uno spostamento visivo sulla TV coerente con quello a zoom 1 (confrontando `/display` con lo stesso numero di tap).

Se non hai strumenti browser, annotalo nel report.

- [ ] **Step 10: Commit**

```bash
cd /home/kratos/Documenti/Projects/anime-vtt
git add public/control/control.css public/control/control.js
git commit -m "Polish: proportional pan step, image labels, touch feedback, zoom slider drag fix"
```

---

### Task 8: Verifica finale end-to-end

Nessun file nuovo pianificato oltre a eventuali piccole correzioni emerse dalla verifica.

**Files:**
- Nessuno pianificato (solo verifica; eventuali fix minori vanno nei file toccati dai task precedenti).

**Interfaces:**
- Consumes: tutto quanto prodotto dai Task 1-7.
- Produces: niente — ultimo task del piano.

- [ ] **Step 1: Verifica sintattica completa**

```bash
cd /home/kratos/Documenti/Projects/anime-vtt
node -c server/index.js
node -c public/display/display.js
node -c public/control/control.js
```
Expected: nessun errore su nessuno dei tre file.

- [ ] **Step 2: Avvia un server di verifica isolato**

```bash
mkdir -p /tmp/anime-vtt-test-final-control/data /tmp/anime-vtt-test-final-control/storage/maps /tmp/anime-vtt-test-final-control/storage/images
cd /home/kratos/Documenti/Projects/anime-vtt
DATA_DIR=/tmp/anime-vtt-test-final-control/data STORAGE_DIR=/tmp/anime-vtt-test-final-control/storage PORT=3088 nohup node server/index.js > /tmp/anime-vtt-test-final-control/server.log 2>&1 &
sleep 1
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3088/api/state
```
Expected: `200`.

- [ ] **Step 3: Le quattro combinazioni dispositivo/orientamento**

Apri `/control` e, con `resize_window` (o dimensioni custom), verifica in sequenza: telefono verticale (~390×844), telefono orizzontale (~844×390), tablet verticale (~810×1080), tablet orizzontale (~1080×810). In ognuna: nessun contenuto richiede scroll per essere raggiunto oltre a quanto genuinamente eccede l'altezza della sola colonna laterale (accettabile, previsto dal design); la mappa occupa lo spazio disponibile; ruotare (cambiare le dimensioni a runtime) ricalcola subito il layout senza attendere un aggiornamento di stato.

- [ ] **Step 4: Flusso end-to-end con `/display` aperto in parallelo**

Apri anche `/display` in un'altra tab. Da `/control`: cambia location (verifica la conferma leggera), rivela/nascondi singole zone fog dall'elenco permanente e dalla mappa, usa "nascondi tutto"/"rivela tutto", muovi la vista con il pad e verifica che `/display` la segua; attiva la modalità sposta inquadratura e trascina — verifica che il rettangolo su `/control` corrisponda sempre a quanto mostra realmente `/display` (stesso identico confronto già fatto nel Task 4, qui ripetuto come parte del giro completo); mostra un'immagine e verifica la barra "stai mostrando"; disconnetti/riconnetti `/display` e verifica che il puntino di connessione su `/control` reagisca.

- [ ] **Step 5: Ripristina lo stato allo stesso punto di partenza**

Se qualunque passo precedente ha cambiato la location attiva, la vista live, o lo stato di qualche zona fog rispetto a come li hai trovati, riportali esattamente com'erano prima di iniziare questo task.

- [ ] **Step 6: Ferma e rimuovi l'ambiente di test**

```bash
kill %1 2>/dev/null
rm -rf /tmp/anime-vtt-test-final-control
```

- [ ] **Step 7: Commit finale (solo se la verifica ha richiesto una correzione)**

Se tutti i controlli precedenti sono passati senza modifiche, non c'è nulla da committare in questo task. Se invece è emersa una piccola correzione non prevista nei task precedenti:

```bash
cd /home/kratos/Documenti/Projects/anime-vtt
git add -A
git commit -m "Fix: <descrizione della correzione trovata in verifica>"
```
