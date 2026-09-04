# Grid Opacity from Control + Alignment Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** let grid opacity be adjusted (really, shared, saved) from `/control`, and improve the editor's grid-alignment drag with a square-constrain toggle and a cell-subdivision input.

**Architecture:** Task 1 adds a new persisted `location.map.grid.opacity` field end-to-end (schema, server, shared renderer, editor UI, `/control` UI). Task 2 is purely client-side, modifying only the editor's existing grid-align drag function and its live visual preview — no schema or server changes.

## Global Constraints

- No automated test suite in this project by design. Verification is manual: an isolated test server (temp `DATA_DIR`/`STORAGE_DIR`/`PORT`, never the real `data/`/`storage/`) plus live browser checks.
- `grid.opacity`: number `0`-`1`, default `1` (fully opaque — every existing saved grid must render unchanged after migration).
- `/control`'s opacity control is **blind** — it does not render the grid in its own map preview (explicit decision; fog is shown there, grid is not and stays that way). It only adjusts what `/display` (and the editor, if open) actually render, and is hidden/non-interactive when the active location's grid isn't enabled.
- Square-constrain: off by default, a toggle button next to the existing grid-align tool. When on, both the live drag preview AND the final saved `cellSize` calculation use the larger of the dragged width/height for both dimensions — the two must stay numerically consistent (what's shown during the drag is exactly what gets saved).
- Cell subdivision: a number input (default `1`, minimum `1`) next to the same tool. The traced cell's computed size is divided by this value before being saved. Not persisted, not sent to the server directly — read fresh at the moment a grid-align drag completes.

---

### Task 1: Grid opacity, adjustable from `/control`

**Files:**
- Modify: `server/state.js`
- Modify: `server/index.js`
- Modify: `public/shared/media.js`
- Modify: `public/editor/index.html`
- Modify: `public/editor/editor.js`
- Modify: `public/control/index.html`
- Modify: `public/control/control.js`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `location.map.grid.opacity` (persisted field), `grid:update`'s `opacity` parameter — Task 2 doesn't touch either.

- [ ] **Step 1: Add `opacity` to the grid schema, default, and migration**

In `server/state.js`, find:

```js
const DEFAULT_GRID = { enabled: false, cellSize: 100, offsetX: 0, offsetY: 0, color: '#ffffff', lineWidth: 0.3 };
```

Replace with:

```js
const DEFAULT_GRID = { enabled: false, cellSize: 100, offsetX: 0, offsetY: 0, color: '#ffffff', lineWidth: 0.3, opacity: 1 };
```

Find:

```js
  gridPreset: { cellSize: 100, offsetX: 0, offsetY: 0, color: '#ffffff', lineWidth: 0.3 },
```

Replace with:

```js
  gridPreset: { cellSize: 100, offsetX: 0, offsetY: 0, color: '#ffffff', lineWidth: 0.3, opacity: 1 },
```

Find:

```js
  if (!state.gridPreset) {
    state.gridPreset = { cellSize: 100, offsetX: 0, offsetY: 0, color: '#ffffff', lineWidth: 0.3 };
  }
  if (state.gridPreset.color === undefined) state.gridPreset.color = '#ffffff';
  if (state.gridPreset.lineWidth === undefined) state.gridPreset.lineWidth = 0.3;
```

Replace with:

```js
  if (!state.gridPreset) {
    state.gridPreset = { cellSize: 100, offsetX: 0, offsetY: 0, color: '#ffffff', lineWidth: 0.3, opacity: 1 };
  }
  if (state.gridPreset.color === undefined) state.gridPreset.color = '#ffffff';
  if (state.gridPreset.lineWidth === undefined) state.gridPreset.lineWidth = 0.3;
  if (state.gridPreset.opacity === undefined) state.gridPreset.opacity = 1;
```

Find:

```js
    if (!location.map.grid) location.map.grid = { ...DEFAULT_GRID };
    if (location.map.grid.color === undefined) location.map.grid.color = '#ffffff';
    if (location.map.grid.lineWidth === undefined) location.map.grid.lineWidth = 0.3;
```

Replace with:

```js
    if (!location.map.grid) location.map.grid = { ...DEFAULT_GRID };
    if (location.map.grid.color === undefined) location.map.grid.color = '#ffffff';
    if (location.map.grid.lineWidth === undefined) location.map.grid.lineWidth = 0.3;
    if (location.map.grid.opacity === undefined) location.map.grid.opacity = 1;
```

- [ ] **Step 2: Extend `grid:update` and the preset save/apply handlers**

In `server/index.js`, find:

```js
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
```

Replace with:

```js
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
```

Find:

```js
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
```

Replace with:

```js
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
```

- [ ] **Step 3: Apply opacity in the shared grid renderer**

In `public/shared/media.js`, find:

```js
function renderGridSvg(svgEl, grid, naturalW, naturalH) {
  svgEl.innerHTML = '';
  if (!grid || !grid.enabled || !naturalW || !naturalH) return;

  const cellSize = Math.max(4, grid.cellSize || 100);
```

Replace with:

```js
function renderGridSvg(svgEl, grid, naturalW, naturalH) {
  svgEl.innerHTML = '';
  if (!grid || !grid.enabled || !naturalW || !naturalH) return;

  svgEl.style.opacity = grid.opacity === undefined ? 1 : grid.opacity;

  const cellSize = Math.max(4, grid.cellSize || 100);
```

This is picked up automatically on `/editor` and `/display` (both call `renderGridSvg` already) — no further changes needed in `display.js`.

- [ ] **Step 4: Add the opacity input to the editor toolbar**

In `public/editor/index.html`, find:

```html
        <input type="color" id="grid-color" class="color-swatch" value="#ffffff" title="Colore griglia">
        <label class="icon-num" title="Spessore tratto griglia">
          <input type="number" id="grid-width-num" min="0.2" max="5" step="0.1" value="0.3">
        </label>
      </div>
```

Replace with:

```html
        <input type="color" id="grid-color" class="color-swatch" value="#ffffff" title="Colore griglia">
        <label class="icon-num" title="Spessore tratto griglia">
          <input type="number" id="grid-width-num" min="0.2" max="5" step="0.1" value="0.3">
        </label>
        <label class="icon-num" title="Opacità griglia">
          <input type="number" id="grid-opacity-num" min="0" max="100" step="10" value="100">
          <span class="unit">%</span>
        </label>
      </div>
```

In `public/editor/editor.js`, find:

```js
const gridColorInput = document.getElementById('grid-color');
const gridWidthNum = document.getElementById('grid-width-num');
```

Replace with:

```js
const gridColorInput = document.getElementById('grid-color');
const gridWidthNum = document.getElementById('grid-width-num');
const gridOpacityNum = document.getElementById('grid-opacity-num');
```

Find:

```js
const LOCATION_DEPENDENT_CONTROLS = [
  mapUpload, removeMapBtn, flip180Btn, rotate90Btn, mapScaleNum,
  toolSelectBtn, toolDrawBtn, drawFinishBtn, drawCancelBtn, deletePolygonBtn, polygonSortAzBtn, fogOpacityNum,
  gridToggleBtn, gridAlignToolBtn, gridColorInput, gridWidthNum,
```

Replace with:

```js
const LOCATION_DEPENDENT_CONTROLS = [
  mapUpload, removeMapBtn, flip180Btn, rotate90Btn, mapScaleNum,
  toolSelectBtn, toolDrawBtn, drawFinishBtn, drawCancelBtn, deletePolygonBtn, polygonSortAzBtn, fogOpacityNum,
  gridToggleBtn, gridAlignToolBtn, gridColorInput, gridWidthNum, gridOpacityNum,
```

Find:

```js
  gridColorInput.value = grid.color || '#ffffff';
  gridWidthNum.value = String(grid.lineWidth || 0.3);
```

Replace with:

```js
  gridColorInput.value = grid.color || '#ffffff';
  gridWidthNum.value = String(grid.lineWidth || 0.3);
  gridOpacityNum.value = String(Math.round((grid.opacity === undefined ? 1 : grid.opacity) * 100));
```

Find:

```js
bindNumberCommit(gridWidthNum, 0.2, 5, (v) => {
  socket.emit('grid:update', { locationId: state.activeLocationId, lineWidth: v });
});
```

Add right after it:

```js

bindNumberCommit(gridOpacityNum, 0, 100, (v) => {
  socket.emit('grid:update', { locationId: state.activeLocationId, opacity: v / 100 });
});
```

- [ ] **Step 5: Add the blind opacity control to `/control`**

In `public/control/index.html`, find:

```html
    <section id="pan-zoom-section">
```

Add right before it (a new sibling section):

```html
    <section id="grid-opacity-section">
      <h2>Griglia</h2>
      <div class="zoom">
        <button id="grid-opacity-out" title="Riduci opacità griglia">−</button>
        <span id="grid-opacity-level">100%</span>
        <button id="grid-opacity-in" title="Aumenta opacità griglia">+</button>
      </div>
    </section>

    <section id="pan-zoom-section">
```

In `public/control/control.js`, find:

```js
const panZoomSection = document.getElementById('pan-zoom-section');
```

Replace with:

```js
const panZoomSection = document.getElementById('pan-zoom-section');
const gridOpacitySection = document.getElementById('grid-opacity-section');
const gridOpacityOutBtn = document.getElementById('grid-opacity-out');
const gridOpacityInBtn = document.getElementById('grid-opacity-in');
const gridOpacityLevel = document.getElementById('grid-opacity-level');
const GRID_OPACITY_STEP = 0.1;
```

Find:

```js
  zoomLevel.textContent = `${Math.round((state.liveView.scale || 1) * 100)}%`;
  panZoomSection.style.display = showingImage ? 'none' : 'block';
```

Replace with:

```js
  zoomLevel.textContent = `${Math.round((state.liveView.scale || 1) * 100)}%`;
  panZoomSection.style.display = showingImage ? 'none' : 'block';

  const gridEnabled = Boolean(location && location.map.grid && location.map.grid.enabled);
  gridOpacitySection.style.display = gridEnabled ? 'block' : 'none';
  if (gridEnabled) {
    gridOpacityLevel.textContent = `${Math.round((location.map.grid.opacity === undefined ? 1 : location.map.grid.opacity) * 100)}%`;
  }
```

Find:

```js
function stepZoom(delta) {
  const current = (state && state.liveView && state.liveView.scale) || 1;
  const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((current + delta) * 10) / 10));
  socket.emit('view:zoom', { scale: next });
}
zoomOutBtn.addEventListener('click', () => stepZoom(-ZOOM_STEP));
zoomInBtn.addEventListener('click', () => stepZoom(ZOOM_STEP));
```

Add right after it:

```js

function stepGridOpacity(delta) {
  const location = getActiveLocation();
  if (!location || !location.map.grid) return;
  const current = location.map.grid.opacity === undefined ? 1 : location.map.grid.opacity;
  const next = Math.min(1, Math.max(0, Math.round((current + delta) * 10) / 10));
  socket.emit('grid:update', { locationId: state.activeLocationId, opacity: next });
}
gridOpacityOutBtn.addEventListener('click', () => stepGridOpacity(-GRID_OPACITY_STEP));
gridOpacityInBtn.addEventListener('click', () => stepGridOpacity(GRID_OPACITY_STEP));
```

- [ ] **Step 6: Syntax-check**

```bash
node --check server/index.js && node --check server/state.js && node --check public/shared/media.js && node --check public/editor/editor.js && node --check public/control/control.js
```

Expected: no output, exit code 0.

- [ ] **Step 7: Live verification**

Isolated test server, one location with a map and grid enabled (`cellSize` set to something visible, e.g. 100).

1. Open `/control`: confirm the "Griglia" section is visible (grid is enabled) with a `-`/`100%`/`+` row. Click `+`/`-` a few times — confirm the percentage readout changes in 10% steps, clamped at 0% and 100%.
2. Open `/display` and `/editor` in other tabs — confirm the grid overlay visibly dims/brightens to match, live, without reloading.
3. Reload `/control` — confirm the opacity value persisted (`GET /api/state` or check `data/state.json` in the temp dir).
4. Switch to (or create) a location with the grid **disabled** — confirm `/control`'s "Griglia" section disappears (not just disabled-looking, actually hidden).
5. In `/editor`, adjust the new opacity number field directly — confirm `/control`'s readout updates to match on its next render, and vice versa (adjust from `/control`, confirm `/editor`'s field updates).
6. Confirm a pre-existing/legacy location (grid present, no `opacity` key) renders fully opaque by default (migration backfill) and its `/control` readout shows 100%.
7. Confirm `gridPreset:save`/`gridPreset:apply` (the existing "salva come predefinita"/"applica predefinita" buttons in the editor) now also carry opacity across correctly — save a preset at a non-default opacity, apply it to a different location, confirm that location's opacity changes to match.
8. No console errors on `/editor`, `/display`, `/control`.

- [ ] **Step 8: Commit**

```bash
git add server/state.js server/index.js public/shared/media.js public/editor/index.html public/editor/editor.js public/control/index.html public/control/control.js
git commit -m "Add grid opacity, adjustable from /control

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Square-constrained alignment drag + cell subdivision

**Files:**
- Modify: `public/editor/index.html`
- Modify: `public/editor/editor.js`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: nothing downstream depends on.

- [ ] **Step 1: Add the toggle button and the divisions input**

In `public/editor/index.html`, find (inside the `<svg style="display:none">` icon-symbol block):

```html
  <symbol id="i-align" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/></symbol>
```

Add a new symbol right after it:

```html
  <symbol id="i-align" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/></symbol>
  <symbol id="i-square-lock" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="1"/></symbol>
```

Then find:

```html
        <button id="grid-align-tool" class="icon-btn tool" title="Allinea alla griglia della mappa">
          <svg class="icon"><use href="#i-align"></use></svg>
        </button>
        <input type="color" id="grid-color" class="color-swatch" value="#ffffff" title="Colore griglia">
```

Replace with:

```html
        <button id="grid-align-tool" class="icon-btn tool" title="Allinea alla griglia della mappa">
          <svg class="icon"><use href="#i-align"></use></svg>
        </button>
        <button id="grid-align-square" class="icon-btn" title="Vincola il trascinamento a un quadrato perfetto">
          <svg class="icon"><use href="#i-square-lock"></use></svg>
        </button>
        <label class="icon-num" title="Dividi la cella tracciata in N parti">
          <input type="number" id="grid-divisions-num" min="1" max="20" step="1" value="1">
        </label>
        <input type="color" id="grid-color" class="color-swatch" value="#ffffff" title="Colore griglia">
```

- [ ] **Step 2: Wire the toggle and read the divisions input in the alignment math**

In `public/editor/editor.js`, find:

```js
const gridAlignToolBtn = document.getElementById('grid-align-tool');
```

Replace with:

```js
const gridAlignToolBtn = document.getElementById('grid-align-tool');
const gridAlignSquareBtn = document.getElementById('grid-align-square');
const gridDivisionsNum = document.getElementById('grid-divisions-num');
let gridSquareConstrain = false;
```

Find:

```js
function updateGridAlignBox(start, end) {
  const left = Math.min(start[0], end[0]);
  const top = Math.min(start[1], end[1]);
  const width = Math.abs(end[0] - start[0]);
  const height = Math.abs(end[1] - start[1]);
  const box = gridAlignDrag.box;
  box.style.left = `${(left / 100) * currentImageRect.width}px`;
  box.style.top = `${(top / 100) * currentImageRect.height}px`;
  box.style.width = `${(width / 100) * currentImageRect.width}px`;
  box.style.height = `${(height / 100) * currentImageRect.height}px`;
}
```

Replace with:

```js
function updateGridAlignBox(start, end) {
  const left = Math.min(start[0], end[0]);
  const top = Math.min(start[1], end[1]);
  let width = Math.abs(end[0] - start[0]);
  let height = Math.abs(end[1] - start[1]);
  if (gridSquareConstrain) {
    const side = Math.max(width, height);
    width = side;
    height = side;
  }
  const box = gridAlignDrag.box;
  box.style.left = `${(left / 100) * currentImageRect.width}px`;
  box.style.top = `${(top / 100) * currentImageRect.height}px`;
  box.style.width = `${(width / 100) * currentImageRect.width}px`;
  box.style.height = `${(height / 100) * currentImageRect.height}px`;
}
```

Find:

```js
function applyGridAlignment(start, end) {
  const nw = mediaW(activeMapEl);
  const nh = mediaH(activeMapEl);
  const leftPct = Math.min(start[0], end[0]);
  const topPct = Math.min(start[1], end[1]);
  const widthPct = Math.abs(end[0] - start[0]);
  const heightPct = Math.abs(end[1] - start[1]);
  if (widthPct < 0.5 || heightPct < 0.5) return;

  const cellW = (widthPct / 100) * nw;
  const cellH = (heightPct / 100) * nh;
  const cellSize = Math.max(4, Math.round((cellW + cellH) / 2));
  const originX = Math.round((leftPct / 100) * nw);
  const originY = Math.round((topPct / 100) * nh);
  const offsetX = ((originX % cellSize) + cellSize) % cellSize;
  const offsetY = ((originY % cellSize) + cellSize) % cellSize;

  socket.emit('grid:update', {
    locationId: state.activeLocationId,
    enabled: true,
    cellSize,
    offsetX,
    offsetY
  });
}
```

Replace with:

```js
function applyGridAlignment(start, end) {
  const nw = mediaW(activeMapEl);
  const nh = mediaH(activeMapEl);
  const leftPct = Math.min(start[0], end[0]);
  const topPct = Math.min(start[1], end[1]);
  let widthPct = Math.abs(end[0] - start[0]);
  let heightPct = Math.abs(end[1] - start[1]);
  if (gridSquareConstrain) {
    const sidePct = Math.max(widthPct, heightPct);
    widthPct = sidePct;
    heightPct = sidePct;
  }
  if (widthPct < 0.5 || heightPct < 0.5) return;

  const cellW = (widthPct / 100) * nw;
  const cellH = (heightPct / 100) * nh;
  const divisions = Math.max(1, Math.round(Number(gridDivisionsNum.value) || 1));
  const cellSize = Math.max(4, Math.round((cellW + cellH) / 2 / divisions));
  const originX = Math.round((leftPct / 100) * nw);
  const originY = Math.round((topPct / 100) * nh);
  const offsetX = ((originX % cellSize) + cellSize) % cellSize;
  const offsetY = ((originY % cellSize) + cellSize) % cellSize;

  socket.emit('grid:update', {
    locationId: state.activeLocationId,
    enabled: true,
    cellSize,
    offsetX,
    offsetY
  });
}
```

Find:

```js
gridAlignToolBtn.addEventListener('click', () => {
  mode = 'grid-align';
  gridAlignToolBtn.classList.add('active');
```

Add right before it (a new, independent listener — do not modify the `gridAlignToolBtn` listener itself):

```js
gridAlignSquareBtn.addEventListener('click', () => {
  gridSquareConstrain = !gridSquareConstrain;
  gridAlignSquareBtn.classList.toggle('active', gridSquareConstrain);
});

gridAlignToolBtn.addEventListener('click', () => {
  mode = 'grid-align';
  gridAlignToolBtn.classList.add('active');
```

- [ ] **Step 3: Make the two new controls location-dependent**

In `public/editor/editor.js`, find:

```js
  gridToggleBtn, gridAlignToolBtn, gridColorInput, gridWidthNum, gridOpacityNum,
```

Replace with:

```js
  gridToggleBtn, gridAlignToolBtn, gridAlignSquareBtn, gridDivisionsNum, gridColorInput, gridWidthNum, gridOpacityNum,
```

(This array entry only exists after Task 1's Step 4 has run — Task 1 must be complete before this task starts, per the plan's task order.)

- [ ] **Step 4: Syntax-check**

```bash
node --check public/editor/editor.js
```

Expected: no output, exit code 0.

- [ ] **Step 5: Live verification**

Isolated test server, a location with a map loaded (any reasonably large image, e.g. at least 400×400px, so the traced square has room to be imprecise).

1. **Baseline (divisions=1, square-constrain off)**: trace a roughly-square-but-not-exact rectangle over a known region. Confirm the resulting `cellSize` matches today's existing averaging behavior (`Math.round((cellW + cellH) / 2)`) — i.e. confirm this task hasn't changed the default-settings behavior at all.
2. **Square-constrain**: turn the new toggle on (confirm it visually activates), then drag a clearly non-square gesture (e.g. drag far more horizontally than vertically). Confirm the live preview box stays square throughout the drag (equal width/height at every point), and confirm the resulting saved `cellSize` corresponds to the larger dragged dimension, not the average of two different ones.
3. **Divisions**: with square-constrain off, set the divisions field to `2`, trace a square you can measure (e.g. drag exactly 100 image-pixels wide/tall using a zoomed-in view or by checking `currentImageRect` math). Confirm the resulting `cellSize` is half of what it would be with divisions at `1` (same drag). Repeat with `3`.
4. **Combined**: square-constrain on AND divisions at `2` together on the same drag — confirm both effects apply (square base size, then halved).
5. Confirm the resulting grid's `offsetX`/`offsetY` still align correctly with the top-left corner of the originally traced region at every combination above (the grid's first visible line should start at/near the traced square's top-left, not drift).
6. Confirm both new controls are disabled when no location is active or no map is loaded (same as every other `LOCATION_DEPENDENT_CONTROLS` entry).
7. No console errors.

- [ ] **Step 6: Commit**

```bash
git add public/editor/index.html public/editor/editor.js
git commit -m "Add square-constrained grid alignment and cell subdivision

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
