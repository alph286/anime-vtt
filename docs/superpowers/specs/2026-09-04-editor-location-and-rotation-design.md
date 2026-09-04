# Editor: Location Reordering, Permanent Deletion, Manual Rotation — Design

**Goal:** three independent editor improvements — drag-to-reorder active locations (mouse and touch), permanently deleting archived locations, and a manual +90° map rotation on top of the existing auto-rotation/180°-flip — plus a small consistency fix (the location-switch confirm button on `/control` never got the app's standard red "confirm" styling).

**Architecture:** all four pieces are additive and follow patterns already established elsewhere in the app (arm-then-confirm for destructive actions, a boolean flag composed into `computeTotalRotation` for rotation, the state `migrate()` step for schema backfill). No existing behavior changes for anyone who doesn't use the new controls.

## 1. Manual +90° rotation

New field `location.map.rotate90` (boolean, default `false`), sibling to the existing `flip180`. `public/shared/media.js`'s `computeTotalRotation(naturalW, naturalH, flip180, rotate90)` gains a fourth parameter:

```js
function computeTotalRotation(naturalW, naturalH, flip180, rotate90) {
  return (computeAutoRotation(naturalW, naturalH) + (flip180 ? 180 : 0) + (rotate90 ? 90 : 0)) % 360;
}
```

All six call sites (`editor.js:204`, `display.js:117`, `control.js:151/338/426`) pass `location.map.rotate90` alongside the existing `location.map.flip180` argument.

Server: a new `mapRotate90:toggle` socket handler mirrors the existing `mapFlip:toggle` exactly — finds the location, flips the boolean, saves, broadcasts. `server/state.js`'s `migrate()` gains `if (location.map.rotate90 === undefined) location.map.rotate90 = false;`, and `DEFAULT_STATE`'s sample location gets `rotate90: false`.

Editor UI: a second icon button next to the existing "Ruota mappa 180°" (`#flip-180`), e.g. `#rotate-90` / "Ruota mappa 90°", using a new rotate-quarter-turn icon (the existing `i-rotate` symbol is already used for 180°; reusing it for both would make the two buttons visually indistinguishable — a new symbol distinguishes them, e.g. a rotate arrow through 90° instead of 180°). Same active/inactive toggle-button styling `flip180Btn` already has.

With this, any map reaches all 4 orientations by combining the two independent toggles, regardless of its own aspect ratio (auto-detected 0° or 90° as a starting point, `flip180`/`rotate90` cover the remaining 90/180/270 offset). Existing maps are unaffected (`rotate90` defaults `false`).

## 2. Drag-to-reorder active locations (mouse + touch)

Native HTML5 drag-and-drop has no usable touch story, and the editor may run on a tablet — so this uses the same Pointer Events approach already proven for the `/control` page's drag-to-pan (`touch-action: none` while a drag is active, real `pointerdown`/`pointermove`/`pointerup`/`pointercancel` handling), not the browser's native DnD API.

Each **active** location row gains a small grip/handle icon (new SVG symbol, six-dot drag handle) as its first element — a dedicated handle rather than making the whole row draggable, so clicking into the name input, the star, or the archive button still works normally without accidentally starting a drag. Archived rows get no handle; they aren't reorderable (their order is invisible in the UI anyway — see Data Flow below).

**Interaction:** pointerdown on a handle captures the pointer and starts tracking the drag. On pointermove, the dragged row's vertical position updates to follow the pointer, and the row it currently overlaps most is used to live-reorder the visible list (swap-as-you-go, the common list-reorder feel). Pointerup (or pointercancel) commits: the editor emits the full new order of active location ids to the server; if the gesture is released with no rows swapped or is cancelled, nothing is emitted and the list stays as it was.

**Server:** new `location:reorder` handler:

```js
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
  if (validOrder.length !== activeIds.length) return; // must reorder exactly the current active set
  const byId = new Map(state.locations.map((l) => [l.id, l]));
  const reorderedActive = validOrder.map((id) => byId.get(id));
  const archivedInPlace = state.locations.filter((l) => l.archived);
  state.locations = [...reorderedActive, ...archivedInPlace];
  saveState(state);
  broadcastState();
});
```

Rejects (no-ops) anything that isn't exactly a permutation of the current active set — a stale/conflicting request from a slow client just gets dropped rather than partially applied. Archived locations always end up appended after the active ones, in whatever relative order they already had; since they're never shown interleaved with active ones in the UI, this is unobservable to the user and keeps the server logic simple.

**Data flow:** `state.locations`' array order **is** the display order everywhere it's read (editor's active list, `/control`'s location `<select>`, `applyStartupDefault`'s fallback-to-first-active). Reordering already naturally propagates through `broadcastState()` to every connected client, same as every other location change.

## 3. Permanently deleting archived locations

In the archived-locations list, next to the existing "Ripristina location" button, a new trash-icon button using the same arm-then-confirm pattern as every other destructive action in the editor (`armedLocationDeletes` Set + 2.5s timeout, mirroring `armedLocationArchives`/`armedImageDeletes` exactly — first click arms and shows "Click di nuovo per confermare", second click within the window confirms, the timeout or any other UI interaction disarms it).

Server: new `location:delete` handler, guarded to archived-only (defense in depth — the button is only ever rendered for archived rows, but the guard means a stray/replayed event can't delete an active location):

```js
socket.on('location:delete', ({ locationId }) => {
  const location = state.locations.find((l) => l.id === locationId);
  if (!location || !location.archived) return;
  state.locations = state.locations.filter((l) => l.id !== locationId);
  saveState(state);
  broadcastState();
});
```

This removes the location record only — it does **not** touch `storage/maps/`/`storage/images/`. Any map or image files that were only referenced by the deleted location become orphans, automatically picked up by the existing, separate, manual "file orfani" scanner (`/api/storage/orphans/scan` + `/purge`) that already exists specifically so file cleanup is never bundled into a one-click action. No new file-deletion code.

`applyStartupDefault` already ignores archived locations when choosing the startup default, so deleting an archived location — even one that was `isDefault` before being archived — needs no special-case handling.

## 4. Fix: location-switch confirm button isn't red

`/control`'s location-switch soft-confirm row (`#location-confirm-yes`, "Conferma") is the only confirm-style button in the app that doesn't use the shared `--danger` red styling every other arm-then-confirm/destructive button already uses (verified: map delete, image delete, polygon delete, archive location, purge orphans, reveal-all-fog all correctly get red via the existing `.confirm` class). Unlike those, this button doesn't have a separate "armed" state to toggle a class on — the confirm row appearing at all *is* the "needs confirmation" state — so it gets the red background unconditionally via CSS (`#location-confirm-yes { background: var(--danger); border-color: var(--danger); }` in `control.css`, matching the existing `.confirm`/`button.confirm` rule's colors) rather than a JS-toggled class.

## Testing

No automated test suite in this project (by design). Verification is manual, via an isolated test server (temp `DATA_DIR`/`STORAGE_DIR`/`PORT`) and live browser checks, including:
- Rotation: toggle each button independently and combined, on both a landscape and a portrait test map, confirm the on-screen rotation on `/display` and `/control`'s own preview matches (and matches the editor's own preview), confirm polygon/grid interaction still lands correctly at each of the 4 orientations (fog toggle clicks use `rotatePointToBase`, already rotation-aware).
- Reorder: drag with real mouse input and with real touch input (touch-emulated viewport), confirm the new order persists (reload the page, check another connected client), confirm dragging an archived-adjacent boundary case doesn't misbehave (archived rows aren't draggable and aren't shown in the active list at all).
- Delete: confirm only archived locations show the delete button, confirm arm-then-confirm timing (2.5s) matches the existing pattern, confirm the location disappears from `/control`'s dropdown and `data/state.json` (isolated copy) after confirming, confirm its map/image files then show up in the orphan scanner.
- Red confirm button: visually confirm `#location-confirm-yes` is red as soon as the row appears (no click needed to "arm" it), consistent with the other confirm buttons.
