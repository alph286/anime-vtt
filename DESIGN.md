---
name: Anime VTT — Sala Controllo
description: A dark, single-mode control-room UI for a locally-hosted D&D tabletop display system.
colors:
  bg-page: "#16181d"
  bg-panel: "#1f232b"
  bg-control: "#262b34"
  bg-canvas: "#0e1014"
  border: "#2c313b"
  border-control: "#333947"
  grid-line: "#20242c"
  text-primary: "#cfd6e0"
  text-secondary: "#8a93a3"
  accent: "#c9822c"
  accent-text: "#1a1a1a"
  accent-bg-subtle: "rgba(201, 130, 44, 0.15)"
  danger: "#a32d2d"
  danger-bg: "#3a1f1f"
  danger-border: "#5a2c2c"
  danger-text: "#e08a86"
typography:
  title:
    fontFamily: "system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.01em"
  label:
    fontFamily: "system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.05em"
  body:
    fontFamily: "system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.4
  body-small:
    fontFamily: "system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  control: "8px"
  panel: "12px"
  circular: "50%"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  base: "14px"
  lg: "16px"
  xl: "20px"
  xxl: "24px"
components:
  button-default:
    backgroundColor: "{colors.bg-control}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.control}"
    padding: "10px 14px"
  button-default-hover:
    backgroundColor: "{colors.bg-control}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.control}"
  button-default-active:
    backgroundColor: "{colors.accent-bg-subtle}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.control}"
  button-accent:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-text}"
    rounded: "{rounded.control}"
    padding: "10px 14px"
  button-accent-live:
    backgroundColor: "{colors.accent-bg-subtle}"
    textColor: "{colors.accent}"
    rounded: "{rounded.control}"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "#ffffff"
    rounded: "{rounded.control}"
    padding: "10px 14px"
  icon-btn:
    backgroundColor: "{colors.bg-control}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.control}"
    width: "44px"
    height: "44px"
  panel:
    backgroundColor: "{colors.bg-panel}"
    rounded: "{rounded.panel}"
    padding: "14px"
  select-primary:
    backgroundColor: "{colors.bg-control}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.control}"
    height: "44px"
---

# Design System: Anime VTT — Sala Controllo

## Overview

**Creative North Star: "Sala controllo" (the control room)**

Anime VTT is a single-DM instrument, never a public-facing product: one dark theme, fixed, no light mode, because the only viewers who matter are the DM's own eyes in a dim room and a TV across the table. The system reads as broadcast/mixer-desk hardware — flat dark panels, one warm accent used only where something is live, selected, or armed, and controls sized and grouped like physical buttons and faders rather than web-app chrome. Density is generous (44px touch targets, 8-24px rhythm) because the primary surface is a phone held mid-session in penumbra; the editor inherits the same units at slightly tighter scale because a mouse is more precise than a thumb.

The world was built, not decorated: there is no display typeface, no illustration, no gradients beyond the diagnostic grid-line pattern standing in for an empty map. Confirmed rejection, stated directly in the build's own commentary: a card grid (icon + title + text, three floating boxes) was drafted for the index page and explicitly discarded as "the generic scaffold pattern the craft floor rejects" in favor of one divided panel with three affiliated switches — the control-room register, not a landing-page register.

**Key Characteristics:**
- One dark background, three tonal layers (page → panel → control), no light variant.
- One accent color (amber), reserved for live/selected/active state — never decorative.
- Flat surfaces; depth comes from tonal contrast and thin borders, not shadows.
- Linear stroke icons only (no filled glyphs, no icon fonts).
- System UI font throughout; no display face, ever.

## Colors

The palette is a narrow, dark, function-first set: three near-black tonal steps for structure, one warm accent for state, one desaturated red for destructive/offline states.

### Primary
- **Instrument Amber** (`#c9822c`): the single accent. Used for the active tab, the "in onda"/showing banner, revealed fog cells, selected polygon/vertex, active tool button, hover/hold feedback on controls, and route-panel selection LEDs. Paired with `accent-text` (`#1a1a1a`) for on-accent text, and `accent-bg-subtle` (`rgba(201,130,44,0.15)`) for its low-emphasis/"is-live" fill.

### Secondary
- **Alarm Red** (`#a32d2d`): reserved for destructive confirmation (the arm-then-confirm "Rivela tutto"/delete pattern) and offline/disconnected state (`wifi-dot.bad`). Paired with `danger-bg` (`#3a1f1f`), `danger-border` (`#5a2c2c`), and `danger-text` (`#e08a86`) for its low-emphasis warning form (upload-size warnings, orphan-file panel).

### Neutral
- **Page Black** (`#16181d`): outermost background of every surface.
- **Panel Charcoal** (`#1f232b`): grouped-content surfaces — `.control-section` (control), `.panel` (editor), `.route-panel` (home), the status bar, toolbars.
- **Control Slate** (`#262b34`): interactive surfaces one step up from panels — buttons, inputs, selects, thumbs, list rows.
- **Canvas Void** (`#0e1014`): the map/media stage itself, darkest of all, so media reads as the brightest thing on screen.
- **Border Line** (`#2c313b`) / **Control Line** (`#333947`): hairline dividers, panel borders and control borders respectively — control borders read one step lighter than panel borders, reinforcing the surface hierarchy.
- **Grid Line** (`#20242c`): the diagnostic checkerboard used only as a map placeholder, never as decoration elsewhere.
- **Signal Text** (`#cfd6e0`) / **Muted Text** (`#8a93a3`): primary and secondary text, used consistently across all three surfaces for labels vs. values.

### Named Rules
**The One Accent Rule.** Amber never decorates; it only appears on the thing that is currently live, selected, active, or armed. A screen with nothing active shows no amber.
**The Three-Tier Surface Rule.** Every surface sits on exactly one of three backgrounds — page, panel, or control — and the darker-to-lighter progression is the only depth cue; nothing is promoted a tier just for emphasis.
**The Unlisted Black Rule.** Fog of war renders as pure `#000`, not a token. It is a semantic "hidden from players" state, deliberately outside the interface palette, and must never be reassigned a theme color.

## Typography

**Body/UI Font:** `system-ui, sans-serif` — the only font family in use, for every role from the index page's `<h1>` down to the smallest state label. There is no display face and none should be introduced; this is instrument-panel text, not editorial type.

**Character:** Utilitarian and dense. Weight and size carry hierarchy, not typeface choice — a mixer desk labels its knobs in one font, in different sizes.

### Hierarchy
- **Title** (700, 22px, 1.2 line-height): the index page's single `<h1>` ("Anime VTT"). The only outsized text in the system; used once per app, not per section.
- **Label** (600, 12px, 0.05em tracking, uppercase): section headers (`h2` in control/editor), tab-bar labels. Small, tracked, muted-colored at rest, amber only when the labeled thing is active.
- **Body** (400, 14-15px): buttons, inputs, list-row primary text, route-switch names.
- **Body Small** (400, 12-13px): hints, secondary metadata, state tags, opacity/zoom readouts, route-switch descriptions.

### Named Rules
**The No-Display-Face Rule.** Every surface uses the same system UI stack at every size; a hero moment is expressed with weight (700) and size (22px), never a second typeface.

## Layout

Three surfaces, one token system, three distinct spatial grammars driven by device and task:

- **Control (phone):** a single-column flex shell (`max-width: 720px`) with a fixed status bar on top, a scrollable tab body in the middle, and a fixed bottom tab bar (Mappa / Fog / Immagini) — one full-screen "room" visible at a time, chosen by the craft-floor-assigned "schede per compito" form. Above 700px it collapses into a two-column layout (map + live controls left, fog/images right) and the Mappa tab hides itself, since desktop-width space makes a dedicated map tab redundant.
- **Editor (PC):** a fixed two-column grid (`minmax(0,1fr) 280px`, collapsing to one column under 1100px) — canvas-and-toolbar on the left, a stack of sidebar panels (Location, Immagini, Fog of war, Fine tuning griglia) on the right. Every sidebar group is now a `.panel`, mirroring control's `.control-section` unit, so the same visual grouping spans both device classes even though the page composition (single task vs. simultaneous panels) differs.
- **Index (any device):** a single centered column (`max-width: 780px`), one `.route-panel` divided into three `.route-switch` segments by hairline borders — a row on wide screens, a stack on narrow ones (`max-width: 640px` breakpoint). Not a card grid: one panel, three positions, matching control's tab-bar register rather than a landing-page's card register.

Spacing rhythm across all three: 4/8/12/14/16/20/24px steps, with 14px as the standard panel/section internal padding and 44px as the standard touch target (buttons, icon-btn, list rows) on the phone surface; the editor tightens equivalent controls to 36px since a mouse needs less tolerance.

## Elevation & Depth

Flat by design. There is no shadow vocabulary beyond two narrow, functional exceptions: a 2px solid ring (not a blurred shadow) marking a selected image thumbnail, and a drop-shadow purely for legibility of a white icon glyph over a photographic thumbnail on hover. Depth is conveyed entirely through the three-tier tonal surface progression (page → panel → control → canvas-void) plus 1px borders; nothing lifts, floats, or casts ambient shadow.

### Named Rules
**The Flat-By-Default Rule.** Surfaces never cast shadow to indicate stacking. If something needs to read as "above" its container, it gets a border and a lighter tone, not a shadow.

## Shapes

Two radius steps and one circular case, applied by surface role, not by whim:
- **8px** on every interactive control — buttons, inputs, selects, icon-btn, image thumbnails, list rows, color swatches.
- **12px** on every grouping container — `.control-section`, `.panel`, `.route-panel`, the status bar's rounded corners at desktop width.
- **50% (circular)** reserved for point indicators — the wifi status dot, the route-panel's selection LED, polygon vertex handles, the lightbox close button.

Borders are always 1px (2px only for the deliberately thicker showing/live outline and vertex handles), solid, using `border` on panels and the lighter `border-control` on interactive controls — never a decorative or dashed border except the fog-of-war's own dashed stroke states, which are SVG map annotation, not chrome.

## Components

### Buttons
- **Shape:** 8px radius, 1px `border-control` border, `bg-control` background at rest — buttons read as one more control-slate surface, not a distinct button skin.
- **Primary/Accent:** amber background (`accent`) with dark `accent-text`, used only for actions tied to the live state (Mostra, Invia, preview-send) — never the default action.
- **Hover (editor only):** border shifts to amber (`border-color: var(--accent)`), added specifically because editor is the one mouse-driven surface; control and index rely on `:active` since touch has no hover.
- **Active/pressed (all surfaces):** background fills with `accent-bg-subtle` — the one shared "something happened" feedback across phone, PC, and index.
- **Danger/confirm:** solid `danger` background, white text — reserved for the arm-then-confirm destructive step (reveal-all, delete), never a default or hover state.
- **Disabled:** `opacity: 0.4`, no other treatment.

### Cards / Containers
- **Corner Style:** 12px.
- **Background:** `bg-panel`.
- **Shadow Strategy:** none (see Elevation & Depth); a 1px `border` is the only separation from the page.
- **Internal Padding:** 14px, uniform across `.control-section`, `.panel`, and `.route-panel`.

### Inputs / Fields
- **Style:** `bg-control` background, 1px `border-control`, 8px radius, no visible focus ring beyond the browser default — text/number/select inputs are visually interchangeable with buttons in the same control tier.
- **Select (primary/location):** a custom chevron (inline SVG data-URI, `stroke: #8a93a3`) replacing the native arrow, at 600 weight — the one refined control shared verbatim between control's status-bar location select and editor's topbar select, by explicit direction-contract instruction.
- **Range (opacity sliders):** native, unstyled beyond width; no custom track/thumb skin exists yet.

### Navigation
- **Control tab bar:** fixed bottom bar, three equal-width tab buttons, linear icon + 11px uppercase-weight label stacked vertically, muted at rest, amber when active, `accent-bg-subtle` flash on tap.
- **Editor toolbar:** a horizontal `.panel`-toned strip of icon-buttons grouped by function, separated by 1px vertical `toolbar-sep` dividers rather than by tabs — appropriate since editor shows every tool simultaneously instead of switching rooms.
- **Index route panel:** three inline "switches" instead of nav links — a linear icon, an LED, a name, and a one-line role description, divided by hairline borders (row on wide, stack under 640px).

### Iconography (signature convention)
Every icon in the system is an inline `<svg><use href="#i-name">` referencing a shared `<symbol>` sprite defined at the top of each page — linear stroke icons (`stroke: currentColor`, `stroke-width: 2`, round caps/joins), 18-26px depending on context. No filled/glyph icon, no icon font, no external icon package appears anywhere in the build.

## Do's and Don'ts

### Do:
- **Do** reserve amber for live/selected/active state only (The One Accent Rule).
- **Do** build every grouping container as a `.panel`/`.control-section`-equivalent: `bg-panel`, 1px `border`, 12px radius, 14px padding.
- **Do** keep fog of war pure `#000` (or amber-on-reveal), never a themed color — it is semantic state, not UI chrome (The Unlisted Black Rule).
- **Do** use inline linear-stroke SVG symbols for every icon; keep the shared `<symbol>` sprite pattern per page.
- **Do** size touch targets at 44px on the phone surface; 36px is acceptable only on the mouse-driven editor.

### Don't:
- **Don't** introduce a display/serif/decorative typeface anywhere; `system-ui` carries every role including the one 22px title.
- **Don't** build a card grid (icon + title + text in separate floating boxes) for navigation or summary surfaces — the index build explicitly rejected this as generic scaffolding in favor of one divided panel; the divided-panel register is the system's answer to "several equal choices," not cards.
- **Don't** add drop-shadows or elevation lift to signal hierarchy; use the page → panel → control tonal steps instead (The Flat-By-Default Rule).
- **Don't** introduce a light theme or a light/dark toggle; the dark theme is a fixed brand commitment, not a default.
