# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Un solo utente: il DM (l'utente stesso), che è l'unica persona che apre `editor` (prima della sessione, su PC, per preparare mappe/location/fog) e `control` (durante la sessione, da smartphone, per pilotare live cosa vede la TV). I giocatori al tavolo sono spettatori passivi della vista `display` sulla TV: non toccano mai l'app, non hanno account, non interagiscono con nessuna UI.

## Product Purpose

Mostrare mappe/immagini con fog of war su una TV durante le sessioni della campagna D&D "Anime Salve", tenendo la vista sincronizzata in tempo reale con quello che il DM decide dal telefono mentre gioca, dopo averla preparata in anticipo da PC. Successo = la TV mostra sempre la scena giusta, senza friction, senza dipendere da internet.

## Positioning

Locale, offline, open source e su misura per le esigenze esatte di questa campagna — a differenza di Foundry VTT o Roll20 (che richiedono cloud/abbonamento/account e offrono funzionalità generiche in eccesso), questo VTT-lite gira interamente sulla LAN di casa su un Raspberry Pi, sotto pieno controllo del DM, con solo le funzioni che servono davvero a questo tavolo.

## Operating Context

- Un unico Raspberry Pi 4, collegato alla TV, fa sia da server che da client: mostra `/display` in kiosk mode (Chromium fullscreen, autostart via systemd + autostart desktop) all'avvio.
- Tutto sulla LAN di casa, nessuna dipendenza da internet a runtime.
- Durante la sessione: il DM controlla da smartphone (`/control`) mentre gioca al tavolo.
- Prima della sessione: il DM prepara mappe, location e poligoni di fog of war da PC (`/editor`).
- Ambiente dev e produzione (Raspberry) sono installazioni indipendenti dello stesso codice sorgente (`node_modules`, `.env`, `data/`, `storage/` non condivisi né in git).

## Capabilities and Constraints

- Sincronizzazione in tempo reale tra le tre viste via socket.io.
- Fog of war poligonale (disegnata a mano nell'editor, non a griglia), memorizzata come punti percentuali relativi all'immagine della mappa.
- Pan/zoom si applica solo al layer mappa, mai alle immagini fullscreen mostrate a schermo intero.
- Rotazione mappa (auto-orientamento + toggle manuale 90°/flip180°) esiste ed è usata attivamente in `control`: funzionalità viva, non va rimossa né "ripulita".
- Le mappe possono essere anche video (mp4/webm/ecc.), non solo immagini; limite upload lato client 1920×1080 / 150MB.
- Strumento griglia con calibrazione sia numerica (stile Foundry) sia per trascinamento (stile Roll20), più preset globali riusabili.
- Nessun framework/dipendenza CDN sul client: JS vanilla, deve funzionare offline sulla LAN.
- Deliberatamente assenti (scelte esplicite del DM, non lacune): profili di calibrazione multi-TV (si usa una sola TV), slider numerici nell'editor, brush/eraser per il fog.
- Vincoli operativi/accessibilità: nessuno oltre a quanto già implementato (tema scuro fisso, kiosk mode, niente `window.prompt`/`alert`).

## Brand Commitments

Nome campagna: "Anime Salve". Tema visivo attuale già in uso: schema scuro fisso unico ("Sala controllo"), nessun toggle chiaro/scuro.

## Product Principles

- Locale prima di tutto: nessuna funzione può introdurre una dipendenza da internet o cloud a runtime.
- Solo ciò che serve a questo tavolo: niente feature generiche "per completezza" se il DM non le ha chieste.
- Il DM prepara, il telefono pilota, la TV mostra: tre ruoli separati e mai confusi tra loro.
- Affidabilità in sessione live batte tutto il resto: niente che possa bloccare l'interfaccia a metà partita (es. niente `alert()`/`prompt()` bloccanti).
- Redesign estetico in corso = solo estetica: nessuna funzionalità esistente (inclusa la rotazione mappa in `control`) va rimossa, ridotta o alterata nel comportamento durante il redesign visivo.
