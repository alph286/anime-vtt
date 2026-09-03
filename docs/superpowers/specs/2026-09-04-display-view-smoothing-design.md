# Display View Smoothing — Design

**Goal:** when the live pan/zoom of the map on `/display` changes (zoom +/-, pan arrows, or dragging the viewport rectangle on `/control`), the on-screen view eases smoothly to the new position/scale instead of jumping instantly — the current instant cut is disorienting for players watching the TV.

**Architecture:** replace the direct, synchronous `mapLayer.style.transform = ...` assignment in `renderMap()` with a small `requestAnimationFrame` loop that continuously eases a "displayed" transform toward the latest "target" transform. This is a client-only change, entirely inside `public/display/display.js` — no server or `/control` changes.

## Problem

`renderMap()` in `public/display/display.js` currently does:

```js
mapLayer.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
```

on every `state:update`. Since `offsetX`/`offsetY`/`scale` come straight from `state.liveView` (updated instantly server-side on `view:pan`/`view:zoom`/`view:reset`), every zoom button press or arrow click causes the map to jump to its new size/position in a single frame. This is uncomfortable to watch, especially for zoom changes.

## Why not a plain CSS `transition: transform`

The obvious simplest fix — adding `transition: transform 350ms ease-out` to `#map-layer` — was considered and rejected. Dragging the viewport rectangle on `/control` emits `view:pan` on every `pointermove`, so `state:update` (and therefore a new `transform` target) arrives many times per second while dragging. A CSS transition retargeted that often never catches up to its target: each new value restarts the transition from the current (still-animating) position, so the displayed view perpetually lags a fixed transition-duration behind the finger — visibly rubbery, not smooth. Since drag-to-pan is explicitly in scope for this smoothing (not just discrete zoom/arrow steps), the fix needs to handle a continuously-moving target as well as discrete jumps, without that lag.

## Mechanism

A `requestAnimationFrame` loop maintains two values, each `{ scale, offsetX, offsetY }`:

- **`targetView`** — set every time `renderMap()` runs, from `state.liveView` combined with the location's own `map.scale` (same computation as today).
- **`displayedView`** — what's actually applied to `mapLayer.style.transform` right now.

Each animation frame, `displayedView` moves a fraction of the remaining distance to `targetView`, using frame-time-based exponential smoothing (not a fixed per-frame step, so it behaves the same regardless of the display's actual frame rate):

```js
const factor = 1 - Math.exp(-deltaMs / TIME_CONSTANT_MS);
displayedView.scale   += (targetView.scale   - displayedView.scale)   * factor;
displayedView.offsetX += (targetView.offsetX - displayedView.offsetX) * factor;
displayedView.offsetY += (targetView.offsetY - displayedView.offsetY) * factor;
```

`TIME_CONSTANT_MS = 90`. Exponential smoothing reaches ~98% of the way to a new target after about 4 time constants, so a discrete jump (e.g. one zoom-button click) is visually settled in ~360ms — matching the agreed ~350ms feel. When `displayedView` is close enough to `targetView` — `Math.abs(scale diff) < 0.002` and `Math.abs(offset diff) < 0.3` (px) on both axes — the loop sets `displayedView = targetView` exactly and stops running: no perpetual sub-pixel drift, and no idle CPU use between changes.

Because `targetView` is just "the latest value," this same loop handles both cases without special-casing:
- **Discrete jump** (zoom button, pan arrow): target changes once, loop eases toward it and stops.
- **Continuous drag**: target changes on every `pointermove`-driven `state:update`; the loop keeps chasing a moving point, staying close throughout instead of accumulating lag, and settles normally once dragging stops.

## When to snap instead of animate

Three cases replace `displayedView` with `targetView` immediately (no easing), by design:

1. **First render ever** (page load) — nothing to animate from.
2. **Active location changes** — a different map entirely; the server already resets `liveView` to `{scale:1, offsetX:0, offsetY:0}` on location switch, and animating a transform change across two unrelated maps would look meaningless.
3. **Returning to the map after an image was shown** — while an image is displayed, `renderMap()` isn't called at all (`render()` skips straight to `renderImage()`), so `displayedView` goes stale; when the map reappears it must show the correct position immediately, not animate in from wherever it was before the image.

These are detected by comparing the current location id and the current `showingImage` flag against their previous values across renders.

## Known accepted trade-off (not fixed by this change)

The grid overlay compensates its line stroke width for the current zoom (`lineWidth / scale`, in `renderMap()`'s `loadMapMedia` callback) so grid lines look the same thickness on screen at any zoom level. That compensation is computed once per `state:update`, using the *target* scale — while `displayedView.scale` is still easing toward it, the grid's line width will be very slightly mismatched for the ~350ms of the animation (correct only at the start and end of a zoom change), a subtle stroke-width "breathe" on locations with an enabled grid. Fixing this properly (e.g. switching the grid lines to SVG `vector-effect: non-scaling-stroke`, or recomputing grid line width every animation frame) is out of scope here — flagged so it isn't mistaken for a bug, revisit only if it turns out to be noticeable/bothersome in practice.

## Testing

No automated test suite in this project (by design — see `CLAUDE.md`/project conventions). Verification is manual, via an isolated test server (temp `DATA_DIR`/`STORAGE_DIR`/`PORT`, real browser):

- Zoom +/- click on `/control` → `/display` eases the scale change smoothly over ~350ms instead of snapping.
- Pan arrow click → same, for position.
- Dragging the viewport rectangle on `/control` → `/display` pans smoothly, tracking the drag without visible lag or rubber-banding.
- Rapid repeated zoom/arrow clicks → each new target is picked up smoothly mid-animation, no stutter or restart-from-zero glitch.
- Switching location → `/display` snaps instantly to the new map at its default (centered, 100%) view, no animated transition between the two maps.
- Showing an image, then returning to the map (`image:hide`) → map reappears at the correct position instantly, no animated fly-in from a stale position.
- Fresh `/display` page load → shows the correct initial position immediately, no animation from an arbitrary starting state.
- No new console errors; existing behavior (fog overlays, grid rendering, rotation for portrait maps, video maps) unaffected.
