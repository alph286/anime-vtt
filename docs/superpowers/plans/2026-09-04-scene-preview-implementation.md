# Scene Preview Before Sending to Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** let the DM prepare a location's framing and fog on `/control` before it reaches `/display` — switching location no longer instantly changes what players see; an explicit "Invia al display" action does. Pan/zoom becomes a permanent per-location memory instead of a single value reset on every switch.

**Architecture:** Task 1 moves `liveView` from a single `state.liveView` to `location.map.liveView` across the server and `/display` — the foundation, with no client-visible behavior change for `/control` yet (it isn't touched). Task 2 rewires `/control` to route every map/pan/zoom/fog/grid-opacity interaction through a new `previewLocationId` concept, but keeps it always synced to `state.activeLocationId` (no divergence UI yet) — this is deliberately the largest, riskiest task, isolated so it can be fully verified as behaviorally invisible before Task 3 builds the actual feature on top. Task 3 adds the divergence itself: selecting a location no longer instantly switches it, a banner appears, and two new actions ("Invia al display" / "Annulla anteprima") replace the old instant-confirm row.

## Global Constraints

- No automated test suite in this project by design. Verification is manual: an isolated test server (temp `DATA_DIR`/`STORAGE_DIR`/`PORT`, never the real `data/`/`storage/`) plus live browser checks.
- `location.map.liveView` (`{scale, offsetX, offsetY}`, default `{scale:1, offsetX:0, offsetY:0}`) replaces `state.liveView`, which is removed by migration (same pattern as the existing `tvProfiles` cleanup).
- `view:pan`/`view:zoom`/`view:reset`/`fow:toggle` all gain a `locationId` parameter and operate on that location specifically, mirroring the pattern already used by `grid:update`/`fow:setAll`/`polygon:*`. They now call `saveState(state)` (previously `view:pan`/`view:zoom`/`view:reset` only broadcast, never persisted — moving to a per-location persisted field makes that inconsistent with every other per-location mutation in this codebase).
- `location:set`/`location:create`/`applyStartupDefault` no longer reset any `liveView` — a location's framing is never automatically reset by anything except the existing "reset vista" (⟳) button.
- Images stay live-only and instant, unaffected by preview/staging — out of scope for this feature.
- Fog-of-war and grid-opacity controls operate on the *previewed* location (safe: `/display` only ever renders the active location's fog/grid, so adjusting a merely-previewed location's fog or grid opacity is invisible to players until that location goes live) — this naturally extends the same reasoning the design spec applied to fog to grid-opacity too, since both are server-authoritative, per-location, active-location-only-visible settings.

---

### Task 1: Per-location `liveView` — server and `/display`

**Files:**
- Modify: `server/state.js`
- Modify: `server/index.js`
- Modify: `public/display/display.js`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `location.map.liveView` (persisted field); server events `view:pan`/`view:zoom`/`view:reset` now take `{ locationId, ... }`; `fow:toggle` now takes `{ locationId, polygonId }`. Tasks 2-3 (which touch `/control`, not built yet) will emit these in the new shape — `/control` itself is unmodified by this task and will be temporarily broken until Task 2 lands (still emitting the old argument-less/global shape). This is expected and is why Task 2 must follow immediately, not be deferred.

- [ ] **Step 1: Move `liveView` into the schema, default, and migration**

In `server/state.js`, find:

```js
const DEFAULT_STATE = {
  campaign: { name: 'Anime Salve' },
  gridPreset: { cellSize: 100, offsetX: 0, offsetY: 0, color: '#ffffff', lineWidth: 0.3, opacity: 1 },
  locations: [
    {
      id: 'taverna',
      name: 'Taverna',
      map: {
        file: null,
        type: 'image',
        scale: 1,
        flip180: false,
        rotate90: false,
        grid: { ...DEFAULT_GRID },
        polygons: [
          { id: 'stanza-1', name: 'Stanza 1', points: [[5, 10], [40, 8], [42, 45], [8, 48]], revealed: false },
          { id: 'corridoio', name: 'Corridoio', points: [[55, 50], [92, 45], [94, 88], [58, 92]], revealed: false }
        ]
      },
      images: [],
      archived: false,
      isDefault: true
    }
  ],
  activeLocationId: 'taverna',
  activeImageId: null,
  liveView: { scale: 1, offsetX: 0, offsetY: 0 }
};
```

Replace with:

```js
const DEFAULT_STATE = {
  campaign: { name: 'Anime Salve' },
  gridPreset: { cellSize: 100, offsetX: 0, offsetY: 0, color: '#ffffff', lineWidth: 0.3, opacity: 1 },
  locations: [
    {
      id: 'taverna',
      name: 'Taverna',
      map: {
        file: null,
        type: 'image',
        scale: 1,
        flip180: false,
        rotate90: false,
        liveView: { scale: 1, offsetX: 0, offsetY: 0 },
        grid: { ...DEFAULT_GRID },
        polygons: [
          { id: 'stanza-1', name: 'Stanza 1', points: [[5, 10], [40, 8], [42, 45], [8, 48]], revealed: false },
          { id: 'corridoio', name: 'Corridoio', points: [[55, 50], [92, 45], [94, 88], [58, 92]], revealed: false }
        ]
      },
      images: [],
      archived: false,
      isDefault: true
    }
  ],
  activeLocationId: 'taverna',
  activeImageId: null
};
```

Find:

```js
function migrate(state) {
  delete state.tvProfiles;
  delete state.activeTvProfileId;
```

Replace with:

```js
function migrate(state) {
  delete state.tvProfiles;
  delete state.activeTvProfileId;
  delete state.liveView;
```

Find:

```js
    if (location.map.rotate90 === undefined) location.map.rotate90 = false;
    if (!location.map.grid) location.map.grid = { ...DEFAULT_GRID };
```

Replace with:

```js
    if (location.map.rotate90 === undefined) location.map.rotate90 = false;
    if (!location.map.liveView) location.map.liveView = { scale: 1, offsetX: 0, offsetY: 0 };
    if (!location.map.grid) location.map.grid = { ...DEFAULT_GRID };
```

Find:

```js
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

Replace with:

```js
function applyStartupDefault(state) {
  const nonArchived = (state.locations || []).filter((l) => !l.archived);
  const preferred = nonArchived.find((l) => l.isDefault);
  const chosen = preferred || nonArchived[0] || null;
  state.activeLocationId = chosen ? chosen.id : null;
  state.activeImageId = null;
  return state;
}
```

- [ ] **Step 2: Make `view:pan`/`view:zoom`/`view:reset` location-scoped, and `location:set`/`location:create` stop resetting them**

In `server/index.js`, find:

```js
  socket.on('view:pan', ({ dx, dy }) => {
    state.liveView.offsetX += dx;
    state.liveView.offsetY += dy;
    broadcastState();
  });

  socket.on('view:zoom', ({ scale }) => {
    state.liveView.scale = scale;
    broadcastState();
  });

  socket.on('view:reset', () => {
    state.liveView = { scale: 1, offsetX: 0, offsetY: 0 };
    broadcastState();
  });
```

Replace with:

```js
  socket.on('view:pan', ({ locationId, dx, dy }) => {
    const location = state.locations.find((l) => l.id === locationId);
    if (!location) return;
    location.map.liveView.offsetX += dx;
    location.map.liveView.offsetY += dy;
    saveState(state);
    broadcastState();
  });

  socket.on('view:zoom', ({ locationId, scale }) => {
    const location = state.locations.find((l) => l.id === locationId);
    if (!location) return;
    location.map.liveView.scale = scale;
    saveState(state);
    broadcastState();
  });

  socket.on('view:reset', ({ locationId }) => {
    const location = state.locations.find((l) => l.id === locationId);
    if (!location) return;
    location.map.liveView = { scale: 1, offsetX: 0, offsetY: 0 };
    saveState(state);
    broadcastState();
  });
```

Find:

```js
  socket.on('location:set', ({ locationId }) => {
    if (!state.locations.some((l) => l.id === locationId)) return;
    state.activeLocationId = locationId;
    state.activeImageId = null;
    state.liveView = { scale: 1, offsetX: 0, offsetY: 0 };
    saveState(state);
    broadcastState();
  });
```

Replace with:

```js
  socket.on('location:set', ({ locationId }) => {
    if (!state.locations.some((l) => l.id === locationId)) return;
    state.activeLocationId = locationId;
    state.activeImageId = null;
    saveState(state);
    broadcastState();
  });
```

Find:

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
```

Replace with:

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
```

- [ ] **Step 3: Make `fow:toggle` location-scoped**

In `server/index.js`, find:

```js
  socket.on('fow:toggle', ({ polygonId }) => {
    const location = getActiveLocation();
    const polygon = location?.map.polygons.find((p) => p.id === polygonId);
    if (!polygon) return;
    polygon.revealed = !polygon.revealed;
    saveState(state);
    broadcastState();
  });
```

Replace with:

```js
  socket.on('fow:toggle', ({ locationId, polygonId }) => {
    const location = state.locations.find((l) => l.id === locationId);
    const polygon = location?.map.polygons.find((p) => p.id === polygonId);
    if (!polygon) return;
    polygon.revealed = !polygon.revealed;
    saveState(state);
    broadcastState();
  });
```

- [ ] **Step 4: `/display` reads the active location's own `liveView`**

In `public/display/display.js`, find:

```js
function renderMap(state, location, returningFromImage) {
  const live = state.liveView || { scale: 1, offsetX: 0, offsetY: 0 };
```

Replace with:

```js
function renderMap(state, location, returningFromImage) {
  const live = (location && location.map.liveView) || { scale: 1, offsetX: 0, offsetY: 0 };
```

- [ ] **Step 5: Syntax-check**

```bash
node --check server/index.js && node --check server/state.js && node --check public/display/display.js
```

Expected: no output, exit code 0.

- [ ] **Step 6: Live verification**

Isolated test server, at least 2 locations with maps.

1. Confirm `GET /api/state` shows each location's `map.liveView` (default `{scale:1,offsetX:0,offsetY:0}` for a fresh/legacy location), and no top-level `liveView` key on the root state object.
2. Emit `view:pan`/`view:zoom` directly (raw socket client, bypassing `/control`, since it isn't updated yet) with a `locationId` for the active location — confirm that location's `map.liveView` updates, is saved to `data/state.json`, and `/display` (open in a browser tab) reflects the change live.
3. Emit the same events with a `locationId` for a **different**, non-active location — confirm that location's `map.liveView` updates in state, but `/display` (still showing the active one) shows no change at all.
4. Emit `view:reset` with a `locationId` — confirm only that location's `liveView` resets to default.
5. Switch the active location (`location:set`) — confirm the newly active location's `/display` view uses *that* location's own already-persisted `liveView`, not a reset default.
6. Restart the isolated server — confirm `map.liveView` values survive (loaded from the saved `data/state.json`, `applyStartupDefault` no longer resets them).
7. Emit `fow:toggle` with an explicit `locationId` for a non-active location — confirm that location's polygon `revealed` state changes in server state, with zero visible effect on `/display` (still showing the active location).
8. Confirm a genuinely legacy `data/state.json` (top-level `liveView` present, no location has `map.liveView`) migrates cleanly: top-level `liveView` is gone, every location gets a default `map.liveView`.
9. No console errors on `/display`. (`/control` is expected to be broken/non-functional at this point — do not test it, Task 2 fixes it.)

- [ ] **Step 7: Commit**

```bash
git add server/state.js server/index.js public/display/display.js
git commit -m "Move liveView from a global singleton to per-location, persisted

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `/control` — route map/pan/zoom/fog/grid-opacity through a previewed location

**Files:**
- Modify: `public/control/control.js`

**Interfaces:**
- Consumes: `location.map.liveView`, `view:pan`/`view:zoom`/`view:reset`'s `locationId` parameter, `fow:toggle`'s `locationId` parameter — all from Task 1.
- Produces: `previewLocationId` (module-level variable) and `getPreviewLocation()` — Task 3 changes how `previewLocationId` gets set (this task keeps it always synced to `state.activeLocationId`; Task 3 makes it diverge) and consumes `getPreviewLocation()` as-is.

**No user-visible behavior changes in this task** — `previewLocationId` always equals `state.activeLocationId`, so every control described below behaves exactly as it did before this task, just internally reading/writing a per-location field through the new indirection instead of the old global one.

- [ ] **Step 1: Add `previewLocationId` and `getPreviewLocation()`**

In `public/control/control.js`, find:

```js
function getActiveLocation() {
  return state.locations.find((l) => l.id === state.activeLocationId);
}
```

Replace with:

```js
let previewLocationId = null;

function getActiveLocation() {
  return state.locations.find((l) => l.id === state.activeLocationId);
}

function getPreviewLocation() {
  return state.locations.find((l) => l.id === previewLocationId);
}
```

- [ ] **Step 2: Sync `previewLocationId` in `render()` and route the map/fog/zoom/grid-opacity UI through it**

In `public/control/control.js`, find:

```js
function render() {
  const location = getActiveLocation();
  const showingImage = Boolean(state.activeImageId);
```

Replace with:

```js
function render() {
  previewLocationId = state.activeLocationId;
  const location = getActiveLocation();
  const previewLocation = getPreviewLocation();
  const showingImage = Boolean(state.activeImageId);
```

Find:

```js
  renderMapPreview(location);

  fowList.innerHTML = ((location && location.map.polygons) || [])
```

Replace with:

```js
  renderMapPreview(previewLocation);

  fowList.innerHTML = ((previewLocation && previewLocation.map.polygons) || [])
```

Find:

```js
  zoomLevel.textContent = `${Math.round((state.liveView.scale || 1) * 100)}%`;
  panZoomSection.style.display = showingImage ? 'none' : 'block';

  const gridEnabled = Boolean(location && location.map.grid && location.map.grid.enabled) && !showingImage;
  gridOpacitySection.style.display = gridEnabled ? 'block' : 'none';
  if (gridEnabled) {
    gridOpacityLevel.textContent = `${Math.round((location.map.grid.opacity === undefined ? 1 : location.map.grid.opacity) * 100)}%`;
  }
  updateViewportRect(location);
}
```

Replace with:

```js
  zoomLevel.textContent = `${Math.round(((previewLocation && previewLocation.map.liveView.scale) || 1) * 100)}%`;
  panZoomSection.style.display = showingImage ? 'none' : 'block';

  const gridEnabled = Boolean(previewLocation && previewLocation.map.grid && previewLocation.map.grid.enabled) && !showingImage;
  gridOpacitySection.style.display = gridEnabled ? 'block' : 'none';
  if (gridEnabled) {
    gridOpacityLevel.textContent = `${Math.round((previewLocation.map.grid.opacity === undefined ? 1 : previewLocation.map.grid.opacity) * 100)}%`;
  }
  updateViewportRect(previewLocation);
}
```

(The `location`/`showingImage`-based `showingBanner` and `imagesList` code above this block, and the `locationSelect.innerHTML` build, are untouched — they stay keyed on the active location, per the plan's images-stay-live-only constraint.)

- [ ] **Step 3: Route the resize handler through the previewed location**

In `public/control/control.js`, find:

```js
window.addEventListener('resize', () => {
  if (!state) return;
  const location = getActiveLocation();
  renderMapPreview(location);
  updateViewportRect(location);
});
```

Replace with:

```js
window.addEventListener('resize', () => {
  if (!state) return;
  const previewLocation = getPreviewLocation();
  renderMapPreview(previewLocation);
  updateViewportRect(previewLocation);
});
```

- [ ] **Step 4: Fog toggle events carry the previewed location's id**

In `public/control/control.js`, find:

```js
mapFogLayer.addEventListener('click', (e) => {
  if (panModeActive) return;
  const overlay = e.target.closest('.fog-overlay');
  if (overlay) socket.emit('fow:toggle', { polygonId: overlay.dataset.id });
});
```

Replace with:

```js
mapFogLayer.addEventListener('click', (e) => {
  if (panModeActive) return;
  const overlay = e.target.closest('.fog-overlay');
  if (overlay) socket.emit('fow:toggle', { locationId: previewLocationId, polygonId: overlay.dataset.id });
});
```

Find:

```js
fowList.addEventListener('click', (e) => {
  const btn = e.target.closest('.fow-row');
  if (btn) socket.emit('fow:toggle', { polygonId: btn.dataset.id });
});
```

Replace with:

```js
fowList.addEventListener('click', (e) => {
  const btn = e.target.closest('.fow-row');
  if (btn) socket.emit('fow:toggle', { locationId: previewLocationId, polygonId: btn.dataset.id });
});
```

- [ ] **Step 5: Pan arrows, zoom stepper, grid-opacity stepper, and reset target the previewed location**

In `public/control/control.js`, find:

```js
document.querySelectorAll('[data-pan]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const [dx, dy] = btn.dataset.pan.split(',').map(Number);
    const scale = (state && state.liveView && state.liveView.scale) || 1;
    const step = 20 / Math.max(scale, 0.01);
    socket.emit('view:pan', { dx: dx * step, dy: dy * step });
  });
});

function stepZoom(delta) {
  const current = (state && state.liveView && state.liveView.scale) || 1;
  const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((current + delta) * 10) / 10));
  socket.emit('view:zoom', { scale: next });
}
zoomOutBtn.addEventListener('click', () => stepZoom(-ZOOM_STEP));
zoomInBtn.addEventListener('click', () => stepZoom(ZOOM_STEP));

function stepGridOpacity(delta) {
  const location = getActiveLocation();
  if (!location || !location.map.grid) return;
  const current = location.map.grid.opacity === undefined ? 1 : location.map.grid.opacity;
  const next = Math.min(1, Math.max(0, Math.round((current + delta) * 10) / 10));
  socket.emit('grid:update', { locationId: state.activeLocationId, opacity: next });
}
gridOpacityOutBtn.addEventListener('click', () => stepGridOpacity(-GRID_OPACITY_STEP));
gridOpacityInBtn.addEventListener('click', () => stepGridOpacity(GRID_OPACITY_STEP));

document.getElementById('view-reset').addEventListener('click', () => socket.emit('view:reset'));

fowHideAllBtn.addEventListener('click', () => {
  if (!state.activeLocationId) return;
  socket.emit('fow:setAll', { locationId: state.activeLocationId, revealed: false });
});
```

Replace with:

```js
document.querySelectorAll('[data-pan]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const [dx, dy] = btn.dataset.pan.split(',').map(Number);
    const previewLocation = getPreviewLocation();
    const scale = (previewLocation && previewLocation.map.liveView.scale) || 1;
    const step = 20 / Math.max(scale, 0.01);
    socket.emit('view:pan', { locationId: previewLocationId, dx: dx * step, dy: dy * step });
  });
});

function stepZoom(delta) {
  const previewLocation = getPreviewLocation();
  const current = (previewLocation && previewLocation.map.liveView.scale) || 1;
  const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((current + delta) * 10) / 10));
  socket.emit('view:zoom', { locationId: previewLocationId, scale: next });
}
zoomOutBtn.addEventListener('click', () => stepZoom(-ZOOM_STEP));
zoomInBtn.addEventListener('click', () => stepZoom(ZOOM_STEP));

function stepGridOpacity(delta) {
  const location = getPreviewLocation();
  if (!location || !location.map.grid) return;
  const current = location.map.grid.opacity === undefined ? 1 : location.map.grid.opacity;
  const next = Math.min(1, Math.max(0, Math.round((current + delta) * 10) / 10));
  socket.emit('grid:update', { locationId: previewLocationId, opacity: next });
}
gridOpacityOutBtn.addEventListener('click', () => stepGridOpacity(-GRID_OPACITY_STEP));
gridOpacityInBtn.addEventListener('click', () => stepGridOpacity(GRID_OPACITY_STEP));

document.getElementById('view-reset').addEventListener('click', () => socket.emit('view:reset', { locationId: previewLocationId }));

fowHideAllBtn.addEventListener('click', () => {
  if (!previewLocationId) return;
  socket.emit('fow:setAll', { locationId: previewLocationId, revealed: false });
});
```

- [ ] **Step 6: Reveal-all targets the previewed location**

In `public/control/control.js`, find:

```js
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

Replace with:

```js
fowRevealAllBtn.addEventListener('click', () => {
  if (!previewLocationId) return;
  if (!revealAllArmed) {
    revealAllArmed = true;
    fowRevealAllBtn.classList.add('confirm');
    fowRevealAllBtn.textContent = 'Click di nuovo per confermare';
    clearTimeout(revealAllArmTimeout);
    revealAllArmTimeout = setTimeout(resetRevealAllArm, 2500);
    return;
  }
  resetRevealAllArm();
  socket.emit('fow:setAll', { locationId: previewLocationId, revealed: true });
});
```

- [ ] **Step 7: `updateViewportRect` and the drag-to-pan handler read `liveView` from the location they're passed / the previewed location**

In `public/control/control.js`, find:

```js
  const mapScale = location.map.scale || 1;
  const live = state.liveView || { scale: 1, offsetX: 0, offsetY: 0 };
  const S = mapScale * (live.scale || 1);
```

Replace with:

```js
  const mapScale = location.map.scale || 1;
  const live = location.map.liveView || { scale: 1, offsetX: 0, offsetY: 0 };
  const S = mapScale * (live.scale || 1);
```

(This is inside `updateViewportRect(location)` — the function already receives whatever location its caller passes; Step 2 already changed every caller to pass `previewLocation`, so no further change is needed here beyond reading `location.map.liveView` instead of the removed `state.liveView`.)

Find:

```js
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
  const rotation = computeTotalRotation(nw, nh, location.map.flip180, location.map.rotate90);
  const swapped = rotation === 90 || rotation === 270;
  const tvEffectiveW = swapped ? state.displayViewport.height : state.displayViewport.width;
  const tvEffectiveH = swapped ? state.displayViewport.width : state.displayViewport.height;
  const tvFit = fitRect(tvEffectiveW, tvEffectiveH, nw, nh);

  const mapScale = location.map.scale || 1;
  const S = mapScale * ((state.liveView && state.liveView.scale) || 1);
```

Replace with:

```js
mapPreview.addEventListener('pointermove', (e) => {
  if (!panDrag) return;
  const dxLocal = e.clientX - panDrag.lastX;
  const dyLocal = e.clientY - panDrag.lastY;
  panDrag.lastX = e.clientX;
  panDrag.lastY = e.clientY;

  const location = getPreviewLocation();
  if (!location || !state.displayViewport || !currentImageRect) return;

  const nw = mediaW(activeMapEl);
  const nh = mediaH(activeMapEl);
  const rotation = computeTotalRotation(nw, nh, location.map.flip180, location.map.rotate90);
  const swapped = rotation === 90 || rotation === 270;
  const tvEffectiveW = swapped ? state.displayViewport.height : state.displayViewport.width;
  const tvEffectiveH = swapped ? state.displayViewport.width : state.displayViewport.height;
  const tvFit = fitRect(tvEffectiveW, tvEffectiveH, nw, nh);

  const mapScale = location.map.scale || 1;
  const S = mapScale * ((location.map.liveView && location.map.liveView.scale) || 1);
```

Find (the end of the same `pointermove` handler, unchanged math, just the final emit):

```js
  socket.emit('view:pan', { dx: -S * rx, dy: -S * ry });
});
```

Replace with:

```js
  socket.emit('view:pan', { locationId: previewLocationId, dx: -S * rx, dy: -S * ry });
});
```

- [ ] **Step 8: Syntax-check**

```bash
node --check public/control/control.js
```

Expected: no output, exit code 0.

- [ ] **Step 9: Live verification**

Isolated test server, at least 2 locations with maps and grid enabled on one.

Since `previewLocationId` always equals `state.activeLocationId` in this task, every one of these must behave *exactly* as it did before Task 1/2 (byte-for-byte the same user-facing result), just now backed by the new per-location, persisted mechanism:

1. Zoom +/-, pan arrows, drag-to-pan, "reset vista": all still work, update the active location's `map.liveView`, reflected live on `/display`.
2. Grid opacity +/-: still works, still hidden when grid is disabled, still only shown when not showing an image.
3. Fog: single-zone toggle, "nascondi tutto", "rivela tutto" (with its arm-then-confirm) all still work.
4. Switch location via the (still old, unmodified) confirm-row flow: `/display` still switches instantly (Task 2 doesn't change this UI), and now shows the newly-active location's *own* persisted `liveView` (which, since Task 1's tests already exercised distinct per-location values, should visibly differ from the previous location's framing — confirm this is the case, not a reset to default).
5. Confirm switching back to a previously-visited location restores its own last framing.
6. No console errors on `/control` or `/display` throughout.

- [ ] **Step 10: Commit**

```bash
git add public/control/control.js
git commit -m "Route control.js's map/pan/zoom/fog controls through a previewed-location concept

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Preview divergence — banner, send/cancel, hide images while previewing

**Files:**
- Modify: `public/control/index.html`
- Modify: `public/control/control.js`
- Modify: `public/control/control.css`

**Interfaces:**
- Consumes: `previewLocationId`/`getPreviewLocation()` from Task 2.
- Produces: nothing further downstream.

- [ ] **Step 1: Replace the old instant-confirm row with the preview banner, and give the images section an id**

In `public/control/index.html`, find:

```html
    <div id="location-confirm-row" class="confirm-row" hidden>
      <span>Passare a "<strong id="location-confirm-name"></strong>"?</span>
      <button id="location-confirm-yes">Conferma</button>
      <button id="location-confirm-no">Annulla</button>
    </div>
```

Replace with:

```html
    <div id="preview-banner" class="confirm-row" hidden>
      <span>Anteprima: <strong id="preview-banner-name"></strong> — non visibile ai giocatori</span>
      <button id="preview-send">Invia al display</button>
      <button id="preview-cancel">Annulla anteprima</button>
    </div>
```

Find:

```html
    <section>
      <h2>Immagini</h2>
      <div id="images-list" class="thumb-row"></div>
      <button id="back-to-map" class="primary">Torna alla mappa</button>
    </section>
```

Replace with:

```html
    <section id="images-section">
      <h2>Immagini</h2>
      <div id="images-list" class="thumb-row"></div>
      <button id="back-to-map" class="primary">Torna alla mappa</button>
    </section>
```

- [ ] **Step 2: Style the "Invia al display" button and drop the now-dead old confirm-button rule**

In `public/control/control.css`, find:

```css
#location-confirm-yes {
  background: var(--danger);
  border-color: var(--danger);
  color: #fff;
}
```

Replace with:

```css
#preview-send {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
}
```

- [ ] **Step 3: Replace the DOM references and the old select/confirm handlers**

In `public/control/control.js`, find:

```js
const locationSelect = document.getElementById('location-select');
const locationConfirmRow = document.getElementById('location-confirm-row');
const locationConfirmName = document.getElementById('location-confirm-name');
const locationConfirmYes = document.getElementById('location-confirm-yes');
const locationConfirmNo = document.getElementById('location-confirm-no');
let pendingLocationId = null;
let locationConfirmTimeout = null;
```

Replace with:

```js
const locationSelect = document.getElementById('location-select');
const previewBanner = document.getElementById('preview-banner');
const previewBannerName = document.getElementById('preview-banner-name');
const previewSendBtn = document.getElementById('preview-send');
const previewCancelBtn = document.getElementById('preview-cancel');
const imagesSection = document.getElementById('images-section');
```

Find:

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

Replace with:

```js
locationSelect.addEventListener('change', () => {
  const targetId = locationSelect.value;
  if (!targetId || !state.locations.some((l) => l.id === targetId)) {
    locationSelect.value = previewLocationId || '';
    return;
  }
  previewLocationId = targetId;
  render();
});

previewSendBtn.addEventListener('click', () => {
  if (!previewLocationId) return;
  socket.emit('location:set', { locationId: previewLocationId });
});

previewCancelBtn.addEventListener('click', () => {
  previewLocationId = state.activeLocationId;
  render();
});
```

- [ ] **Step 4: Stop `render()` from force-syncing `previewLocationId`, and drive the banner + images-section visibility**

In `public/control/control.js`, find:

```js
function render() {
  previewLocationId = state.activeLocationId;
  const location = getActiveLocation();
  const previewLocation = getPreviewLocation();
  const showingImage = Boolean(state.activeImageId);
```

Replace with:

```js
function render() {
  if (!previewLocationId || !state.locations.some((l) => l.id === previewLocationId)) {
    previewLocationId = state.activeLocationId;
  }
  const location = getActiveLocation();
  const previewLocation = getPreviewLocation();
  const showingImage = Boolean(state.activeImageId);
  const isPreviewing = previewLocationId !== state.activeLocationId;

  previewBanner.hidden = !isPreviewing;
  if (isPreviewing && previewLocation) {
    previewBannerName.textContent = previewLocation.name;
  }
  imagesSection.style.display = isPreviewing ? 'none' : 'block';
```

Find:

```js
  locationSelect.innerHTML =
    (state.activeLocationId ? '' : '<option value="" selected disabled hidden>— nessuna location —</option>') +
    state.locations
      .filter((l) => !l.archived)
      .map((l) => `<option value="${l.id}" ${l.id === state.activeLocationId ? 'selected' : ''}>${escapeHtml(l.name)}</option>`)
      .join('');
```

Replace with:

```js
  locationSelect.innerHTML =
    (previewLocationId ? '' : '<option value="" selected disabled hidden>— nessuna location —</option>') +
    state.locations
      .filter((l) => !l.archived)
      .map((l) => `<option value="${l.id}" ${l.id === previewLocationId ? 'selected' : ''}>${escapeHtml(l.name)}</option>`)
      .join('');
```

(The `location`-keyed `showingBanner` block right above this, and the `location`-keyed `imagesList.innerHTML` build below it, are untouched — `imagesSection`'s new `style.display` toggle wraps that existing content instead of replacing it.)

- [ ] **Step 5: Syntax-check**

```bash
node --check public/control/control.js
```

Expected: no output, exit code 0.

- [ ] **Step 6: Live verification**

Isolated test server, at least 3 locations with maps, one with a grid enabled, at least one image on one location.

1. Select a **different** location from the dropdown — confirm `/control`'s own map preview, zoom level, and fog list switch to that location immediately, while `/display` (open in another tab) shows no change at all.
2. Confirm the preview banner appears, reading "Anteprima: **[nome]** — non visibile ai giocatori", and the images section is hidden.
3. Pan/zoom/toggle fog/adjust grid opacity while previewing — confirm all apply to the previewed location's own state (check via `GET /api/state`) and `/display` still shows zero change.
4. Click "Invia al display" — confirm `/display` switches to the previewed location in one step, already at the prepared pan/zoom/fog, never showing an intermediate full/reset view. Confirm the banner disappears and the images section reappears (now for the newly-active location).
5. Repeat, but click "Annulla anteprima" instead — confirm `/control` reverts to showing the still-active (original) location, the banner disappears, and — reselecting the location you'd been previewing — confirm its prepared framing/fog are still there, unchanged, ready to resume.
6. Select a location, then select a *different* one again before confirming — confirm the preview simply retargets to the newest selection, no error, no confirmation dialog.
7. With nothing being previewed (fresh load), confirm the banner stays hidden and behavior is identical to before this task.
8. No console errors on `/control` or `/display` throughout.

- [ ] **Step 7: Commit**

```bash
git add public/control/index.html public/control/control.js public/control/control.css
git commit -m "Add scene preview: stage a location's framing/fog before sending to display

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
