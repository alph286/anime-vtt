# Fog-of-War Zone Ordering — Design

**Goal:** let the editor sort a location's fog-of-war zones alphabetically by name with one click, and still let you drag any zone to a specific position afterward (or instead) — same as location reordering, applied to the polygon list.

**Architecture:** one new server event, `polygon:reorder`, is the single source of truth for "this location's polygons are now in this order." Both the alphabetical-sort button and manual dragging compute a new order client-side and emit the same event — no duplicated server logic, and the same validation (already proven for `location:reorder`) applies to both paths equally.

## Sorting

A new icon button next to the "Fog of war" section header in the editor. One click:

1. Computes the current polygons sorted by `name`, using `localeCompare` with `{ numeric: true, sensitivity: 'base' }` (Italian locale) — case/accent-insensitive, and "Stanza 2" sorts before "Stanza 10" rather than after (plain string comparison would put "10" before "2").
2. Emits `polygon:reorder` with the sorted id order.

This is a one-shot action, not a persistent "always sorted" mode — the result is a normal manual order like any other, freely draggable afterward. Nothing re-sorts automatically when a zone is renamed later.

## Dragging

Identical mechanism to the location list's drag-to-reorder (already shipped): a dedicated grip handle on each polygon row (not the row itself, so clicking to select the zone or editing its name input still works normally), Pointer Events (`pointerdown`/`pointermove`/`pointerup`/`pointercancel`, not native HTML5 drag-and-drop, for mouse **and** touch), `touch-action: none` set permanently on the handle, live DOM reordering via `insertBefore` during the drag, and the render function's list-rebuild guarded against clobbering an in-progress drag — the exact same guard-and-rebuild pattern `renderLocationPanel()` already uses for `locationDragState`, mirrored here with its own `polygonDragState`.

## Server: `polygon:reorder`

```js
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

This deliberately mirrors `location:reorder`'s actual (and, per that feature's final review, correctly judged *better than strictly rejecting*) behavior: unknown or duplicate ids are silently filtered out rather than failing the whole request, and the request is only applied if what remains is a complete, well-formed reordering of the location's current polygon set — no partial application, no data loss, and a stale client (e.g. someone just deleted a zone the dragging client hadn't seen yet) still gets a graceful, sensible result instead of a discarded drag. On rejection, the requesting socket gets a `state:update` resync so its optimistic local drag reorder doesn't stay silently stale — same fix already applied to `location:reorder`.

Zone **order** only affects the two places zones are listed (the editor's polygon list, `/control`'s fog-of-war list) — it has no effect on fog rendering on the map itself (each polygon draws from its own stored coordinates regardless of array position), so this is a low-risk, display-only change.

## Testing

No automated test suite in this project (by design). Manual verification via an isolated test server:
- Sort button reorders correctly (case/accent-insensitive, natural numeric ordering) and persists.
- Dragging works with real mouse and touch input, mirroring the location-reorder verification already done.
- Rejected/edge-case reorders (stale ids, duplicates, a zone deleted mid-drag by another client) behave per the validation above, resync correctly.
- `/control`'s fog-of-war list reflects the new order live.
- No regression to zone selection, renaming, or fog-toggle behavior.
