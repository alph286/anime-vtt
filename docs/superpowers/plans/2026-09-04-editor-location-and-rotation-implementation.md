# Editor: Location Reordering, Permanent Deletion, Manual Rotation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** four editor improvements — drag-to-reorder active locations (mouse and touch), permanently deleting archived locations, a manual +90° map rotation stacking with the existing 180° flip, and fixing the one confirm-style button in the app that doesn't use the standard red styling.

**Architecture:** each piece is additive, following patterns already established in this codebase (arm-then-confirm for destructive actions, a boolean flag composed into `computeTotalRotation`, `state.locations`' array order as the one source of display order, the `migrate()` step for schema backfill). The four tasks touch overlapping files (`public/editor/editor.js`/`.html`/`.css`) but are otherwise independent — they're sequenced, not parallel, so this is expected and fine.

## Global Constraints

- No automated test suite in this project by design. Verification is manual: an isolated test server (temp `DATA_DIR`/`STORAGE_DIR`/`PORT`, never the real `data/`/`storage/`) plus live browser checks.
- Rotation: new field `location.map.rotate90` (boolean, default `false`), composed as `(computeAutoRotation(naturalW, naturalH) + (flip180 ? 180 : 0) + (rotate90 ? 90 : 0)) % 360` in `public/shared/media.js`'s `computeTotalRotation`. All 6 existing call sites (`editor.js`, `display.js`, `control.js` ×3) must pass the new argument.
- Reorder: Pointer Events (not native HTML5 drag-and-drop) — must work with both mouse and touch, matching the `/control` page's existing drag-to-pan approach (`touch-action: none` on the drag affordance, real `pointerdown`/`pointermove`/`pointerup`/`pointercancel`).
- Reorder is scoped to **active** locations only. Archived locations are never reorderable and are always appended after the active ones (in whatever relative order they already had) when a reorder is applied server-side.
- Delete is **archived-locations-only** — the server handler must refuse to delete a location that isn't archived, even if asked to. Deleting removes the location record only; it never touches `storage/maps/`/`storage/images/` (the existing orphan-file scanner picks up anything now-unreferenced).
- Arm-then-confirm for delete: same 2.5s-timeout pattern already used for location archiving and image deletion in this file (`armedLocationArchives`/`locationArchiveTimers` is the model to mirror exactly).
- The confirm-button fix targets `#location-confirm-yes` in `public/control/index.html`/`control.css` only.

---

### Task 1: Manual +90° map rotation

**Files:**
- Modify: `public/shared/media.js`
- Modify: `server/state.js`
- Modify: `server/index.js`
- Modify: `public/editor/index.html`
- Modify: `public/editor/editor.js`
- Modify: `public/display/display.js`
- Modify: `public/control/control.js`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `computeTotalRotation(naturalW, naturalH, flip180, rotate90)` (4-arg signature) — Tasks 2-4 don't call this function, so nothing downstream depends on it, but any future work touching rotation must use the 4-arg form.

- [ ] **Step 1: Extend `computeTotalRotation` in the shared module**

In `public/shared/media.js`, find:

```js
/**
 * A map taller than it is wide leaves large empty bars on a landscape TV; rotating
 * it 90° lets it fill far more of the screen. Computed live from the image's own
 * pixel dimensions — never stored, never user-controlled, applied consistently
 * across display/control/editor so what you edit matches what's shown. A separate
 * user-controlled 180° flip (location.map.flip180) composes on top of this for
 * maps where the automatic 90° choice ends up upside down.
 */
function computeAutoRotation(naturalW, naturalH) {
  return naturalH > naturalW ? 90 : 0;
}

function computeTotalRotation(naturalW, naturalH, flip180) {
  return (computeAutoRotation(naturalW, naturalH) + (flip180 ? 180 : 0)) % 360;
}
```

Replace with:

```js
/**
 * A map taller than it is wide leaves large empty bars on a landscape TV; rotating
 * it 90° lets it fill far more of the screen. Computed live from the image's own
 * pixel dimensions — never stored, never user-controlled, applied consistently
 * across display/control/editor so what you edit matches what's shown. Two
 * independent user-controlled flags compose on top of this: a 180° flip
 * (location.map.flip180) for maps where the automatic 90° choice ends up upside
 * down, and a 90° rotation (location.map.rotate90) for maps that need an
 * orientation the auto-detection alone can't reach. Together the two flags cover
 * all 4 orientations from either auto-detected starting point.
 */
function computeAutoRotation(naturalW, naturalH) {
  return naturalH > naturalW ? 90 : 0;
}

function computeTotalRotation(naturalW, naturalH, flip180, rotate90) {
  return (computeAutoRotation(naturalW, naturalH) + (flip180 ? 180 : 0) + (rotate90 ? 90 : 0)) % 360;
}
```

- [ ] **Step 2: Update all 6 call sites to pass `rotate90`**

In `public/editor/editor.js`, find:

```js
  currentRotation = location.map.file && nw
    ? computeTotalRotation(nw, nh, location.map.flip180)
    : 0;
```

Replace with:

```js
  currentRotation = location.map.file && nw
    ? computeTotalRotation(nw, nh, location.map.flip180, location.map.rotate90)
    : 0;
```

In `public/display/display.js`, find:

```js
      const rotation = computeTotalRotation(nw, nh, location.map.flip180);
```

Replace with:

```js
      const rotation = computeTotalRotation(nw, nh, location.map.flip180, location.map.rotate90);
```

In `public/control/control.js`, this exact line appears **three times** (around lines 151, 338, 426 — inside `renderMapPreview`'s load callback, and in the two drag-related functions that compute the TV's current fit). Replace **every occurrence**:

Find (×3):

```js
  const rotation = computeTotalRotation(nw, nh, location.map.flip180);
```

Replace with (×3):

```js
  const rotation = computeTotalRotation(nw, nh, location.map.flip180, location.map.rotate90);
```

(Indentation varies slightly between the three call sites in `control.js` — match whatever indentation the line already has at each site, only the argument list changes.)

- [ ] **Step 3: Add `rotate90` to the state schema (default, migration, new-location template)**

In `server/state.js`, find:

```js
      map: {
        file: null,
        type: 'image',
        scale: 1,
        flip180: false,
        grid: { ...DEFAULT_GRID },
```

Replace with:

```js
      map: {
        file: null,
        type: 'image',
        scale: 1,
        flip180: false,
        rotate90: false,
        grid: { ...DEFAULT_GRID },
```

Then find:

```js
    if (location.map.scale === undefined) location.map.scale = 1;
    if (location.map.flip180 === undefined) location.map.flip180 = false;
```

Replace with:

```js
    if (location.map.scale === undefined) location.map.scale = 1;
    if (location.map.flip180 === undefined) location.map.flip180 = false;
    if (location.map.rotate90 === undefined) location.map.rotate90 = false;
```

In `server/index.js`, find (inside the `location:create` handler):

```js
      map: {
        file: null,
        type: 'image',
        scale: 1,
        flip180: false,
        grid: { ...DEFAULT_GRID },
        polygons: []
      },
```

Replace with:

```js
      map: {
        file: null,
        type: 'image',
        scale: 1,
        flip180: false,
        rotate90: false,
        grid: { ...DEFAULT_GRID },
        polygons: []
      },
```

- [ ] **Step 4: Add the server-side toggle handler**

In `server/index.js`, find:

```js
  socket.on('mapFlip:toggle', ({ locationId }) => {
    const location = state.locations.find((l) => l.id === locationId);
    if (!location) return;
    location.map.flip180 = !location.map.flip180;
    saveState(state);
    broadcastState();
  });
```

Replace with:

```js
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
```

- [ ] **Step 5: Add the editor button — icon, markup, wiring**

In `public/editor/index.html`, find (inside the `<svg style="display:none">` icon-symbol block):

```html
  <symbol id="i-rotate" viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5"/></symbol>
```

Add a new symbol right after it:

```html
  <symbol id="i-rotate" viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5"/></symbol>
  <symbol id="i-rotate-90" viewBox="0 0 24 24"><path d="M4 4h8v8H4z"/><path d="M16 12l4 4-4 4M20 16H12a4 4 0 0 1-4-4v-1"/></symbol>
```

Then find:

```html
        <button id="flip-180" class="icon-btn" title="Ruota mappa 180°">
          <svg class="icon"><use href="#i-rotate"></use></svg>
        </button>
```

Replace with (note `flip-180` also gains the `tool` class here — see the note below):

```html
        <button id="flip-180" class="icon-btn tool" title="Ruota mappa 180°">
          <svg class="icon"><use href="#i-rotate"></use></svg>
        </button>
        <button id="rotate-90" class="icon-btn tool" title="Ruota mappa 90°">
          <svg class="icon"><use href="#i-rotate-90"></use></svg>
        </button>
```

**Why `flip-180` also changes here:** `editor.css` only styles an icon button's "active" (pressed-looking) state via the selector `.icon-btn.tool.active` — every other toggle-style icon button in this file (`tool-select`, `tool-draw`, `grid-toggle`, `grid-align-tool`) already carries `class="icon-btn tool"` in its markup for exactly this reason. `flip-180` was missing `tool`, so `flip180Btn.classList.toggle('active', ...)` in `editor.js` has never had any visible effect — a pre-existing, narrow bug. Since the new `rotate-90` button needs its active state to actually be visible (that's the whole point of a toggle), and it uses the identical styling mechanism, fixing `flip-180`'s missing class alongside it is a one-attribute, directly-in-scope fix — not a broader refactor.

In `public/editor/editor.js`, find:

```js
const removeMapBtn = document.getElementById('remove-map');
const flip180Btn = document.getElementById('flip-180');
```

Replace with:

```js
const removeMapBtn = document.getElementById('remove-map');
const flip180Btn = document.getElementById('flip-180');
const rotate90Btn = document.getElementById('rotate-90');
```

Find:

```js
const LOCATION_DEPENDENT_CONTROLS = [
  mapUpload, removeMapBtn, flip180Btn, mapScaleNum,
```

Replace with:

```js
const LOCATION_DEPENDENT_CONTROLS = [
  mapUpload, removeMapBtn, flip180Btn, rotate90Btn, mapScaleNum,
```

Find:

```js
  flip180Btn.classList.toggle('active', Boolean(location.map.flip180));
```

Replace with:

```js
  flip180Btn.classList.toggle('active', Boolean(location.map.flip180));
  rotate90Btn.classList.toggle('active', Boolean(location.map.rotate90));
```

Find:

```js
flip180Btn.addEventListener('click', () => {
  socket.emit('mapFlip:toggle', { locationId: state.activeLocationId });
});
```

Replace with:

```js
flip180Btn.addEventListener('click', () => {
  socket.emit('mapFlip:toggle', { locationId: state.activeLocationId });
});

rotate90Btn.addEventListener('click', () => {
  socket.emit('mapRotate90:toggle', { locationId: state.activeLocationId });
});
```

- [ ] **Step 6: Syntax-check everything touched**

```bash
node --check server/index.js && node --check server/state.js && node --check public/shared/media.js && node --check public/editor/editor.js && node --check public/display/display.js && node --check public/control/control.js
```

Expected: no output, exit code 0.

- [ ] **Step 7: Live verification**

Isolated test server (temp `DATA_DIR`/`STORAGE_DIR`/`PORT`), a landscape test map and a portrait test map seeded on two different locations (or swap files on one location between checks).

1. Open `/editor`, select the landscape-map location. Click "Ruota mappa 90°" — the map preview rotates 90° in the editor, and `rotate-90` visibly shows its active (pressed) styling. Click "Ruota mappa 180°" too (both active) — total rotation is 270° (0 auto + 90 + 180). Click both off — back to 0°.
2. Repeat on the portrait-map location (auto-rotation 90°): with both flags off, still 90°; with just `rotate90` on, 180°; with just `flip180` on, 270°; with both on, 0°. All 4 orientations reachable.
3. With the editor showing some rotated state, open `/display` and `/control` in other tabs (or reload them) — confirm both match the editor's rotation exactly (map orientation, and — if the location has grid/fog polygons — that clicking a fog zone on `/control` still toggles the correct one, proving `rotatePointToBase` still lines up at the new rotation).
4. Confirm an existing/older location (created before this change, `rotate90` filled in by `migrate()`) still renders at its previous rotation unchanged — `rotate90` defaults `false`.
5. No console errors on `/editor`, `/display`, `/control`.

- [ ] **Step 8: Commit**

```bash
git add public/shared/media.js server/state.js server/index.js public/editor/index.html public/editor/editor.js public/display/display.js public/control/control.js
git commit -m "Add manual +90° map rotation, stacking with the existing 180° flip

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Drag-to-reorder active locations (mouse + touch)

**Files:**
- Modify: `public/editor/index.html`
- Modify: `public/editor/editor.js`
- Modify: `public/editor/editor.css`

**Interfaces:**
- Consumes: `renderLocationPanel()`, `armedLocationArchives`/`locationArchiveTimers` (existing, as a pattern reference only — not modified by this task).
- Produces: a new server event `location:reorder` (`{ orderedIds: string[] }`) — no other task in this plan depends on it.

- [ ] **Step 1: Add the grip icon and the drag handle in each active row's template**

In `public/editor/index.html`, find:

```html
  <symbol id="i-star" viewBox="0 0 24 24"><path d="M12 3l2.6 5.8 6.4.6-4.8 4.3 1.4 6.3L12 16.9 6.4 20l1.4-6.3-4.8-4.3 6.4-.6z"/></symbol>
</svg>
```

Replace with:

```html
  <symbol id="i-star" viewBox="0 0 24 24"><path d="M12 3l2.6 5.8 6.4.6-4.8 4.3 1.4 6.3L12 16.9 6.4 20l1.4-6.3-4.8-4.3 6.4-.6z"/></symbol>
  <symbol id="i-grip" viewBox="0 0 24 24"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></symbol>
</svg>
```

In `public/editor/editor.js`, find:

```js
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
```

Replace with:

```js
  if (!locationDragState) {
    locationList.innerHTML = active
      .map((l) => {
        const armed = armedLocationArchives.has(l.id);
        return `
          <div class="image-editor-row" data-id="${l.id}">
            <span class="drag-handle" data-drag="${l.id}" title="Trascina per riordinare">
              <svg class="icon"><use href="#i-grip"></use></svg>
            </span>
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
  }
```

(Only the `<div class="image-editor-row" ...>` wrapper's contents and the surrounding `if (!locationDragState)` guard changed — the archived-list half of this function, below, is untouched by this step.)

- [ ] **Step 2: Add the drag state and Pointer Event handlers**

In `public/editor/editor.js`, find:

```js
// Stesso pattern arma-poi-conferma dell'eliminazione immagini, per riga (le
// righe vengono ricostruite a ogni render, quindi lo stato "armato" vive
// fuori dal DOM).
const armedLocationArchives = new Set();
const locationArchiveTimers = new Map();
```

Replace with:

```js
// Stesso pattern arma-poi-conferma dell'eliminazione immagini, per riga (le
// righe vengono ricostruite a ogni render, quindi lo stato "armato" vive
// fuori dal DOM).
const armedLocationArchives = new Set();
const locationArchiveTimers = new Map();

// Riordino via Pointer Events (non drag-and-drop nativo, che non ha un
// equivalente touch utilizzabile) -- stesso approccio già usato per il
// trascinamento del riquadro su /control: touch-action:none sulla maniglia
// fin dall'inizio (mai attivato a metà gesto) e pointer capture per seguire
// il dito/mouse ovunque vada. Mentre un trascinamento è attivo,
// renderLocationPanel() salta la ricostruzione della lista attiva (vedi il
// guard `if (!locationDragState)` sopra) così un aggiornamento in arrivo da
// un altro client non scavalca l'ordine che l'utente sta trascinando.
let locationDragState = null;
```

- [ ] **Step 3: Wire the pointer handlers**

In `public/editor/editor.js`, find:

```js
locationList.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('input[data-name-for]')) e.target.blur();
});
```

Add this right after it (don't remove or modify the block above):

```js

function getActiveLocationRows() {
  return Array.from(locationList.querySelectorAll('.image-editor-row'));
}

locationList.addEventListener('pointerdown', (e) => {
  const handle = e.target.closest('[data-drag]');
  if (!handle) return;
  const row = handle.closest('.image-editor-row');
  if (!row) return;
  locationDragState = { pointerId: e.pointerId, rowEl: row };
  row.classList.add('dragging');
  row.setPointerCapture(e.pointerId);
});

locationList.addEventListener('pointermove', (e) => {
  if (!locationDragState || e.pointerId !== locationDragState.pointerId) return;
  const draggedRow = locationDragState.rowEl;
  const overRow = getActiveLocationRows().find((row) => {
    if (row === draggedRow) return false;
    const rect = row.getBoundingClientRect();
    return e.clientY >= rect.top && e.clientY <= rect.bottom;
  });
  if (!overRow) return;
  const overRect = overRow.getBoundingClientRect();
  const insertBefore = e.clientY < overRect.top + overRect.height / 2;
  locationList.insertBefore(draggedRow, insertBefore ? overRow : overRow.nextSibling);
});

function endLocationDrag(e) {
  if (!locationDragState || e.pointerId !== locationDragState.pointerId) return;
  locationDragState.rowEl.classList.remove('dragging');
  const orderedIds = getActiveLocationRows().map((row) => row.dataset.id);
  locationDragState = null;
  socket.emit('location:reorder', { orderedIds });
}

locationList.addEventListener('pointerup', endLocationDrag);
locationList.addEventListener('pointercancel', endLocationDrag);
```

- [ ] **Step 4: Style the drag handle and the dragging state**

In `public/editor/editor.css`, find:

```css
.image-editor-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border: 1px solid var(--border-control);
  border-radius: 8px;
  background: var(--bg-control);
}
```

Replace with:

```css
.image-editor-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border: 1px solid var(--border-control);
  border-radius: 8px;
  background: var(--bg-control);
}

.image-editor-row.dragging {
  opacity: 0.6;
  border-color: var(--accent);
}

.drag-handle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 36px;
  flex-shrink: 0;
  cursor: grab;
  color: var(--text-secondary);
  /* Impostato in modo permanente, non attivato a metà gesto: su touch, senza
     questo, il browser interpreta il trascinamento come uno scroll nativo
     dopo pochi pixel e la maniglia smette di seguire il dito -- stesso bug
     già trovato e risolto sul trascinamento del riquadro in /control. */
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
}

.drag-handle:active {
  cursor: grabbing;
}

.drag-handle .icon {
  width: 16px;
  height: 16px;
  fill: currentColor;
  stroke: none;
}
```

- [ ] **Step 5: Add the server-side reorder handler**

In `server/index.js`, find:

```js
  socket.on('location:setDefault', ({ locationId }) => {
    if (!state.locations.some((l) => l.id === locationId)) return;
    state.locations.forEach((l) => { l.isDefault = l.id === locationId; });
    saveState(state);
    broadcastState();
  });
```

Replace with:

```js
  socket.on('location:setDefault', ({ locationId }) => {
    if (!state.locations.some((l) => l.id === locationId)) return;
    state.locations.forEach((l) => { l.isDefault = l.id === locationId; });
    saveState(state);
    broadcastState();
  });

  socket.on('location:reorder', ({ orderedIds }) => {
    if (!Array.isArray(orderedIds)) return;
    const activeIds = state.locations.filter((l) => !l.archived).map((l) => l.id);
    const activeSet = new Set(activeIds);
    const seen = new Set();
    const validOrder = orderedIds.filter((id) => {
      if (!activeSet.has(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    if (validOrder.length !== activeIds.length) return;
    const byId = new Map(state.locations.map((l) => [l.id, l]));
    const reorderedActive = validOrder.map((id) => byId.get(id));
    const archivedInPlace = state.locations.filter((l) => l.archived);
    state.locations = [...reorderedActive, ...archivedInPlace];
    saveState(state);
    broadcastState();
  });
```

- [ ] **Step 6: Syntax-check**

```bash
node --check server/index.js && node --check public/editor/editor.js
```

Expected: no output, exit code 0.

- [ ] **Step 7: Live verification**

Isolated test server, at least 3 active locations seeded so reordering is unambiguous.

1. **Mouse**: open `/editor`, drag a location row by its grip handle to a new position using real mouse input (`left_click_drag` or an equivalent real-pointer tool action, not synthetic `dispatchEvent` — `setPointerCapture` throws on synthetic pointer events lacking a real active pointer). Confirm the row visually follows and lands in the new slot on drop.
2. **Touch**: with a mobile/touch viewport emulation active, repeat the drag with real touch input. Confirm it behaves identically — no scroll hijack, no stuck drag, row lands in the new slot. Check `getComputedStyle` on the `.drag-handle` mid-drag shows `touch-action: none`.
3. Reload `/editor` (or check via `GET /api/state` against the isolated server) — confirm the new order persisted to `state.locations` and survives a reload.
4. Open `/control` in another tab — confirm its location `<select>` reflects the new order.
5. Confirm archived locations never show a drag handle and are unaffected by reordering the active list.
6. Drop the drag with the pointer released outside any row / with no actual reordering — confirm nothing breaks and (if the order is unchanged) the emitted `orderedIds` is accepted as a no-op.
7. No console errors on `/editor` or `/control`.

- [ ] **Step 8: Commit**

```bash
git add public/editor/index.html public/editor/editor.js public/editor/editor.css server/index.js
git commit -m "Add drag-to-reorder for active locations (mouse and touch)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Permanently delete archived locations

**Files:**
- Modify: `public/editor/editor.js`
- Modify: `server/index.js`

**Interfaces:**
- Consumes: nothing from Tasks 1-2.
- Produces: a new server event `location:delete` (`{ locationId: string }`) — no other task depends on it.

- [ ] **Step 1: Add the arm-then-confirm state and the delete button in the archived row template**

In `public/editor/editor.js`, find:

```js
let locationDragState = null;
```

Add right after it:

```js
let locationDragState = null;

// Stesso pattern arma-poi-conferma di armedLocationArchives, per le
// eliminazioni definitive nella lista archiviate.
const armedLocationDeletes = new Set();
const locationDeleteTimers = new Map();
```

Then find:

```js
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
```

Replace with:

```js
  locationArchivedWrap.hidden = archived.length === 0;
  locationArchivedList.innerHTML = archived
    .map((l) => {
      const armed = armedLocationDeletes.has(l.id);
      return `
        <div class="image-editor-row" data-id="${l.id}">
          <input type="text" class="image-name-input" value="${escapeHtml(l.name)}" data-name-for="${l.id}" placeholder="nome location">
          <button class="icon-btn" data-restore="${l.id}" title="Ripristina location">
            <svg class="icon"><use href="#i-rotate"></use></svg>
          </button>
          <button class="icon-btn image-delete ${armed ? 'confirm' : ''}" data-delete-location="${l.id}"
                  title="${armed ? 'Click di nuovo per confermare' : 'Elimina definitivamente'}">
            <svg class="icon"><use href="#i-trash"></use></svg>
          </button>
        </div>
      `;
    })
    .join('');
```

- [ ] **Step 2: Wire the delete button's click handling**

In `public/editor/editor.js`, find:

```js
locationArchivedList.addEventListener('click', (e) => {
  const restoreBtn = e.target.closest('[data-restore]');
  if (restoreBtn) socket.emit('location:restore', { locationId: restoreBtn.dataset.restore });
});
```

Replace with:

```js
locationArchivedList.addEventListener('click', (e) => {
  const restoreBtn = e.target.closest('[data-restore]');
  if (restoreBtn) {
    socket.emit('location:restore', { locationId: restoreBtn.dataset.restore });
    return;
  }

  const deleteBtn = e.target.closest('[data-delete-location]');
  if (deleteBtn) {
    const locationId = deleteBtn.dataset.deleteLocation;
    if (!armedLocationDeletes.has(locationId)) {
      armedLocationDeletes.add(locationId);
      renderLocationPanel();
      clearTimeout(locationDeleteTimers.get(locationId));
      locationDeleteTimers.set(
        locationId,
        setTimeout(() => {
          armedLocationDeletes.delete(locationId);
          renderLocationPanel();
        }, 2500)
      );
      return;
    }
    clearTimeout(locationDeleteTimers.get(locationId));
    armedLocationDeletes.delete(locationId);
    socket.emit('location:delete', { locationId });
  }
});
```

- [ ] **Step 3: Add the server-side delete handler (archived-only guard)**

In `server/index.js`, find:

```js
  socket.on('location:restore', ({ locationId }) => {
    const location = state.locations.find((l) => l.id === locationId);
    if (!location) return;
    location.archived = false;
    saveState(state);
    broadcastState();
  });
```

Replace with:

```js
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
```

- [ ] **Step 4: Syntax-check**

```bash
node --check server/index.js && node --check public/editor/editor.js
```

Expected: no output, exit code 0.

- [ ] **Step 5: Live verification**

Isolated test server. Seed one location with an uploaded map file and one uploaded image, then archive it.

1. Open `/editor`, confirm the archived location shows both "Ripristina" and a trash/delete button, and confirm **active** locations never show a delete button (only the archive one).
2. Click delete once — button arms (turns red via `.confirm`, title changes to "Click di nuovo per confermare"). Wait 2.5s without clicking again — confirm it disarms back to normal.
3. Click delete, then click again within the window — confirm the location disappears from the archived list, and (via `GET /api/state` on the isolated server, or `data.json` in the temp `DATA_DIR`) confirm it's gone from `state.locations` entirely.
4. Confirm the map/image files that location referenced are still physically present in the temp `storage/maps`/`storage/images` (not deleted), and that `POST /api/storage/orphans/scan` now lists them as orphans.
5. Try emitting `location:delete` for a **non-archived** location's id directly via a socket client (bypassing the UI) — confirm the server refuses (location remains in `state.locations`), proving the archived-only guard actually works server-side and isn't just a UI-level restriction.
6. No console errors on `/editor`.

- [ ] **Step 6: Commit**

```bash
git add public/editor/editor.js server/index.js
git commit -m "Add permanent deletion for archived locations

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Red background on the location-switch confirm button

**Files:**
- Modify: `public/control/control.css`

**Interfaces:**
- Consumes: nothing from Tasks 1-3.
- Produces: nothing downstream depends on.

- [ ] **Step 1: Add the CSS rule**

In `public/control/control.css`, find:

```css
.confirm-row strong {
  color: var(--text-primary);
}
```

Replace with:

```css
.confirm-row strong {
  color: var(--text-primary);
}

#location-confirm-yes {
  background: var(--danger);
  border-color: var(--danger);
  color: #fff;
}
```

- [ ] **Step 2: Syntax-check**

```bash
python3 -c "
s = open('public/control/control.css').read()
print('braces:', s.count('{'), s.count('}'))
"
```

Expected: both counts equal.

- [ ] **Step 3: Live verification**

Isolated test server with at least 2 locations (so switching triggers the soft-confirm row).

1. Open `/control`, switch the location `<select>` to a different location — the confirm row appears. Confirm `#location-confirm-yes` (the "Conferma" button) is red as soon as the row appears, with no click needed to "arm" it — unlike the other confirm buttons in the app, this one has no separate armed/unarmed state.
2. Confirm clicking "Annulla" still cancels correctly and confirm still works (server state actually switches on "Conferma") — this task only changes CSS, but confirm the existing behavior wasn't accidentally broken.
3. No console errors.

- [ ] **Step 4: Commit**

```bash
git add public/control/control.css
git commit -m "Make the location-switch confirm button red, matching the app's other confirm buttons

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
