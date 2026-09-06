---
version: 1
slug: "public-control"
primary_target: "public/control"
related_targets: []
---

# Surface: control

## Scope & mode

Vista `control` (smartphone), modalità Operate. Redesign puramente estetico:
nessuna funzionalità, nessun id, nessuna struttura DOM critica (nesting
`#map-preview` → `#map-media-wrap` / `#viewport-rect` / `#pan-mode-toggle`
come fratelli diretti) va toccata.

## Audience & job

Il DM (unico utente) usa `control` sia in prep sia live al tavolo durante la
sessione: deve vedere e cambiare cosa mostra la TV con il minimo di tap,
anche in penombra, telefono in mano.

## Constraints

Preservare tutte le funzioni esistenti: fog tap-to-reveal, drag pan/zoom,
rotazione mappa nel calcolo di `viewport-rect`, griglia, immagini/handout,
pattern arma-poi-conferma su "Rivela tutto". Nessun nuovo font o palette:
resta dentro "Sala controllo" (`public/shared/theme.css`).

## Direction contract

THESIS: control smette di essere uno scroll unico e diventa tre stanze a
schermo pieno — Mappa, Fog, Immagini — invece di impilare tutto in colonna.
OWN-WORLD: palette "Sala controllo" invariata (bg #16181d/#1f232b/#262b34,
ambra #c9822c, testo #cfd6e0); niente font o palette nuovi; tab bar in
registro mixer/regia.
STORY: il DM vede subito cosa mostra la TV ora, passa a Mappa per
pan/zoom/fog-tap, a Fog per la lista testuale, a Immagini per gli handout,
senza scrollare tra sezioni inerti.
FIRST VIEWPORT: barra di stato fissa (location attiva + wifi) in alto; sotto,
barra a schede Mappa/Fog/Immagini; la scheda attiva riempie tutto lo spazio
restante, mappa sempre a schermo pieno quando attiva.
FORM: "Schede per compito", 5ª nel mio ordine di risonanza, assegnata dal
tiro (seed key 44ac8a37).
FINISH: unreviewed and undocumented is unfinished; this build ends with the
finish review, the verdict, DESIGN.md, and every shipping raster carrying
its provenance.

## Unresolved decisions

Nessuna al momento.
