# Scene Preview Before Sending to Display — Design

**Goal:** let the DM prepare a location's framing (pan/zoom) and fog on `/control` before the players see it — switching the active location on `/control` no longer instantly changes what `/display` shows. A separate "Invia al display" action pushes the prepared scene live, already correctly framed. As part of the same change, pan/zoom stops being a single global value reset on every switch and becomes something each location remembers permanently.

**Architecture:** `liveView` (`{scale, offsetX, offsetY}`) moves from a single `state.liveView` to `location.map.liveView` — one per location, persisted, never automatically reset. `/control` tracks which location it's currently showing/editing locally (`previewLocationId`), independent of `state.activeLocationId` (the one `/display` actually renders). Selecting a different location in the dropdown only changes what `/control` itself shows; nothing reaches `/display` until "Invia al display" sets `state.activeLocationId` to match.

## Data model: `liveView` becomes per-location

`location.map.liveView` (default `{scale: 1, offsetX: 0, offsetY: 0}`) replaces `state.liveView`, which is removed entirely — migration deletes it, the same way `tvProfiles` was cleaned up previously. Every place that read/wrote the global value moves to reading/writing the relevant location's own field:

- `view:pan`/`view:zoom`/`view:reset` (server) gain a `locationId` parameter and mutate that location's `map.liveView` instead of a global value.
- `/display` renders the *active* location's `map.liveView` (it only ever shows one location, so this is unambiguous).
- `location:set` no longer resets anything — switching which location is active just means `/display` starts rendering that location's already-persisted `liveView`, whatever it currently is.
- `applyStartupDefault` (server boot) no longer resets `liveView` either — a location's framing survives a server restart exactly like its grid or its fog state already do. The existing "reset vista" (⟳) button on `/control` remains the only way to snap a location's view back to `{scale:1, offsetX:0, offsetY:0}`, and now it does so for whichever location is currently previewed.

## The preview mechanism

`/control` keeps a client-side `previewLocationId`, defaulting to `state.activeLocationId`. Every part of `/control`'s own UI that shows or edits map content — the map preview itself, the viewport rectangle, drag-to-pan, the zoom stepper, the pan arrows, the fog-of-war list — operates on `previewLocationId`, not on `state.activeLocationId` directly. When the two happen to be equal (the normal case — you're looking at what's live), this behaves exactly as it already does today, just reading/writing a per-location field instead of a global one.

Selecting a different location from the dropdown sets `previewLocationId` to that location — purely client-side, no server round-trip — and `/control`'s map/fog sections immediately switch to show and let you edit *that* location's already-saved framing and fog state. `state.activeLocationId` doesn't change, so `/display` keeps rendering whatever was live before; nothing reaches the players.

Whenever `previewLocationId !== state.activeLocationId`, a banner appears (visual style analogous to the existing "stai mostrando ai giocatori" image banner, but distinct — this one means the opposite, *not yet* visible) reading "Anteprima: **[nome location]** — non visibile ai giocatori", with two actions:

- **Invia al display** — emits `location:set` for `previewLocationId`. The server sets `state.activeLocationId` to match; `/display` switches to that location already at whatever framing/fog was prepared, in one step, never showing the un-zoomed whole map first. `previewLocationId` now equals `state.activeLocationId`, so the banner disappears on its own.
- **Annulla anteprima** — resets `previewLocationId` back to `state.activeLocationId`, purely client-side. Nothing prepared is lost; the previewed location's framing and fog stay exactly as they were, saved for whenever it's revisited.

Choosing yet another location while already previewing one simply re-targets `previewLocationId` — no confirmation needed, since nothing has been sent and nothing prepared is discarded (it's all already persisted per-location).

**Deliberate scope decision — external `location:set` while previewing.** If another surface (e.g. `/editor`) changes `state.activeLocationId` while `/control` is previewing a different location, `/control` does NOT follow: it keeps showing/editing whatever it was previewing, and only the banner's implicit meaning shifts (the location it names is no longer the one about to be un-done by "Annulla anteprima" reverting to the *old* active location, not the new one). This was raised during the final review as an unconsidered multi-client edge case and decided explicitly rather than left as an accident: the DM's in-progress prep on `/control` (framing, fog) should not be yanked away by something happening elsewhere. No code change was made for this case.

Fog-of-war interaction is safe to leave fully active during preview without any special-casing: `/display` only ever renders the *active* location's polygons, so toggling fog on a merely-previewed location has zero visible effect on the TV — it's exactly the "prepare the scene, including what's already revealed, before the party walks in" the feature exists for.

**Scope boundary — images stay live-only.** The "mostra immagine ai giocatori" section continues to act only on the active location and continues to take effect instantly, unchanged from today. While `previewLocationId !== state.activeLocationId`, the images section is hidden — showing an image belonging to a location that isn't even the active one doesn't have a sensible meaning, and this feature is scoped to map framing and fog, not image display.

## Testing

No automated test suite in this project (by design). Manual verification via an isolated test server:
- Switching the dropdown to a different location updates `/control`'s own preview (map, zoom level, fog list) without any change on `/display`.
- Panning/zooming while previewing a non-active location updates only that location's saved `liveView`, confirmed via server state, and produces no visible change on `/display`.
- "Invia al display" makes `/display` switch directly to the previewed location already at the prepared framing — no intermediate full-map flash.
- "Annulla anteprima" reverts `/control` to the active location; the previewed location's prepared framing/fog are unchanged when revisited later.
- Returning to a previously-visited location (via preview+send, or directly) restores its own last-saved framing, not a reset default.
- Fog toggles made while previewing don't affect what `/display` shows until that location becomes active.
- The images section is hidden during preview and reappears (reflecting the active location) once back in sync or after sending.
- A location's framing survives a server restart (isolated test server, restart, confirm `liveView` unchanged).
- No regressions to the existing "reset vista" button, the viewport-rectangle drag-to-pan, or the zoom stepper for the normal (non-preview) case.
