# Grid Opacity from Control + Alignment Improvements — Design

**Goal:** let the grid overlay's opacity be adjusted from `/control` (real, shared, saved — not a local-only preview aid), and improve the editor's grid-alignment drag with two independent additions: a toggle to constrain the drag to a perfect square, and a "divide the traced cell into N" input for maps whose natural square unit doesn't match the desired grid scale.

**Architecture:** one new persisted field (`location.map.grid.opacity`), one extended server handler (`grid:update`), and one new UI surface on `/control` (blind +/- control, no grid rendering added there). The two alignment improvements are purely client-side changes to the existing drag-to-align tool in the editor — no schema or server changes.

## A. Grid opacity, adjustable from `/control`

New field `location.map.grid.opacity` (number, `0`-`1`, default `1`) — sibling to `enabled`/`cellSize`/`color`/`lineWidth`. Default `1` means every existing saved grid renders exactly as it does today (fully opaque) after migration backfills the field.

`public/shared/media.js`'s `renderGridSvg` applies it as `svgEl.style.opacity = grid.opacity`, dimming the whole overlay uniformly — one line, no per-line changes needed. This is picked up automatically everywhere the shared grid renderer already runs (`/editor`, `/display`); no changes needed in `display.js` beyond the grid object carrying the new field.

Server: `grid:update`'s handler gains an `opacity` parameter, applied the same way as its existing fields (`if (opacity !== undefined) location.map.grid.opacity = opacity;`).

**`/control`**: a new "Griglia" mini-section, same visual pattern as the existing zoom control (`-` button, percentage readout, `+` button, 10% steps, clamped `0`-`100%`). Per the approved decision, this is a **blind** control — `/control` does not render the grid in its own map preview at all (unlike fog, which it already shows); adjusting opacity here only affects what `/display` (and the editor, if open) actually render. The control is disabled/hidden when the active location's grid isn't enabled (`location.map.grid.enabled === false`) — adjusting the opacity of an invisible grid is meaningless, and grid enable/disable itself stays an editor-only action, unchanged by this work.

**Editor**: a matching numeric opacity input added next to the existing color/line-width grid-appearance controls in the toolbar (not the separate "Fine tuning griglia" panel, which is about cell size/position) — keeps both surfaces able to reach the same setting, at minimal extra cost since the field and server handler already exist for `/control`'s sake.

## B. Square-constrained alignment drag

A new toggle button next to the existing grid-align tool button, off by default (preserves current behavior unless explicitly turned on). While active, dragging the alignment box forces it to stay a perfect square in real time — using the larger of the two dragged deltas (width, height) for both dimensions as the drag updates — instead of today's free rectangle (whose width and height are only averaged into a single `cellSize` *after* release). This makes precise square-tracing easier, especially on touch, since what's drawn during the drag already matches what will become the cell size — no reliance on the averaging step to paper over an imprecise rectangle.

This only changes how the visual box is computed during the drag (`updateGridAlignBox`); `applyGridAlignment`'s existing width/height-averaging math is untouched and still runs on release — with the constraint on, width and height are already equal, so the average is a no-op.

## C. Cell-count subdivision

A new number input next to the same tool button (default `1`, minimum `1`, no enforced maximum beyond ordinary input sanity). At the moment a grid-align drag completes, the traced square's computed size is divided by this value before being sent to the server: trace a square that corresponds to 3m on the map, set the field to `2`, and the resulting grid's `cellSize` is set to half that traced size — each visible grid square now represents 1.5m. At the default value of `1`, behavior is byte-for-byte identical to today.

This value is a transient tool setting (like the editor's own zoom level), not persisted per-location and not sent to the server directly — only its effect (the already-divided `cellSize`) is.

## Testing

No automated test suite in this project (by design). Manual verification via an isolated test server:
- Opacity: adjust from `/control`, confirm `/display` and the editor (if open) visibly dim/brighten, confirm it persists (reload, check another client), confirm the control is disabled/hidden when grid is off for the active location, confirm existing locations (pre-migration) default to fully opaque.
- Square-constrain: toggle on, drag a non-square gesture, confirm the visual box stays square throughout and the resulting `cellSize` matches; toggle off, confirm the old free-rectangle-then-average behavior is unchanged.
- Subdivision: trace a known square with the field at `1` (baseline, matches today), then at `2` and `3`, confirm the resulting `cellSize` is exactly the traced size divided by that value (within existing rounding), and that the origin/offset still lines up with the top-left of the traced square.
- No regressions to existing grid fine-tuning (cell size/offset numeric inputs, move pad, save/apply preset, color, line width) or to fog/zoom controls on `/control`.
