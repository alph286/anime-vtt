# 2026-11-16 -- bug-payload

Branch `bug-payload` (da `spezza-index`, con `perf-ping-display` unito).

## Corretto (BUG noti 2-12 del piano dei test socket)

Gli handler in `server/socket-*.js` rifiutano il valore sbagliato e lo stato
non cambia. I test `// BUG noto` sono diventati casi «rifiutato» con
`expectUnchanged`.

- `view:pan`: dx/dy devono essere numeri finiti.
- `view:zoom`, `mapScale:set`: scala finita e > 0.
- `grid:update`: tutti i campi numerici (cellSize, baseCellSize, divisions,
  offsetX/Y, lineWidth, opacity) finiti; `enabled` booleano; `color` stringa.
  Un campo cattivo rifiuta l'intero evento (niente modifiche a metà). I campi
  parziali validi restano accettati.
- `compass:update`: x, y, rotation finiti (il clamp 0-100 e il modulo 360
  restano).
- `polygon:create`, `polygon:update`: almeno 3 punti `[x, y]` finiti; nome
  stringa, tagliato a 200 come `polygon:restore`.
- `shader:restore`: posizione e misure con gli stessi controlli di
  `shader:place`.
- `display:viewport`: width e height finiti e > 0.
- `image:destination`: solo stringa, `null` o assente.

Lavoro 2: `use-shader-loop.ts` di /control e /party chiama `render([])` sui
layer shader e AOE invece di `clearCanvas` a mano; i layer si nascondono da
soli. Test nuovo `use-shader-loop.test.tsx`. Build rifatta e committata.

## Scelte

- Nessun clamp per scala, viewport e coordinate: rifiuto (solo la bussola
  aveva già il suo clamp, mantenuto).
- Il barrier di `server/test-support/socket-harness.js` usava
  `display:viewport` con `width` stringa e `height` 0 come marcatore: ora usa
  un numero (1000000 + n) e `height` 1, altrimenti la validazione lo bloccava.
- Un solo commit per tutti gli handler (i test stanno in un unico file).

## Non verificato

- Il rosso prima della correzione è stato visto per view, mapScale, grid,
  compass, polygon; non per shader:restore, display:viewport, image:destination
  e il test del loop (la modifica è comunque evidente: prima non chiamava
  `render`).
- Client reali: se /editor o /control mandassero un valore che ora è rifiutato
  (es. `enabled` non booleano nel grid:update) non c'è un test end-to-end.
  Dai grep, i client mandano booleani e numeri.
- Pixel e resa dei canvas nascosti sul telefono: serve Alph.
