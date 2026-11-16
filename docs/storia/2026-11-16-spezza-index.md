# 2026-11-16 - Fase 4: spezzare `server/index.js`

Branch `spezza-index` (da `minori-noti`). Piano:
`docs/superpowers/plans/2026-11-16-spezza-index.md`.

## Cosa è stato fatto

- `server/index.js` da 1331 a circa 300 righe: restano avvio, cablaggio e stato
  condiviso (stato, Set dei socket, throttle, `protectSocketHandlers`,
  migrazioni d'avvio, rotte corte).
- 64 handler socket in 10 moduli `server/socket-*.js`
  (`register<Gruppo>Events(socket, ctx)`): location, fog, immagini e handout,
  vista (con `ping:show`), poligoni, griglia (con mappa e bussola), aree
  d'effetto, shader, audio, presenza (`hello`, `display:viewport`,
  `disconnect`).
- Rotte HTTP in `server/routes-storage.js` (upload, orfani, media Web) e
  `server/routes-backup.js` (export/import); `deleteUploadedFile` in
  `server/files.js`.
- Lo stato si legge solo con `getState()` dentro ogni handler; `displayViewport`
  e `displayAudio` solo con getter/setter del contesto; `/api/import/apply`
  rilegge lo stato dopo ogni `await` e usa `setState(candidate)` dopo
  `saveState(candidate)`.
- Il codice degli handler è stato spostato, non riscritto: le uniche righe
  nuove sono quelle della tabella «Sostituzioni ammesse» del piano.

## Scostamenti dal piano

- Ordine di registrazione in `io.on('connection')`: presenza, audio, location,
  fog, immagini, vista, poligoni, griglia, AoE, shader (l'ordine tra eventi
  diversi non conta).
- Nei moduli di rotte il codice è indentato di due spazi in più perché sta
  dentro la funzione di registrazione.
- I `require` di `index.js` sono stati riordinati oltre che ripuliti.
- V4 del piano (`state = `) trova anche `const state = getState();`: è un falso
  positivo, ignorato; conta solo che non ci siano altre assegnazioni.

## Verificato

- `npm test` verde (server `node --test` e Vitest, controllo build) a ogni
  commit; il test «copertura» trova ancora 64 eventi.
- Stessi nomi di evento di prima, `server/socket-events.test.js` e
  `server/test-support/` invariati rispetto a `minori-noti`.

## Non verificato

- Nessuna prova dal vivo (Raspberry, browser, telefono): il comportamento è
  garantito solo dai test della fase 2.
- Le rotte di upload non hanno test HTTP propri: lo spostamento è stato
  controllato solo rileggendo il codice.
- BUG noti dei test socket non corretti, come da piano.
