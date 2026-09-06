---
version: 1
slug: "public-editor"
primary_target: "public/editor"
related_targets: []
---

# Surface: editor

## Scope & mode

Vista `editor` (PC), modalità Operate. Estensione del linguaggio visivo già
deciso per `control`: nessuna funzionalità, nessun id, nessuna struttura DOM
va toccata; il layout a più pannelli simultanei (canvas + sidebar) resta
invariato — sul PC il DM deve vedere mappa, location, immagini e fog insieme,
a differenza del telefono.

## Audience & job

Il DM (unico utente) prepara mappe, location, poligoni di fog e immagini da
PC, prima della sessione, spesso confrontando mappa e liste fianco a fianco.

## Constraints

Preservare ogni funzione esistente (drag-reorder location/immagini, disegno
poligoni, calibrazione griglia, upload, lightbox). Nessun nuovo font o
palette: resta dentro "Sala controllo" (`public/shared/theme.css`), la
stessa già in uso da `control`.

## Direction contract

THESIS: le sezioni della sidebar smettono di galleggiare senza margini sul
fondo pagina e diventano pannelli — la stessa unità visiva che `control` ha
già dato alle sue schede — senza toccare struttura o comportamento.
OWN-WORLD: palette "Sala controllo" invariata; pannelli con lo stesso
trattamento di `.control-section` (bg-panel, bordo, radius 12px);
select/pulsante location con lo stesso trattamento raffinato (freccia
custom, peso) della barra di stato di `control`; hover/active su pulsanti e
icon-btn, assenti oggi, aggiunti per un tool guidato dal mouse.
STORY: il DM riconosce la stessa "regia" vista su `control` aprendo
`editor`: gruppi ben distinti, controlli con lo stesso peso e la stessa
risposta al tocco/hover.
FIRST VIEWPORT: layout a due colonne invariato (canvas a sinistra, sidebar
pannelli a destra); ogni sezione della sidebar è ora un pannello distinto.
FORM: estensione di un mondo già stabilito, nessun nuovo concept — nessuna
scheda decisionale necessaria.
FINISH: unreviewed and undocumented is unfinished; this build ends with the
finish review, the verdict, DESIGN.md, and every shipping raster carrying
its provenance.

## Unresolved decisions

Nessuna.
