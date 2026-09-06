---
version: 1
slug: "server-index-js-route-get"
primary_target: "server/index.js (route GET /)"
related_targets: ["public/shared"]
---

# Surface: index

## Scope & mode

Pagina indice minima (`GET /`), modalità Operate/wayfinding. Oggi è testo
semplice generato inline dal server; diventa una pagina HTML/CSS dedicata,
servita come file statico, nello stesso linguaggio "Sala controllo".

## Audience & job

Il DM apre questa pagina solo per raggiungere una delle tre viste
(`/display`, `/control`, `/editor`) da un dispositivo qualsiasi sulla LAN —
raramente, di solito una volta per dispositivo/bookmark.

## Constraints

Nessun nuovo font o palette: `public/shared/theme.css`. I tre link restano
esattamente questi tre, nessuna funzione aggiunta.

## Direction contract

THESIS: da lista di link nudi a un quadro comandi con tre posizioni chiare,
distinte per ruolo (TV / telefono / PC), leggibili con un colpo d'occhio.
OWN-WORLD: palette "Sala controllo" invariata; UN pannello unico
(`.route-panel`, stesso trattamento di `.control-section`) diviso in tre
selettori affiancati da una linea (non tre card separate — il grid di card
icona+titolo+testo è lo scaffold generico che il craft floor rifiuta), ognuno
con una spia che si accende all'hover/tocco e un'icona lineare per ruolo (TV,
telefono, PC) nello stesso stile di `control`.
STORY: chi apre la pagina capisce subito quale dispositivo sta usando ora e
tocca il selettore giusto.
FIRST VIEWPORT: titolo minimo ("Anime VTT") in alto, un pannello a tre
selettori affiancati (impilati su schermi stretti), ognuno con spia, icona,
nome vista e una riga di descrizione del ruolo.
FORM: estensione di un mondo già stabilito, nessun nuovo concept — pagina
troppo piccola per una scheda decisionale.
FINISH: unreviewed and undocumented is unfinished; this build ends with the
finish review, the verdict, DESIGN.md, and every shipping raster carrying
its provenance.

## Unresolved decisions

Nessuna.
