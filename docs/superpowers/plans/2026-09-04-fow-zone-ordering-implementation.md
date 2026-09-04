# Fog-of-War Zone Ordering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** let the editor sort a location's fog-of-war zones alphabetically by name with one click, and drag any zone to a specific position — both persist via the same server event.

**Architecture:** one new server event, `polygon:reorder`, is the single source of truth for a location's polygon order. Task 1 builds it alongside its first consumer (the alphabetical-sort button); Task 2 adds the second consumer (drag-to-reorder), reusing the same event and mirroring the location-list drag-to-reorder mechanism already shipped in this codebase.

## Global Constraints

- No automated test suite in this project by design. Verification is manual: an isolated test server (temp `DATA_DIR`/`STORAGE_DIR`/`PORT`, never the real `data/`/`storage/`) plus live browser checks.
- Alphabetical sort: `localeCompare(other, 'it', { numeric: true, sensitivity: 'base' })` — case/accent-insensitive, natural numeric ordering ("Stanza 2" before "Stanza 10"). One-shot action, not a persistent sorted mode.
- Drag-to-reorder: Pointer Events (not native HTML5 drag-and-drop), mouse and touch, `touch-action: none` set permanently on the drag handle (not toggled dynamically), a dedicated handle per row (not the whole row, so clicking to select/rename a zone still works), and a `pointerdown` guard against a second concurrent pointer clobbering an in-progress drag (`if (polygonDragState) return;` as the handler's first line — a bug found and fixed in the location-list drag-to-reorder that this task must not repeat).
- Server's `polygon:reorder` handler: silently filters `orderedIds` to ids that both exist in the location's current polygon set and aren't duplicated, applies the reorder only if what remains is the complete set (no partial application), and resyncs the requesting socket with the current state on any rejection path — mirrors `location:reorder`'s already-shipped, already-reviewed behavior exactly (including its rejection-resync fix), not a stricter "reject the whole request on any invalid id" behavior.
- Zone order affects only list display (editor's polygon list, `/control`'s fog-of-war list) — never fog rendering itself.

---

### Task 1: Alphabetical sort button + `polygon:reorder` server handler

**Files:**
- Modify: `server/index.js`
- Modify: `public/editor/index.html`
- Modify: `public/editor/editor.css`
- Modify: `public/editor/editor.js`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: server event `polygon:reorder` (`{ locationId, orderedIds }`) — Task 2 emits this same event from its drag handler.

- [ ] **Step 1: Add the server-side reorder handler**

In `server/index.js`, find:

```js
  socket.on('polygon:delete', ({ locationId, polygonId }) => {
    const location = state.locations.find((l) => l.id === locationId);
    if (!location) return;
    location.map.polygons = location.map.polygons.filter((p) => p.id !== polygonId);
    saveState(state);
    broadcastState();
  });
```

Replace with:

```js
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
    const byId = new Map(location.map.polygons.map((p) => [p.id, p]));
    location.map.polygons = validOrder.map((id) => byId.get(id));
    saveState(state);
    broadcastState();
  });
```

- [ ] **Step 2: Add the sort icon and button next to the "Fog of war" header**

In `public/editor/index.html`, find:

```html
  <symbol id="i-grip" viewBox="0 0 24 24"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></symbol>
</svg>
```

Replace with:

```html
  <symbol id="i-grip" viewBox="0 0 24 24"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></symbol>
  <symbol id="i-sort-az" viewBox="0 0 24 24"><path d="M4 6h6M4 12h9M4 18h12M18 4v14M18 18l3-3M18 18l-3-3"/></symbol>
</svg>
```

Then find:

```html
    <section>
      <h2>Fog of war</h2>
      <div id="polygon-list" class="list"></div>
    </section>
```

Replace with:

```html
    <section>
      <div class="section-header">
        <h2>Fog of war</h2>
        <button id="polygon-sort-az" class="icon-btn" title="Ordina alfabeticamente">
          <svg class="icon"><use href="#i-sort-az"></use></svg>
        </button>
      </div>
      <div id="polygon-list" class="list"></div>
    </section>
```

- [ ] **Step 3: Style the new header row**

In `public/editor/editor.css`, find:

```css
h2 {
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary);
  margin: 0 0 10px;
}
```

Replace with:

```css
h2 {
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary);
  margin: 0 0 10px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.section-header h2 {
  margin-bottom: 0;
}
```

- [ ] **Step 4: Wire the button**

In `public/editor/editor.js`, find:

```js
const deletePolygonBtn = document.getElementById('delete-polygon');
```

Replace with:

```js
const deletePolygonBtn = document.getElementById('delete-polygon');
const polygonSortAzBtn = document.getElementById('polygon-sort-az');
```

Find:

```js
const LOCATION_DEPENDENT_CONTROLS = [
  mapUpload, removeMapBtn, flip180Btn, rotate90Btn, mapScaleNum,
  toolSelectBtn, toolDrawBtn, drawFinishBtn, drawCancelBtn, deletePolygonBtn, fogOpacityNum,
```

Replace with:

```js
const LOCATION_DEPENDENT_CONTROLS = [
  mapUpload, removeMapBtn, flip180Btn, rotate90Btn, mapScaleNum,
  toolSelectBtn, toolDrawBtn, drawFinishBtn, drawCancelBtn, deletePolygonBtn, polygonSortAzBtn, fogOpacityNum,
```

Find:

```js
bindNumberCommit(fogOpacityNum, 0, 100, (v) => {
  fogOpacity = v / 100;
  renderPolygonsSvg();
});
```

Add right after it:

```js

polygonSortAzBtn.addEventListener('click', () => {
  const location = getActiveLocation();
  if (!location) return;
  const orderedIds = [...(location.map.polygons || [])]
    .sort((a, b) => a.name.localeCompare(b.name, 'it', { numeric: true, sensitivity: 'base' }))
    .map((p) => p.id);
  socket.emit('polygon:reorder', { locationId: state.activeLocationId, orderedIds });
});
```

- [ ] **Step 5: Syntax-check**

```bash
node --check server/index.js && node --check public/editor/editor.js
```

Expected: no output, exit code 0.

- [ ] **Step 6: Live verification**

Isolated test server, one location with at least 4 polygons named so alphabetical order differs from creation order and exercises natural-numeric sort (e.g. names `Stanza 10`, `Stanza 2`, `Corridoio`, `andito` — mixed case, and a number pair that would sort wrong under plain string comparison).

1. Open `/editor`, select that location, click the sort button — confirm the polygon list reorders to `andito, Corridoio, Stanza 2, Stanza 10` (case-insensitive, `2` before `10`).
2. Reload `/editor` — confirm the new order persisted (`GET /api/state` on the isolated server, or check `data/state.json` in the temp `DATA_DIR`).
3. Open `/control` — confirm its fog-of-war list reflects the same new order.
4. Emit `polygon:reorder` directly via a raw socket client with a stale/partial/duplicate `orderedIds` (bypassing the UI) — confirm the server rejects (order unchanged) and the emitting socket receives a `state:update` back.
5. Confirm zone selection, renaming, and fog-toggle behavior on `/control` are unaffected by the reorder.
6. No console errors on `/editor` or `/control`.

- [ ] **Step 7: Commit**

```bash
git add server/index.js public/editor/index.html public/editor/editor.css public/editor/editor.js
git commit -m "Add alphabetical sort for fog-of-war zones

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Drag-to-reorder fog-of-war zones (mouse + touch)

**Files:**
- Modify: `public/editor/editor.js`
- Modify: `public/editor/editor.css`

**Interfaces:**
- Consumes: server event `polygon:reorder` (`{ locationId, orderedIds }`) from Task 1 — no server changes in this task.
- Produces: nothing further downstream.

- [ ] **Step 1: Add the drag handle to each polygon row and guard the list rebuild**

In `public/editor/editor.js`, find:

```js
function renderPolygonList(location) {
  polygonList.innerHTML = (location.map.polygons || [])
    .map(
      (poly) => `
        <div class="polygon-row ${poly.id === selectedPolygonId ? 'selected' : ''}" data-id="${poly.id}">
          <input type="text" value="${escapeHtml(poly.name)}" data-name-for="${poly.id}">
          <span class="state-tag">${poly.revealed ? 'rivelata' : 'nascosta'}</span>
        </div>
      `
    )
    .join('');
}
```

Replace with:

```js
let polygonDragState = null;

function renderPolygonList(location) {
  if (polygonDragState) return;
  polygonList.innerHTML = (location.map.polygons || [])
    .map(
      (poly) => `
        <div class="polygon-row ${poly.id === selectedPolygonId ? 'selected' : ''}" data-id="${poly.id}">
          <span class="drag-handle" data-drag-polygon="${poly.id}" title="Trascina per riordinare">
            <svg class="icon"><use href="#i-grip"></use></svg>
          </span>
          <input type="text" value="${escapeHtml(poly.name)}" data-name-for="${poly.id}">
          <span class="state-tag">${poly.revealed ? 'rivelata' : 'nascosta'}</span>
        </div>
      `
    )
    .join('');
}
```

- [ ] **Step 2: Stop the drag handle from also triggering zone selection**

In `public/editor/editor.js`, find:

```js
polygonList.addEventListener('click', (e) => {
  const row = e.target.closest('.polygon-row');
  if (!row || e.target.matches('input')) return;
```

Replace with:

```js
polygonList.addEventListener('click', (e) => {
  const row = e.target.closest('.polygon-row');
  if (!row || e.target.matches('input') || e.target.closest('[data-drag-polygon]')) return;
```

- [ ] **Step 3: Add the pointer handlers**

In `public/editor/editor.js`, find:

```js
polygonList.addEventListener('change', (e) => {
  const input = e.target.closest('input[data-name-for]');
  if (!input) return;
  socket.emit('polygon:update', {
    locationId: state.activeLocationId,
    polygonId: input.dataset.nameFor,
    name: input.value
  });
});
```

Add right after it:

```js

function getPolygonRows() {
  return Array.from(polygonList.querySelectorAll('.polygon-row'));
}

polygonList.addEventListener('pointerdown', (e) => {
  if (polygonDragState) return;
  const handle = e.target.closest('[data-drag-polygon]');
  if (!handle) return;
  const row = handle.closest('.polygon-row');
  if (!row) return;
  polygonDragState = { pointerId: e.pointerId, rowEl: row };
  row.classList.add('dragging');
  row.setPointerCapture(e.pointerId);
});

polygonList.addEventListener('pointermove', (e) => {
  if (!polygonDragState || e.pointerId !== polygonDragState.pointerId) return;
  const draggedRow = polygonDragState.rowEl;
  const overRow = getPolygonRows().find((row) => {
    if (row === draggedRow) return false;
    const rect = row.getBoundingClientRect();
    return e.clientY >= rect.top && e.clientY <= rect.bottom;
  });
  if (!overRow) return;
  const overRect = overRow.getBoundingClientRect();
  const insertBefore = e.clientY < overRect.top + overRect.height / 2;
  polygonList.insertBefore(draggedRow, insertBefore ? overRow : overRow.nextSibling);
});

function endPolygonDrag(e) {
  if (!polygonDragState || e.pointerId !== polygonDragState.pointerId) return;
  polygonDragState.rowEl.classList.remove('dragging');
  const orderedIds = getPolygonRows().map((row) => row.dataset.id);
  polygonDragState = null;
  socket.emit('polygon:reorder', { locationId: state.activeLocationId, orderedIds });
}

polygonList.addEventListener('pointerup', endPolygonDrag);
polygonList.addEventListener('pointercancel', endPolygonDrag);
```

- [ ] **Step 4: Style the drag state**

In `public/editor/editor.css`, find:

```css
.polygon-row.selected {
  border-color: var(--accent);
  background: var(--accent-bg-subtle);
}
```

Replace with:

```css
.polygon-row.selected {
  border-color: var(--accent);
  background: var(--accent-bg-subtle);
}

.polygon-row.dragging {
  opacity: 0.6;
  border-color: var(--accent);
}
```

(`.drag-handle` itself, including its permanent `touch-action: none`, already exists in this file from the location-list drag-to-reorder work — reused as-is, no new rule needed for it.)

- [ ] **Step 5: Syntax-check**

```bash
node --check public/editor/editor.js
```

Expected: no output, exit code 0.

- [ ] **Step 6: Live verification**

Isolated test server, one location with at least 3 polygons.

1. **Mouse**: drag a polygon row by its grip handle to a new position using real mouse input (`left_click_drag` or equivalent real-pointer action, not synthetic `dispatchEvent`). Confirm it visually follows and lands in the new slot.
2. **Touch**: under mobile/touch viewport emulation, repeat with real touch input where your tooling supports it. If genuine touch-gesture completion isn't drivable in your environment (a known limitation hit during the location-list drag-to-reorder work — `setPointerCapture` `NotFoundError` on synthetic touch under viewport emulation), don't chase it as a bug: confirm instead that `pointerdown` reaches the capture call on a touch-originated pointer, and that `getComputedStyle` on `.drag-handle` shows `touch-action: none` under mobile emulation — report explicitly which of these you verified live versus by static trace.
3. Confirm the pointerdown guard: dispatch a second `pointerdown` (different `pointerId`) on another handle while a drag is active — confirm it's ignored and the original drag completes normally (this guard is in the code from the start this time, but re-verify it actually behaves as intended).
4. Reload `/editor` — confirm the dragged order persisted.
5. Confirm clicking a zone row (not the handle) still selects it for editing, and confirm renaming a zone via its name input still works — the click-handler guard added in Step 2 must not have broken normal row interaction.
6. No console errors.

- [ ] **Step 7: Commit**

```bash
git add public/editor/editor.js public/editor/editor.css
git commit -m "Add drag-to-reorder for fog-of-war zones (mouse and touch)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
