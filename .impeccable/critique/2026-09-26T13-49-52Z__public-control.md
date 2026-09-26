---
target: public/control
total_score: 21
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 4
target_identity: "file:/home/kratos/Documenti/Projects/anime-vtt/public/control"
timestamp: 2026-09-26T13-49-52Z
slug: public-control
---
Method: dual-agent (A: design-review subagent · B: detector/browser-evidence subagent)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Compass and ping act on the TV but render nowhere on the phone; the DM edits them blind. `#wifi-dot` conflates "server down" and "TV not connected" into one red glyph with no text. |
| 2 | Match System / Real World | 3 | D&D domain language fits well, but the AoE mode icon reads as "brightness" (sunburst), "Controlli" is a meaningless header for TV pan/zoom, and "Click di nuovo" is used on a touch-only device. |
| 3 | User Control and Freedom | 3 | Modes toggle off on re-tap, previews cancel cleanly, remove/reveal-all arm-then-confirm — but AoE moves/rotations and "Nascondi tutto" have no undo. |
| 4 | Consistency and Standards | 2 | Three different "selected" visual treatments across the app; radii drift (6/8/10/12px against a documented 8/12px scale — confirmed independently by both assessments, see below); "Click" vs "Tocca"; unlabeled duplicate steppers. |
| 5 | Error Prevention | 2 | The AoE size stepper edits the *next* placement, not the selected chip — a live mode-error trap sitting directly above the chip list. Disabled buttons look enabled. |
| 6 | Recognition Rather Than Recall | 2 | Icon-only mode bar relies on `title` tooltips, which never fire on touch. Two identical unlabeled "1,5 m" steppers for a Linea's length/width. |
| 7 | Flexibility and Efficiency | 2 | Pinch-zoom, viewport-rect drag, and AoE drag are real accelerators, but every discrete control (compass nudge, pan pad, AoE rotate) is a single un-repeatable tap at a tiny step — dozens of taps to move the compass across the map. |
| 8 | Aesthetic and Minimalist Design | 2 | Disciplined palette, but the room below the map is diluted by four rarely-touched sections and visibly unaligned button geometry. |
| 9 | Error Recovery | 2 | Telegram failures get inline text; the single highest-stakes failure (TV off) gets a silent red dot. |
| 10 | Help and Documentation | 1 | One hint line exists (Fog tab); everything else depends on hover-only tooltips that don't exist on the DM's actual device. |
| **Total** | | **21/40** | **Acceptable** |

## Design Specificity Verdict

**LLM assessment (Assessment A):** Partly authored, partly interchangeable. The *frame* — fixed status bar, bottom Mappa/Fog/Immagini tab bar, three-tier dark surfaces, amber reserved for live state, the preview-vs-live banner, D&D-specific AoE shapes snapped to a 1.5m grid — is genuinely built for this product and this DM. But the *inside* of the Mappa room contradicts the surface brief's own THESIS ("tre stanze a schermo pieno... senza scrollare tra sezioni inerti") and FIRST VIEWPORT ("mappa sempre a schermo pieno quando attiva"): the map measures 252px in a 714px-tall scroll area (about 35% of the room), with Controlli/Opacità/Rosa dei venti/Audio stacked below it as an ordinary mobile settings page. Below the map, controls float at whatever x-position their label's width happens to produce, rather than sitting on a hardware-panel grid — the opposite of the "mixer/regia register" the brief calls for. Filled Unicode glyphs (▲◀▶▼, ⟳↻↺✕) sit next to the SVG stroke sprite, contradicting DESIGN.md's "linear stroke icons only, no filled glyphs" rule.

**Deterministic scan (Assessment B):** `impeccable detect --json public/control` returned 19 findings (all `severity: advisory`), 8 font-size, 6 radius, 5 color — but **exit code 0**, which contradicts the tool's own documented "0 = clean, 2 = findings" contract (a detector-tooling bug worth a separate note, not a product issue). Of the 19: **11 are clean false positives** against DESIGN.md's own stated exceptions — 8 font-size findings actually fall inside DESIGN.md's prose-documented ranges ("Body 14-15px", "Body Small 12-13px", the tab bar's named 11px label) that the machine-readable frontmatter just doesn't enumerate; `#000` on the fog overlay is explicitly "The Unlisted Black Rule"; two `#fff` findings are `button-danger`'s documented `#ffffff` in shorthand notation the detector doesn't normalize. One (`.image-thumb-label`'s `#fff`) is a partial/soft false positive (same legibility rationale as a documented exception, different literal declaration). One (`index.html:0`) is a useless duplicate with an unusable line number. **6 findings are genuine, undocumented drift**: `.confirm-row`/`.showing-banner`/`.map-preview` all use 10px radius (between the documented 8px and 12px steps), `.aoe-chip-shape-toggle`/`.aoe-chip-rotate`/`.aoe-chip-remove` use 6px (below the 8px control floor), and `.image-thumb-label`'s scrim uses an undocumented `rgba(0,0,0,0.6)`.

**Where the two assessments agree, independently:** Assessment A, working from manual code review alone, separately flagged "radii off the two-step system" as a Minor Observation — landing on the *same* 10px/6px drift the detector found mechanically. That's real convergence, not overlap by coincidence: two independent methods found the same undocumented drift.

**Browser visualization (Assessment B):** one console finding at both mobile (375×812) and desktop (1280×900) viewports: `repeating-stripes-gradient` on `<body>`. This is a clean false positive — it's firing on `.map-placeholder`'s `repeating-linear-gradient` grid pattern, which DESIGN.md explicitly names as the system's one sanctioned gradient exception ("no gradients beyond the diagnostic grid-line pattern standing in for an empty map"). Overlays were not user-visible in a persistent form (console-only readout); no `[Human]` tab was left open per the flow.

## Overall Impression

The shell (status bar, tab bar, amber-for-live-state, preview/live safety banner) is genuinely on-brand and well-executed — this is not a generic template. But the moment you step inside the Mappa room, the page reverts to an ordinary stacked mobile-settings layout that directly contradicts its own written design brief, and every panel below the map has visibly inconsistent button geometry (confirmed by both a human-style design read and, independently, by measured layout coordinates). The single biggest opportunity is also the cheapest to name and the most expensive to fix: **give the map the full-screen room the brief already promised it, and move everything else into a drawer or its own tab** — most of the "P1" findings below are downstream symptoms of that one structural decision never having been carried out.

## What's Working

1. **The preview-vs-live model.** Switching location previews it in an outlined banner ("Anteprima: X — non visibile ai giocatori") with an amber "Invia al display" and a neutral "Annulla anteprima", while disabling ping/AoE/Immagini so the DM can't act on a location that isn't live. This is precise, well-scoped error prevention against the DM's single worst-case mistake (showing the wrong map to players).
2. **Accent discipline.** Amber only appears on active tab, active mode, revealed fog rows, the selected chip, and the viewport rectangle — nothing is amber at rest. Contrast checks passed: accent-on-panel 5.03:1, text-on-accent 5.56:1, secondary-text-on-panel 5.09:1.
3. **Touch-target discipline.** Nearly every control measures a real 44×44px (mode buttons, pad buttons, chip actions, tab bar), and the per-mode `touch-action` handling is careful, deliberate engineering that makes dragging reliable on a touch device.

## Priority Issues

**[P1] The Mappa room breaks its own direction contract — the map isn't full-screen**
- **Why it matters:** The map is the DM's actual working surface (fog tap, ping, AoE placement, pan drag, pinch zoom) and gets ~35% of the screen height; the surface brief explicitly promises "mappa sempre a schermo pieno" and "senza scrollare tra sezioni inerti," and today's page is a 1.7-screen scroll with Controlli/Opacità/Rosa dei venti/Audio all stacked below it. Opening AoE mode pushes the map down further still (inserting a 237px panel above it).
- **Fix:** Make the map `flex:1` to fill remaining height in the Mappa tab; dock the 5-mode bar to the map's bottom edge near the tab bar (thumb reach); move Controlli/Opacità/Rosa dei venti/Audio into a bottom drawer or a 4th tab; render the AoE panel as an overlay sheet, not a block that displaces the map.
- **Suggested command:** `/impeccable layout`, then `/impeccable adapt`.

**[P1] Button positioning and balance below the map are measurably inconsistent — the concern you flagged**
- **Why it matters:** Every "label + control" row below the map floats its control at whatever x-position the label's width produces, instead of a shared grid: the Griglia and Fog-of-war opacity steppers sit ~22px apart from each other; the Controlli zoom column and pan pad are 4px out of vertical alignment with each other; the compass toggle floats at x=115 while its pad below is left-aligned separately at x=29 (the Controlli pad above it is centered) — two stacked d-pads with different alignment, different gaps, and one has an empty center while the other has a rotate button in it. About 45-55% of several rows sits empty on the right.
- **Fix:** One row grammar everywhere — label left, control group right-aligned (`justify-content: space-between`, drop the centering `flex:1` on `.zoom`); fixed 44×44 stepper buttons with a fixed-width tabular-nums value; the same gap value in `.pad` and `.zoom-controls`; both d-pads on the same alignment; an `h2` on every section (Rosa dei venti currently has none).
- **Suggested command:** `/impeccable layout`, then `/impeccable polish`.

**[P1] The AoE size stepper edits the wrong thing, and selecting a chip reflows the whole list**
- **Why it matters:** `#aoe-size-out/in` change the size of the *next* placement, but they sit directly above the chip list where a chip just got selected (turned amber) — a DM adjusting a placed cone's size will tap + and watch nothing happen on the map. Separately, selecting a chip grows it from 141px to 293px and wraps it onto its own line, shoving every later chip down 54px mid-interaction — the classic moving-target problem on a device already flagged as thumb-driven and interruption-prone. The trailing action buttons (↺↻✕) also sit at `bg-panel` (a tier below the pill they belong to) with 6px radius and Unicode glyphs instead of the stroke sprite.
- **Fix:** When a chip is selected, either have the stepper edit that chip directly (with an "editing: Cono 4,5m" state), or move all selected-chip actions into one fixed row below the list instead of trailing each pill so nothing reflows. Make pills real `<button>`s with `aria-pressed`. Replace glyphs with sprite icons.
- **Suggested command:** `/impeccable clarify`, then `/impeccable layout`.

**[P1] No local feedback for compass/ping, and the connection indicator conflates two different failures**
- **Why it matters:** Neither the compass nor a ping renders anywhere on `#map-preview` — `control.js` has no render path for either — so every compass nudge or ping tap requires looking up at the TV to see what happened, breaking the core "phone drives, TV shows" loop this whole app exists to support. Separately, `#wifi-dot` turns red for *either* "this phone lost the server" or "the TV isn't connected," with no text and no `aria-label`, at exactly the moment (session setup) when the DM most needs to know which one it is.
- **Fix:** Draw the compass marker and a transient ping ripple directly on `#map-fit-box` (same layer as `#map-aoe-svg`) so the pad gets instant local feedback, and consider making the compass drag-to-position like an AoE instead of a d-pad entirely. Replace the single dot with a two-state chip or two icons distinguishing server vs. TV.
- **Suggested command:** `/impeccable harden`, then `/impeccable clarify`.

**[P2] Disabled-state styling gaps**
- **Why it matters:** `button:disabled` has no generic style, so `#image-hide-btn` renders fully opaque and readable while disabled. `#image-send-btn` at `.btn-accent` + `opacity:.4` reads as muddy brown instead of neutral, putting amber on a disabled control (breaking "nothing is amber at rest" even by accident). The three-button `.image-detail-actions` row is tight enough that "Ritorna alla mappa" wraps to 3 lines, forcing all three buttons to 86px tall.
- **Fix:** Add a real `button:disabled { opacity: .4 }` rule project-wide; make disabled accent buttons fall back to neutral `bg-control`; give "Ritorna alla mappa" (or a shortened "Torna alla mappa") its own row.
- **Suggested command:** `/impeccable polish`.

## Persona Red Flags

**Alex (power user — the DM mid-session, knows every control):** Compass nudges move 2% per un-repeatable tap (~20 taps to cross the map, each verified only by looking at the TV); the pan pad moves 20px per tap with the same limitation, and the fast path (dragging the viewport rectangle) is silently disabled whenever the TV hasn't reported its viewport, with no visible reason; rotating an AoE 90° takes 6 taps right next to the remove button; every AoE-mode entry re-inserts a 237px panel that pushes the map down and must be scrolled past afterward; "Nascondi tutto" has no arm-then-confirm step, unlike its "Rivela tutto" twin, so one mis-tap re-hides every revealed zone instantly.

**Casey (distracted one-handed mobile user, dim room, eyes on the table):** the 5-mode bar and location select sit at the very top, out of one-handed thumb reach, while the map's own modes are what needs to be reachable most; the *only* signal of the active mode is a single amber icon at the top, so a glance-away-and-back tap could place an AoE by mistake; targets move under the thumb mid-interaction — opening AoE mode shifts the map 253px down, selecting a chip reflows the list 54px, arming "Rivela tutto" grows both bulk buttons from 44px to 62px; every icon-only control (5 modes, 4 shapes, 5 colors) depends on a `title` tooltip that never appears on touch; `border-control`'s contrast against the panel (1.36:1) and page (1.54:1) is faint enough that control edges effectively vanish in a dim room, leaving buttons reading as floating glyphs.

**Sam (accessibility-dependent — screen reader, keyboard, low vision):** there is no ARIA anywhere in `public/control/` — no `role="tablist"`/`aria-selected` on the tab bar, no `aria-pressed` on any mode/shape/color/compass toggle, no label on `#location-select`, no accessible name on the wifi dot; the pan d-pad's glyph buttons (▲◀▶▼) have no `title` or `aria-label` at all, so a screen reader announces "black up-pointing triangle"; the AoE color swatches are distinguished only by hue plus a white border on the active one — red and green are indistinguishable for common color-vision deficiencies, with no other selection cue; there are no `:focus-visible` styles anywhere, and the amber active-fill can visually swallow the browser's default focus ring; `.aoe-chip-pill` is a bare `div`, so a keyboard user cannot select a placed area at all.

## Minor Observations

- Detector-tooling note (not a product issue): `impeccable detect` returned 19 real findings but exit code 0, contradicting its own documented "0=clean/2=findings" contract — worth a bug report to whoever owns the detector.
- Two unrelated "zoom" concepts (`#zoom-mode-toggle`'s DM-only local zoom vs. `#zoom-in/out`'s shared TV zoom under "Controlli") share one icon family; two "Fog" concepts (the fog mode toggle and the Fog tab) share the exact same icon, and tapping one never activates the other.
- The AoE mode icon (`#i-aoe`, an 8-ray sunburst) reads as "brightness" rather than an area-of-effect/blast concept.
- Copy inconsistencies: "Cubo 6,0m" (no space) vs. "1,5 m" (space); "Fog of war" left in English inside an otherwise-Italian UI; "Click di nuovo" vs. the chip's own "Tocca di nuovo" for the same touch gesture.
- No empty state in the Fog tab — a location with 0 polygons still shows both enabled bulk buttons over a blank void instead of a disabled state with an explanatory line.
- `.image-thumb-label` uses undocumented `rgba(0,0,0,.6)` + `#fff` and shows raw filenames ("Bagwan.png") to the DM.
- The map's own layout has no `ResizeObserver`; a mode-bar-height change without a window resize can leave `#map-fit-box` stale until the next resize/tab-change (seen in headless testing, may be scrollbar-width-dependent rather than a real-device bug — worth a quick manual check, not an assumed fix).
- The gap between the mode bar and the map (26px: 10px margin + 16px panel gap) is visibly larger than the 16px used everywhere else, reading as a small detachment between the controls and the surface they control.

## Questions to Consider

1. If the map is meant to be the room, why does the Mappa tab scroll at all — what changes if Controlli/Opacità/Rosa dei venti/Audio moved into a pull-up drawer and the phone showed only the map, a bottom mode dock, and the tab bar?
2. Why edit the compass with a d-pad on a surface that can't show where it currently sits — if it were drawn and dragged directly on the map like an AoE, would the whole "Rosa dei venti" section even need to exist as a separate panel?
3. Should "place a new area" and "edit the selected area" be the same set of controls? If selecting a chip turned the shape/color/size row into a live editor for that specific area, would the trailing per-chip action buttons — and the reflow they cause — disappear entirely?
