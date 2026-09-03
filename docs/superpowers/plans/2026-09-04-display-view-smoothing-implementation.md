# Display View Smoothing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ease the map's live pan/zoom transform on `/display` smoothly toward its new value instead of jumping instantly, for zoom-button, pan-arrow, and drag-to-pan changes alike.

**Architecture:** a `requestAnimationFrame` loop in `public/display/display.js` continuously nudges a "displayed" `{scale, offsetX, offsetY}` toward a "target" value (the latest from `state.liveView`) using frame-time-based exponential smoothing, replacing the current direct `mapLayer.style.transform` assignment. Three cases (first render, location change, returning from an image) snap instantly instead of animating.

**Tech Stack:** vanilla JS, `requestAnimationFrame`, no new dependencies.

## Global Constraints

- Client-only change, entirely inside `public/display/display.js`. No server, `/control`, or CSS changes.
- Smoothing time constant: `90` ms (exponential smoothing reaches ~98% of target after ~4 time constants, i.e. ~360ms — matches the agreed ~350ms feel).
- Settle thresholds (below which the loop snaps to the exact target and stops): scale delta `< 0.002`, offset delta `< 0.3` px (both axes).
- Snap instantly (no easing) on: first render ever, active location change, returning to the map after an image was shown. Every other `renderMap()` call (same location, map layer already visible) animates.
- No automated test suite in this project by design. Verification is manual: an isolated test server (temp `DATA_DIR`/`STORAGE_DIR`/`PORT`, never the real `data/`/`storage/`) plus live browser checks (real `/control` + `/display` clients, not synthetic events).
- Known accepted trade-off, not to be "fixed" as part of this task: the grid's line-width-vs-zoom compensation is computed once per `state:update` from the *target* scale, so during a zoom animation grid line thickness is very slightly mismatched for ~350ms. Leave as-is.

---

### Task 1: Smooth the live pan/zoom transform on `/display`

**Files:**
- Modify: `public/display/display.js`

**Interfaces:**
- Consumes: nothing new from elsewhere — reads the existing `state.liveView` (`{scale, offsetX, offsetY}`) and `location.map.scale` exactly as `renderMap()` already does.
- Produces: nothing other tasks depend on. This is the only task in the plan.

- [ ] **Step 1: Add the animation state and helpers**

In `public/display/display.js`, right after the existing `let lastState = null;` (line 18), add:

```js
let previousShowingImage = false;

// Smoothing for the map's live pan/zoom transform: `displayedView` is what's
// actually painted right now, `targetView` is the latest value from
// state.liveView. Each animation frame nudges displayedView a fraction of
// the way toward targetView (frame-time-based, not a fixed per-frame step,
// so it behaves the same regardless of actual frame rate) instead of
// snapping straight to it -- an instant jump on every zoom/pan change is
// disorienting to watch. See
// docs/superpowers/specs/2026-09-04-display-view-smoothing-design.md.
const VIEW_SMOOTH_TIME_CONSTANT_MS = 90;
const VIEW_SMOOTH_SCALE_EPSILON = 0.002;
const VIEW_SMOOTH_OFFSET_EPSILON = 0.3;
let displayedView = null;
let targetView = null;
let viewAnimating = false;
let lastViewAnimFrameTime = 0;
let lastLocationId = null;
let hasRenderedMapOnce = false;

function applyMapTransform(view) {
  mapLayer.style.transform = `translate(${view.offsetX}px, ${view.offsetY}px) scale(${view.scale})`;
}

function stepViewAnimation(now) {
  const dt = now - lastViewAnimFrameTime;
  lastViewAnimFrameTime = now;
  const factor = 1 - Math.exp(-dt / VIEW_SMOOTH_TIME_CONSTANT_MS);

  displayedView.scale += (targetView.scale - displayedView.scale) * factor;
  displayedView.offsetX += (targetView.offsetX - displayedView.offsetX) * factor;
  displayedView.offsetY += (targetView.offsetY - displayedView.offsetY) * factor;

  const settled =
    Math.abs(targetView.scale - displayedView.scale) < VIEW_SMOOTH_SCALE_EPSILON &&
    Math.abs(targetView.offsetX - displayedView.offsetX) < VIEW_SMOOTH_OFFSET_EPSILON &&
    Math.abs(targetView.offsetY - displayedView.offsetY) < VIEW_SMOOTH_OFFSET_EPSILON;

  if (settled) {
    displayedView = { ...targetView };
    applyMapTransform(displayedView);
    viewAnimating = false;
    return;
  }

  applyMapTransform(displayedView);
  requestAnimationFrame(stepViewAnimation);
}

function startViewAnimationIfNeeded() {
  if (viewAnimating) return;
  viewAnimating = true;
  lastViewAnimFrameTime = performance.now();
  requestAnimationFrame(stepViewAnimation);
}
```

This is pure addition — nothing existing is removed in this step. `applyMapTransform`, `stepViewAnimation`, and `startViewAnimationIfNeeded` aren't called from anywhere yet.

- [ ] **Step 2: Wire `render()` to track whether the previous frame was showing an image**

Find the current `render()` function (around line 61):

```js
function render(state) {
  const location = getActiveLocation(state);
  const showingImage = Boolean(state.activeImageId && location && location.images.some((i) => i.id === state.activeImageId));

  mapLayer.style.display = showingImage ? 'none' : 'block';
  imageLayer.style.display = showingImage ? 'block' : 'none';

  if (showingImage) {
    renderImage(location, state.activeImageId);
  } else {
    renderMap(state, location);
  }
}
```

Replace it with:

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

The only changes: `renderMap(state, location)` becomes `renderMap(state, location, previousShowingImage)`, and `previousShowingImage = showingImage;` is set at the end of the function (after the branch, so it always reflects the outcome of this render regardless of which branch ran).

- [ ] **Step 3: Replace the instant transform assignment in `renderMap()` with the snap-or-animate logic**

Find the current `renderMap()` function (around line 101):

```js
function renderMap(state, location) {
  const live = state.liveView || { scale: 1, offsetX: 0, offsetY: 0 };
  const mapScale = (location && location.map.scale) || 1;

  const scale = mapScale * (live.scale || 1);
  const offsetX = live.offsetX || 0;
  const offsetY = live.offsetY || 0;
  mapLayer.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;

  const polygons = (location && location.map.polygons) || [];
```

Replace the function signature and the transform-assignment line (everything else in the function — the `if (location && location.map.file) { ... } else { ... }` block that follows — stays exactly as it is, do not touch it):

```js
function renderMap(state, location, returningFromImage) {
  const live = state.liveView || { scale: 1, offsetX: 0, offsetY: 0 };
  const mapScale = (location && location.map.scale) || 1;

  const scale = mapScale * (live.scale || 1);
  const offsetX = live.offsetX || 0;
  const offsetY = live.offsetY || 0;
  targetView = { scale, offsetX, offsetY };

  const locationId = location ? location.id : null;
  const shouldSnap = !hasRenderedMapOnce || locationId !== lastLocationId || returningFromImage;
  lastLocationId = locationId;
  hasRenderedMapOnce = true;

  if (shouldSnap) {
    displayedView = { ...targetView };
    applyMapTransform(displayedView);
  } else {
    startViewAnimationIfNeeded();
  }

  const polygons = (location && location.map.polygons) || [];
```

`scale` is still used later in this same function (the grid line-width compensation, further down) — that reference is untouched, it keeps reading the local `scale` variable exactly as before.

- [ ] **Step 4: Syntax-check the file**

```bash
node --check public/display/display.js
```

Expected: no output, exit code 0.

- [ ] **Step 5: Live verification with an isolated test server**

Use temporary `DATA_DIR`/`STORAGE_DIR`/`PORT` env vars pointing at throwaway directories (never the project's real `data/`/`storage/`), start the server, and open `/display` and `/control` for a location that has a map (an image map is enough; a video map and a portrait/rotated map are worth spot-checking too if time allows, but not required for every check below). Seed at least one location with a map and, if practical, a grid enabled (to eyeball the accepted line-width wobble described in the spec, not to fix it).

For each check, read `#map-layer`'s inline `transform` (or `getComputedStyle`) across several animation frames rather than relying on eyeballing timing:

1. **Zoom button** (`/control`'s `#zoom-in` or `#zoom-out`): click once, sample the transform's `scale(...)` value every ~50ms for 500ms. Expected: it changes gradually across samples (not a single-frame jump), and has stopped changing (settled at the new value) by ~400ms.
2. **Pan arrow** (`/control`'s directional pad): click once, sample `translate(...)` the same way. Expected: gradual change, settled by ~400ms.
3. **Rapid repeated clicks**: click a zoom button 3-4 times in quick succession (faster than the ~350ms settle time). Expected: no visual snap/restart-from-zero glitch — the displayed value should track smoothly through the intermediate targets and settle on the final one.
4. **Drag-to-pan**: enable pan mode on `/control` and drag the viewport rectangle steadily. Expected: `/display`'s transform updates smoothly track the drag with no visible lag or rubber-banding (compare the rectangle's implied view against `/display`'s actual rendered content, the way earlier drag-to-pan verification in this project already did).
5. **Location switch**: with the view zoomed/panned away from center, switch to a different location on `/control`. Expected: `/display` shows the new location's map already at `scale(1)`/`translate(0px, 0px)` on the very first observed frame after the switch — no animated transition from the old location's transform values.
6. **Image show/hide**: pan/zoom away from center, then show an image from `/control`, then hide it again (`image:hide` / "Torna alla mappa"). Expected: when the map reappears, it's immediately at the correct (still panned/zoomed) transform — no animated fly-in.
7. **Fresh page load**: with the view panned/zoomed away from center, reload `/display`. Expected: the correct transform appears immediately on the first render, no animation from a default/zero state.
8. **No regressions**: fog overlays, grid rendering (if enabled), rotation for a portrait map, and video maps still render correctly; no new console errors on `/display` or `/control` throughout.

- [ ] **Step 6: Commit**

```bash
git add public/display/display.js
git commit -m "Smooth the display's live pan/zoom transform instead of snapping

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
