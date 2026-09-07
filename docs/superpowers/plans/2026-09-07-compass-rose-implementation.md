# Rosa dei Venti su Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** mostrare su `/display` una rosa dei venti fissa sullo schermo (N/S/O/E), in sovraimpressione solo sopra la mappa (mai sopra le immagini), attivabile/disattivabile da `/control` e configurabile (posizione, rotazione, visibilità) da `/editor`, per singola location.

**Architecture:** nuovo campo `location.map.compass = { visible, x, y, rotation }`. `x`/`y` sono percentuali dello schermo del display (non dello spazio locale/ruotato della mappa) — un solo evento socket `compass:update` per tutte e tre le superfici. Su `/display`, la rosa dei venti è un elemento fisso dentro `#viewport`, sorella di `#map-layer`/`#image-layer` (mai dentro la parte che pan/zoom/ruota).

**Tech Stack:** stesso stack del resto del progetto (Node/Express/socket.io lato server, vanilla JS/CSS lato client). Nessuna nuova dipendenza.

## Global Constraints

- `location.map.compass` è per-location, con default `{ visible: false, x: 88, y: 85, rotation: 0 }` — nessuna sorpresa sulle location già esistenti dopo l'aggiornamento.
- `rotation` è un angolo manuale (0-359°), scollegato da `flip180`/`rotate90`: non si aggiusta mai da solo quando la mappa viene ruotata/capovolta.
- `x`/`y` sono percentuali dello **schermo** (equivalenti a `#viewport` su `/display` e a `#map-canvas` su `/editor`), mai dello spazio locale/non ruotato della mappa (quello di griglia e poligoni).
- Valori sempre clampati lato server: `rotation` in 0-359 (wrap circolare), `x`/`y` in 0-100.
- Nessuna suite di test automatica in questo progetto: ogni task si verifica manualmente su un server isolato.

---

### Task 1: Server — modello dati e evento socket

**Files:**
- Modify: `server/state.js` (default, migrazione, export)
- Modify: `server/index.js` (`location:create`, nuovo evento `compass:update`)

**Interfaces:**
- Produces: `location.map.compass = { visible: boolean, x: number, y: number, rotation: number }` su ogni location, esistente o nuova. Evento socket `compass:update { locationId, visible?, x?, y?, rotation? }` (aggiornamento parziale, come `grid:update`).
- Consumes: nessuna interfaccia da altri task (è il primo task).

- [ ] **Step 1: Aggiungi `DEFAULT_COMPASS` e il default nella location di esempio in `server/state.js`**

Dopo la riga `const DEFAULT_GRID = { enabled: false, cellSize: 100, offsetX: 0, offsetY: 0, color: '#ffffff', lineWidth: 0.3, opacity: 1 };` aggiungi:

```js
const DEFAULT_COMPASS = { visible: false, x: 88, y: 85, rotation: 0 };
```

Nella location di esempio dentro `DEFAULT_STATE`, l'attuale:

```js
        liveView: { scale: 1, offsetX: 0, offsetY: 0 },
        grid: { ...DEFAULT_GRID },
```

diventa:

```js
        liveView: { scale: 1, offsetX: 0, offsetY: 0 },
        grid: { ...DEFAULT_GRID },
        compass: { ...DEFAULT_COMPASS },
```

- [ ] **Step 2: Aggiungi il backfill in `migrate()`**

Nel blocco `(state.locations || []).forEach((location) => { ... })`, dopo la riga `if (!location.map.grid) location.map.grid = { ...DEFAULT_GRID };` aggiungi:

```js
    if (!location.map.compass) location.map.compass = { ...DEFAULT_COMPASS };
    if (location.map.compass.visible === undefined) location.map.compass.visible = false;
    if (location.map.compass.x === undefined) location.map.compass.x = DEFAULT_COMPASS.x;
    if (location.map.compass.y === undefined) location.map.compass.y = DEFAULT_COMPASS.y;
    if (location.map.compass.rotation === undefined) location.map.compass.rotation = 0;
```

- [ ] **Step 3: Esporta `DEFAULT_COMPASS`**

L'attuale riga finale del file:

```js
module.exports = { loadState, saveState, applyStartupDefault, DEFAULT_GRID, DATA_DIR, STATE_FILE };
```

diventa:

```js
module.exports = { loadState, saveState, applyStartupDefault, DEFAULT_GRID, DEFAULT_COMPASS, DATA_DIR, STATE_FILE };
```

- [ ] **Step 4: Aggiungi il default a `location:create` in `server/index.js`**

Importa `DEFAULT_COMPASS` insieme a `DEFAULT_GRID` nella destructure esistente (riga con `const { loadState, saveState, applyStartupDefault, DEFAULT_GRID, DATA_DIR } = require('./state');`):

```js
const { loadState, saveState, applyStartupDefault, DEFAULT_GRID, DEFAULT_COMPASS, DATA_DIR } = require('./state');
```

Nell'handler `socket.on('location:create', ...)`, l'attuale:

```js
        liveView: { scale: 1, offsetX: 0, offsetY: 0 },
        grid: { ...DEFAULT_GRID },
        polygons: []
```

diventa:

```js
        liveView: { scale: 1, offsetX: 0, offsetY: 0 },
        grid: { ...DEFAULT_GRID },
        compass: { ...DEFAULT_COMPASS },
        polygons: []
```

- [ ] **Step 5: Aggiungi l'evento `compass:update`**

Subito dopo l'handler `socket.on('grid:update', ...)` (prima di `gridPreset:save`), aggiungi:

```js
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
```

- [ ] **Step 6: Verifica manuale**

```bash
DATA_DIR=/tmp/anime-vtt-test-data STORAGE_DIR=/tmp/anime-vtt-test-storage PORT=3097 node server/index.js
```

1. `curl http://localhost:3097/api/state | grep -o '"compass":{[^}]*}'` → deve mostrare `"compass":{"visible":false,"x":88,"y":85,"rotation":0}` per la location `taverna`.
2. Da un'altra scheda del browser aperta su `http://localhost:3097/editor` (che carica già `socket.io.js`), dalla console:
   ```js
   const s = io();
   s.emit('compass:update', { locationId: 'taverna', visible: true, x: 20, y: 30, rotation: 400 });
   ```
   Poi `curl http://localhost:3097/api/state | grep -o '"compass":{[^}]*}'` → deve mostrare `"compass":{"visible":true,"x":20,"y":30,"rotation":40}` (400 wrappato a 40 dal modulo 360).
3. Riprova con `x: -10, y: 150` → deve risultare clampato a `x:0, y:100`.
4. Ferma il server e cancella `/tmp/anime-vtt-test-data`, `/tmp/anime-vtt-test-storage`.

- [ ] **Step 7: Commit**

```bash
git add server/state.js server/index.js
git commit -m "feat: add per-location compass rose data model and socket event"
```

---

### Task 2: `/display` — resa della rosa dei venti

**Files:**
- Modify: `public/display/index.html`
- Modify: `public/display/display.css`
- Modify: `public/display/display.js`

**Interfaces:**
- Consumes: `location.map.compass` (Task 1).
- Produces: nessuna interfaccia per altri task.

- [ ] **Step 1: Aggiungi l'elemento in `public/display/index.html`**

Dopo la chiusura di `</div>` di `#image-layer` (prima di `#wifi-dot`), aggiungi:

```html
  <div id="compass" class="compass" hidden>
    <svg viewBox="0 0 120 120">
      <path class="compass-star" d="M60,12 L74,46 L108,60 L74,74 L60,108 L46,74 L12,60 L46,46 Z"/>
      <circle class="compass-hub" cx="60" cy="60" r="7"/>
      <text x="60" y="10" text-anchor="middle">N</text>
      <text x="60" y="118" text-anchor="middle">S</text>
      <text x="114" y="64" text-anchor="middle">E</text>
      <text x="6" y="64" text-anchor="middle">O</text>
    </svg>
  </div>
```

- [ ] **Step 2: Aggiungi lo stile in `public/display/display.css`**

In fondo al file, aggiungi:

```css
.compass {
  position: absolute;
  width: 100px;
  height: 100px;
  pointer-events: none;
  z-index: 5;
}

.compass svg {
  width: 100%;
  height: 100%;
}

.compass-star {
  fill: var(--accent);
}

.compass-hub {
  fill: var(--bg-canvas);
  stroke: var(--accent);
  stroke-width: 2;
}

.compass text {
  fill: var(--text-primary);
  font-size: 14px;
  font-weight: 600;
}
```

- [ ] **Step 3: Aggiungi la resa in `public/display/display.js`**

Dopo la riga `const wifiDot = document.getElementById('wifi-dot');` aggiungi:

```js
const compassEl = document.getElementById('compass');
```

Nella funzione `render(state)`, l'attuale:

```js
function render(state) {
  const location = getActiveLocation(state);
  const showingImage = Boolean(state.activeImageId && location && location.images.some((i) => i.id === state.activeImageId));

  mapLayer.style.display = showingImage ? 'none' : 'block';
  imageLayer.style.display = showingImage ? 'block' : 'none';

  if (showingImage) {
    renderImage(location, state.activeImageId);
  } else {
    renderMap(state, location, previousShowingImage);
  }
  previousShowingImage = showingImage;
}
```

diventa:

```js
function render(state) {
  const location = getActiveLocation(state);
  const showingImage = Boolean(state.activeImageId && location && location.images.some((i) => i.id === state.activeImageId));

  mapLayer.style.display = showingImage ? 'none' : 'block';
  imageLayer.style.display = showingImage ? 'block' : 'none';

  renderCompass(location, showingImage);

  if (showingImage) {
    renderImage(location, state.activeImageId);
  } else {
    renderMap(state, location, previousShowingImage);
  }
  previousShowingImage = showingImage;
}

// La rosa dei venti è un elemento fisso sullo schermo (percentuali di
// #viewport), indipendente dalla rotazione/pan/zoom della mappa -- mai
// visibile sopra un'immagine mostrata ai giocatori.
function renderCompass(location, showingImage) {
  const compass = location && location.map.compass;
  const visible = Boolean(compass && compass.visible) && !showingImage;
  compassEl.hidden = !visible;
  if (!visible) return;
  compassEl.style.left = `${compass.x}%`;
  compassEl.style.top = `${compass.y}%`;
  compassEl.style.transform = `translate(-50%, -50%) rotate(${compass.rotation}deg)`;
}
```

- [ ] **Step 4: Verifica manuale**

Con un server isolato (`DATA_DIR`/`STORAGE_DIR` temporanei come nel Task 1):
1. Apri `/display`. La rosa dei venti non è visibile (default `visible:false`).
2. Dalla console del browser: `io().emit('compass:update', { locationId: 'taverna', visible: true, x: 88, y: 85, rotation: 0 })` → la rosa dei venti compare in basso a destra, N in alto.
3. Ripeti con `rotation: 90` → la rosa (lettere comprese) ruota di 90°.
4. Mostra un'immagine ai giocatori (`io().emit('image:show', { imageId: '<id di una immagine esistente>' })`, o carica un'immagine da `/editor` prima) → la rosa dei venti sparisce; `io().emit('image:hide')` → ricompare.
5. Panna/zooma la mappa (`io().emit('view:pan', {...})`) → la rosa dei venti non si muove né cambia dimensione.
6. Rimuovi la mappa dalla location attiva (`io().emit('map:clear', ...)` non esiste — usa invece `POST /api/map/clear` con `{"locationId":"taverna"}`, o semplicemente testa su una location creata senza mai caricare una mappa): con `compass.visible` a `true`, la rosa dei venti resta visibile anche sul placeholder a griglia della mappa vuota — è un overlay dello schermo, non della mappa.
7. Ferma il server e cancella le cartelle temporanee.

- [ ] **Step 5: Commit**

```bash
git add public/display/index.html public/display/display.css public/display/display.js
git commit -m "feat: render compass rose overlay on /display"
```

---

### Task 3: `/control` — interruttore visibilità

**Files:**
- Modify: `public/control/index.html`
- Modify: `public/control/control.css`
- Modify: `public/control/control.js`

**Interfaces:**
- Consumes: evento socket `compass:update` (Task 1). Riusa `previewLocationId`/`getPreviewLocation()` già esistenti in `control.js`.
- Produces: nessuna interfaccia per altri task.

- [ ] **Step 1: Aggiungi la sezione in `public/control/index.html`**

Dentro il blocco `<svg style="display:none">` (dopo l'ultimo `<symbol>` esistente, `i-image`), aggiungi:

```html
  <symbol id="i-compass" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/></symbol>
```

Subito dopo la chiusura `</section>` di `#grid-opacity-section`, aggiungi:

```html
      <section id="compass-section" class="control-section">
        <div class="opacity-row">
          <span>Rosa dei venti</span>
          <button id="compass-toggle" class="icon-btn" title="Mostra/nascondi rosa dei venti">
            <svg class="icon"><use href="#i-compass"></use></svg>
          </button>
        </div>
      </section>
```

- [ ] **Step 2: Aggiungi lo stile attivo in `public/control/control.css`**

Dopo la regola `#pan-mode-toggle.active { ... }`, aggiungi:

```css
#compass-toggle.active {
  background: var(--accent);
  color: var(--accent-text);
  border-color: var(--accent);
}
```

- [ ] **Step 3: Aggiungi il riferimento DOM e la resa in `public/control.js`**

Dopo la riga `const gridOpacitySection = document.getElementById('grid-opacity-section');` aggiungi:

```js
const compassSection = document.getElementById('compass-section');
const compassToggle = document.getElementById('compass-toggle');
```

Nella funzione `render()`, l'attuale:

```js
  const hidePanZoomForImage = showingImage && !isPreviewing;
  panZoomSection.style.display = hidePanZoomForImage ? 'none' : 'block';

  const gridEnabled = Boolean(previewLocation && previewLocation.map.grid && previewLocation.map.grid.enabled) && !hidePanZoomForImage;
  gridOpacitySection.style.display = gridEnabled ? 'block' : 'none';
  if (gridEnabled) {
    gridOpacityLevel.textContent = `${Math.round((previewLocation.map.grid.opacity === undefined ? 1 : previewLocation.map.grid.opacity) * 100)}%`;
  }
  updateViewportRect(previewLocation);
```

diventa:

```js
  const hidePanZoomForImage = showingImage && !isPreviewing;
  panZoomSection.style.display = hidePanZoomForImage ? 'none' : 'block';

  const gridEnabled = Boolean(previewLocation && previewLocation.map.grid && previewLocation.map.grid.enabled) && !hidePanZoomForImage;
  gridOpacitySection.style.display = gridEnabled ? 'block' : 'none';
  if (gridEnabled) {
    gridOpacityLevel.textContent = `${Math.round((previewLocation.map.grid.opacity === undefined ? 1 : previewLocation.map.grid.opacity) * 100)}%`;
  }

  compassSection.style.display = hidePanZoomForImage ? 'none' : 'block';
  compassToggle.classList.toggle('active', Boolean(previewLocation && previewLocation.map.compass && previewLocation.map.compass.visible));

  updateViewportRect(previewLocation);
```

- [ ] **Step 4: Aggiungi il click handler**

In fondo al file, aggiungi:

```js
compassToggle.addEventListener('click', () => {
  const previewLocation = getPreviewLocation();
  if (!previewLocation || !previewLocation.map.compass) return;
  socket.emit('compass:update', { locationId: previewLocationId, visible: !previewLocation.map.compass.visible });
});
```

- [ ] **Step 5: Verifica manuale**

Con un server isolato:
1. Apri `/control`, scheda Mappa: appare la sezione "Rosa dei venti" con un pulsante icona, accanto a "Opacità griglia".
2. Cliccalo: apri anche `/display` in un'altra scheda — la rosa dei venti compare/scompare in base allo stato del pulsante (che diventa evidenziato in ambra quando attiva).
3. Seleziona un'altra location dal menu in alto (modalità anteprima, banner "Anteprima: ..."): lo stato del pulsante riflette quella location, ma `/display` NON cambia finché non premi "Invia al display" — coerente con griglia/fog.
4. Mostra un'immagine ai giocatori: la sezione "Rosa dei venti" (come Pan/zoom e Opacità griglia) si nasconde nella scheda Mappa di `/control`.
5. Ferma il server e cancella le cartelle temporanee.

- [ ] **Step 6: Commit**

```bash
git add public/control/index.html public/control/control.css public/control/control.js
git commit -m "feat: compass rose visibility toggle in /control"
```

---

### Task 4: `/editor` — posizione, rotazione, visibilità

**Files:**
- Modify: `public/editor/index.html`
- Modify: `public/editor/editor.css`
- Modify: `public/editor/editor.js`

**Interfaces:**
- Consumes: evento socket `compass:update` (Task 1). Riusa `getActiveLocation()`, `bindNumberCommit()`, il pattern di trascinamento già esistente (`draggingIndex`/`gridAlignDrag`) in `editor.js`.
- Produces: nessuna interfaccia per altri task (ultimo task del piano).

- [ ] **Step 1: Aggiungi l'icona e i controlli toolbar in `public/editor/index.html`**

Dentro il blocco `<svg style="display:none">` (dopo l'ultimo `<symbol>` esistente, `i-more`), aggiungi:

```html
  <symbol id="i-compass" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/></symbol>
```

Nella toolbar della mappa, l'attuale (il gruppo griglia seguito dal separatore e dal gruppo zoom):

```html
        <label class="icon-num" title="Opacità griglia">
          <input type="number" id="grid-opacity-num" min="0" max="100" step="10" value="100">
          <span class="unit">%</span>
        </label>
      </div>

      <div class="toolbar-sep"></div>

      <div class="toolbar-group">
        <button id="editor-zoom-reset" class="icon-btn" title="Reset zoom">
```

diventa:

```html
        <label class="icon-num" title="Opacità griglia">
          <input type="number" id="grid-opacity-num" min="0" max="100" step="10" value="100">
          <span class="unit">%</span>
        </label>
      </div>

      <div class="toolbar-sep"></div>

      <div class="toolbar-group">
        <button id="compass-toggle" class="icon-btn tool" title="Mostra/nascondi rosa dei venti">
          <svg class="icon"><use href="#i-compass"></use></svg>
        </button>
        <label class="icon-num" title="Rotazione rosa dei venti">
          <input type="number" id="compass-rotation-num" min="0" max="359" step="1" value="0">
          <span class="unit">°</span>
        </label>
      </div>

      <div class="toolbar-sep"></div>

      <div class="toolbar-group">
        <button id="editor-zoom-reset" class="icon-btn" title="Reset zoom">
```

- [ ] **Step 2: Aggiungi l'elemento trascinabile dentro `#map-canvas`**

L'attuale:

```html
    <div id="map-canvas" class="map-canvas">
      <div id="map-canvas-zoom" class="map-canvas-zoom">
        <div id="map-media-wrap" class="media-wrap">
          <div id="overlay-box" class="overlay-box fit-box">
            <img id="map-preview-img" class="map-canvas-img" draggable="false" hidden>
            <video id="map-preview-video" class="map-canvas-img" draggable="false" muted loop playsinline disablepictureinpicture hidden></video>
            <div id="map-canvas-placeholder" class="map-canvas-placeholder"></div>
            <svg id="grid-svg" viewBox="0 0 100 100" preserveAspectRatio="none"></svg>
            <svg id="polygon-svg" viewBox="0 0 100 100" preserveAspectRatio="none"></svg>
          </div>
        </div>
      </div>
    </div>
```

diventa:

```html
    <div id="map-canvas" class="map-canvas">
      <div id="map-canvas-zoom" class="map-canvas-zoom">
        <div id="map-media-wrap" class="media-wrap">
          <div id="overlay-box" class="overlay-box fit-box">
            <img id="map-preview-img" class="map-canvas-img" draggable="false" hidden>
            <video id="map-preview-video" class="map-canvas-img" draggable="false" muted loop playsinline disablepictureinpicture hidden></video>
            <div id="map-canvas-placeholder" class="map-canvas-placeholder"></div>
            <svg id="grid-svg" viewBox="0 0 100 100" preserveAspectRatio="none"></svg>
            <svg id="polygon-svg" viewBox="0 0 100 100" preserveAspectRatio="none"></svg>
          </div>
        </div>
      </div>
      <button id="compass-drag" class="compass-drag" title="Trascina per posizionare la rosa dei venti" hidden>
        <svg viewBox="0 0 120 120">
          <path class="compass-drag-star" d="M60,12 L74,46 L108,60 L74,74 L60,108 L46,74 L12,60 L46,46 Z"/>
          <circle class="compass-drag-hub" cx="60" cy="60" r="7"/>
          <text x="60" y="10" text-anchor="middle">N</text>
          <text x="60" y="118" text-anchor="middle">S</text>
          <text x="114" y="64" text-anchor="middle">E</text>
          <text x="6" y="64" text-anchor="middle">O</text>
        </svg>
      </button>
    </div>
```

`#map-canvas` è già `position: relative` (regola `.map-canvas` esistente), quindi `#compass-drag` (con `position: absolute`) si posiziona correttamente rispetto ad esso senza altre modifiche CSS al contenitore.

- [ ] **Step 3: Aggiungi lo stile in `public/editor/editor.css`**

In fondo al file, aggiungi:

```css
.compass-drag {
  position: absolute;
  width: 56px;
  height: 56px;
  padding: 0;
  border: none;
  background: none;
  cursor: grab;
  touch-action: none;
  z-index: 6;
}

.compass-drag:active {
  cursor: grabbing;
}

.compass-drag svg {
  width: 100%;
  height: 100%;
}

.compass-drag-star {
  fill: var(--accent);
}

.compass-drag-hub {
  fill: var(--bg-canvas);
  stroke: var(--accent);
  stroke-width: 2;
}

.compass-drag text {
  fill: var(--text-primary);
  font-size: 14px;
  font-weight: 600;
}

/* Rosa dei venti spenta: resta trascinabile/regolabile in anticipo, ma
   visivamente distinta dallo stato "attiva" mostrato ai giocatori. */
.compass-drag.off {
  opacity: 0.5;
}

.compass-drag.off .compass-drag-star {
  fill: none;
  stroke: var(--text-primary);
  stroke-width: 2;
  stroke-dasharray: 4 3;
}
```

- [ ] **Step 4: Aggiungi i riferimenti DOM in `public/editor/editor.js`**

Dopo la riga `const mapUploadWarning = document.getElementById('map-upload-warning');` aggiungi:

```js
const compassToggleBtn = document.getElementById('compass-toggle');
const compassRotationNum = document.getElementById('compass-rotation-num');
const compassDragHandle = document.getElementById('compass-drag');
```

- [ ] **Step 5: Aggiungi la conversione coordinate**

Subito dopo la definizione di `pointFromClientXY` (prima di `basePointFromClientXY`), aggiungi:

```js
// Percentuale rispetto al riquadro DI #map-canvas (non di overlayBox, che è
// dentro la parte che ruota con la mappa): la rosa dei venti è un elemento
// fisso sullo schermo, non un dato mappa -- stessa idea di come si comporta
// su /display, dove #viewport (l'equivalente del riquadro dello schermo) non
// ruota mai insieme a #map-media-wrap.
function canvasPointFromClientXY(clientX, clientY) {
  const rect = mapCanvas.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * 100;
  const y = ((clientY - rect.top) / rect.height) * 100;
  return [Math.min(100, Math.max(0, x)), Math.min(100, Math.max(0, y))];
}
```

- [ ] **Step 6: Aggiorna `render()`**

Nella funzione `render()`, nel ramo iniziale per "nessuna location attiva" (quello che fa `return` presto), l'attuale:

```js
    imageList.innerHTML = '<p class="hint">nessuna location attiva — creane una qui sopra.</p>';
    updateZoomBox();
    return;
```

diventa:

```js
    imageList.innerHTML = '<p class="hint">nessuna location attiva — creane una qui sopra.</p>';
    compassDragHandle.hidden = true;
    updateZoomBox();
    return;
```

Poi, in un punto qualunque dopo che `location` è garantita esistere (es. subito dopo le righe che impostano `mapScaleNum.value`/`flip180Btn`/`rotate90Btn`), aggiungi:

```js
  const compass = location.map.compass;
  compassToggleBtn.classList.toggle('active', Boolean(compass && compass.visible));
  if (compass) {
    compassRotationNum.value = String(compass.rotation);
    compassDragHandle.hidden = false;
    compassDragHandle.classList.toggle('off', !compass.visible);
    compassDragHandle.style.left = `${compass.x}%`;
    compassDragHandle.style.top = `${compass.y}%`;
    compassDragHandle.style.transform = `translate(-50%, -50%) rotate(${compass.rotation}deg)`;
  } else {
    compassDragHandle.hidden = true;
  }
```

- [ ] **Step 7: Aggiungi i listener del toggle e della rotazione**

In fondo al file, aggiungi:

```js
compassToggleBtn.addEventListener('click', () => {
  const location = getActiveLocation();
  if (!location || !location.map.compass) return;
  socket.emit('compass:update', { locationId: location.id, visible: !location.map.compass.visible });
});

bindNumberCommit(compassRotationNum, 0, 359, (v) => {
  const location = getActiveLocation();
  if (!location) return;
  socket.emit('compass:update', { locationId: location.id, rotation: Math.round(v) });
});
```

- [ ] **Step 8: Aggiungi il trascinamento**

Dopo la riga `let gridAlignDrag = null;` (vicino alle altre variabili di stato del trascinamento in cima al file), aggiungi:

```js
let compassDragging = false;
let compassDragPos = null;
```

(`compassDragPos` tiene l'ultima posizione calcolata durante il trascinamento. Non si può ricalcolarla a fine gesto rileggendo `compassDragHandle.getBoundingClientRect()`: l'elemento è ruotato in base a `compass.rotation`, e per un elemento ruotato il riquadro che `getBoundingClientRect()` restituisce è quello — più grande — del contenitore allineato agli assi, non quello dell'icona stessa, quindi `rect.left/top` combinati con la larghezza/altezza originali darebbero un punto sbagliato per qualunque rotazione diversa da 0/90/180/270°.)

Nell'handler `compassDragHandle`, subito dopo la sua dichiarazione (Step 4), aggiungi:

```js
compassDragHandle.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  compassDragging = true;
});
```

Nel listener globale `document.addEventListener('pointermove', (e) => { ... });`, l'attuale primo blocco:

```js
document.addEventListener('pointermove', (e) => {
  if (gridAlignDrag) {
```

diventa:

```js
document.addEventListener('pointermove', (e) => {
  if (compassDragging) {
    const [x, y] = canvasPointFromClientXY(e.clientX, e.clientY);
    compassDragHandle.style.left = `${x}%`;
    compassDragHandle.style.top = `${y}%`;
    compassDragPos = [x, y];
    return;
  }

  if (gridAlignDrag) {
```

Nel listener globale `document.addEventListener('pointerup', () => { ... });`, l'attuale inizio:

```js
document.addEventListener('pointerup', () => {
  if (gridAlignDrag) {
```

diventa:

```js
document.addEventListener('pointerup', () => {
  if (compassDragging) {
    compassDragging = false;
    const location = getActiveLocation();
    if (location && compassDragPos) {
      socket.emit('compass:update', { locationId: location.id, x: compassDragPos[0], y: compassDragPos[1] });
    }
    compassDragPos = null;
    return;
  }

  if (gridAlignDrag) {
```

- [ ] **Step 9: Verifica manuale**

Con un server isolato:
1. Apri `/editor`. Nella toolbar della mappa compare il gruppo con l'icona rosa dei venti e il campo rotazione; sopra l'anteprima della mappa compare l'icona della rosa dei venti trascinabile (tratteggiata e semi-trasparente, essendo spenta di default) in basso a destra.
2. Trascinala in un altro punto: si sposta fluidamente durante il trascinamento e resta lì al rilascio. Ricarica la pagina: la posizione è quella salvata.
3. Clicca il pulsante di attivazione: l'icona nella toolbar si evidenzia in ambra, l'icona sul canvas diventa piena (non più tratteggiata). Apri `/display`: la rosa dei venti compare esattamente nella posizione/rotazione impostate.
4. Cambia il valore di rotazione nel campo numerico (es. 90) e premi Invio o clicca altrove: `/display` aggiorna la rotazione.
5. Crea una seconda location: ha la sua rosa dei venti indipendente (spenta, posizione di default), lasciando la prima invariata.
6. Cambia orientamento della mappa (flip180/rotate90 esistenti): posizione e rotazione della rosa dei venti non cambiano.
7. Ferma il server e cancella le cartelle temporanee.

- [ ] **Step 10: Commit**

```bash
git add public/editor/index.html public/editor/editor.css public/editor/editor.js
git commit -m "feat: compass rose position/rotation/visibility controls in /editor"
```
