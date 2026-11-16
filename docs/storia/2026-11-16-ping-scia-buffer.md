# Scia del ping: buffer che non si restringe (16 nov 2026)

Branch: `ping-scia-buffer`. Commit principale: `b9c0731`.

## Problema

Sul Raspberry, dopo `perf-ping-display`, il tempo CPU di `PingLayer.render()`
passava da 0,7 ms (solo tap) a 25 ms (solo scia) e 71 ms (misto) per frame
(tabella in `2026-11-16-ping-veloci-display.md`). Ipotesi da verificare: il
canvas ridotto cambia misura a scatti di 32 px mentre la scia si muove, e ogni
volta il buffer WebGL viene riallocato.

## Verifica dell'ipotesi (in locale)

`tools/perf-ping/measure.mjs` ora conta i resize del canvas (assegnazioni di
`canvas.width`/`height` a un valore diverso) e divide il tempo di `render()`
tra frame con resize e frame senza. Prova: scenario `webmCast` (video webm
1920x1080, 3 aree lanciate), finestra 1920x1080, 8 s, RTX 3060, throttle CPU
1x e 6x.

| prova | resize/s | render con resize | render senza | render medio |
|---|---|---|---|---|
| scia 1x | 13 (20% dei render) | 7,2 ms | 0,03 ms | 1,45 ms |
| scia 6x | 12,7 (20%) | 9,5 ms | 0,10 ms | 1,93 ms |
| misto 1x | 9,4 (13%) | 11,5 ms | 0,03 ms | 1,49 ms |
| misto 6x | 9,5 (13%) | 5,0 ms | 0,08 ms | 0,73 ms |
| tap 1x | 1 (1%) | 34 ms (pochi campioni) | 0,03 ms | 0,52 ms |

L'ipotesi regge: senza resize `render()` costa 0,03 ms. Quasi tutto il tempo
CPU del ping sta nei frame in cui il buffer viene riallocato. Upload degli
uniform, typed array nuovi a ogni frame e `getUniformLocation` (già in cache)
non pesano: sono anche nei frame senza resize.

## Cosa è cambiato

- `SubCanvas` ha l'opzione `growOnly`, usata solo da `PingLayer`. Finché il
  canvas è visibile il buffer cresce ma non si restringe. Il riquadro usato
  diventa grande quanto il buffer, contiene sempre quello dei gruppi vivi,
  resta dentro il canvas pieno e si sposta il meno possibile rispetto al
  frame prima. `place()` ritorna il riquadro usato: viewport e `u_offset`
  vengono da lì.
- Quando il canvas si nasconde (nessun ping vivo) o cambia il canvas pieno,
  la misura riparte da zero. Ogni gesto nuovo costa quindi ancora almeno un
  resize.
- `AoeShaderLayer` non cambia: le aree cambiano riquadro solo quando si
  spostano.
- Scelta: niente scissor sulla parte usata. Fuori dal riquadro vero lo
  shader del ping dà alpha 0 (uscita anticipata), e il canvas composto ha
  comunque la misura del buffer.
- Test unitari di `SubCanvas` (con canvas finto) in
  `public/shared/shader-effects.test.js`.
- `pi-measure.mjs` riporta anche resize/s e il tempo di `render()` del ping
  con e senza resize.

## Misure locali dopo

Stesse prove:

| prova | resize/s prima → dopo | render medio prima → dopo | Mpx shader/frame prima → dopo |
|---|---|---|---|
| scia 1x | 13 → 1,5 | 1,45 → 0,20 ms | 1,15 → 1,30 |
| scia 6x | 12,7 → 1,5 | 1,93 → 0,18 ms | 1,14 → 1,28 |
| misto 1x | 9,4 → 1,1 | 1,49 → 0,58 ms | 1,38 → 1,58 |
| misto 6x | 9,5 → 1,8 | 0,73 → 0,50 ms | 1,38 → 1,63 |
| tap 1x | 1 → 0,6 | 0,52 → 0,62 ms | 0,79 → 0,78 |

Il costo: i pixel elaborati e ricomposti salgono del 12-18% con scia e misto,
perché il buffer resta grande quanto il riquadro più grande dalla comparsa
dei ping. I resize rimasti sono quelli di inizio gesto e della crescita.

## Verificato

- `node tools/perf-ping/compare-visual.mjs --ref=b836bf9`: 0 pixel diversi
  oltre la tolleranza su /display e /control (tap, due tap, scia, misto, bordo,
  zoom 1,7, aree lanciate). I casi si susseguono sullo stesso layer, quindi la
  crescita del buffer viene usata (riquadro 832x480 tenuto anche per i casi
  più piccoli). Errore di posizione massimo 0,11 px su /control, sotto la
  soglia di 0,5.
- `npm test` verde (439 server, 345 editor-app, build allineata). Nessun file
  sotto `editor-app/` toccato, nessuna build da rifare.
- `pi-measure.mjs` provato in locale contro un server di prova su 3100 con
  cartelle vuote: funziona se /display è caricata con `Page.navigate`.
  Causa del vecchio «pingLayer non definito»: Chrome headless aperto
  direttamente su /display (riga di comando o `/json/new`) ha il target che
  dice /display e il documento su `about:blank`. Con `Runtime.enable` non
  cambia niente. Sul kiosk del Pi non succede.

## Non verificato

- Prove con gesti a L o rettilinei: le prove di `measure.mjs` e
  `pi-measure.mjs` sono un cerchio fisso al centro, il caso più favorevole a
  `growOnly` (vedi «Revisione»).
- Perché un resize costi 7-11 ms di CPU sulla RTX: non indagato.
- Il giudizio visivo dal vivo.

## Limiti noti

- Un gesto che attraversa la mappa tiene il buffer grande fino a quando tutti
  i ping sono sfumati. Larghezza e altezza crescono ciascuna per conto suo
  (`grownRect`): un gesto a L tiene un buffer più grande di qualunque
  riquadro usato davvero, e con ping continui può arrivare al canvas pieno.
- Il primo frame di ogni gesto rialloca comunque il buffer (canvas nascosto
  tra un gesto e l'altro).
- /control e /party usano lo stesso `PingLayer`, quindi anche lì il buffer
  cresce senza restringersi. `use-shader-loop.ts` (non cambiato) chiama
  `render()` con zero gruppi quando i ping finiscono, e la misura riparte
  (letto nel codice, non provato sul telefono).

## Misura sul Raspberry (16 nov 2026)

Kiosk vero, Tarrasque 5, TV 1920x1080, 8 s per prova con il
`pi-measure.mjs` del branch, procedura di
`docs/storia/2026-11-16-ping-veloci-display.md`. Prima = `main` (6ec316b),
dopo = `main` con lo `shader-effects.js` del branch. Il Pi è poi tornato com'era
(`b836bf9`, nessuna modifica sotto `public/`, Copertina attiva, niente porta
di debug). Temperatura 55-59 °C, `throttled=0x0`.

| prova | fps | p95 ms | ping cpu ms/frame | resize/s | cpu per resize ms | Mpx shader/frame |
|---|---|---|---|---|---|---|
| nessun ping | 35,3 → 35,0 | 83 → 91 | 0 → 0 | 0 → 0 | | 0,09 → 0,09 |
| solo tap | 26,4 → 26,2 | 133 → 127 | 3,5 → 1,9 | 0,5 → 0,3 | 177 → 233 | 0,20 → 0,20 |
| solo scia | 12,0 → 12,6 | 384 → 324 | 28,5 → 17,6 | 2,6 → 1,0 | 146 → 254 | 0,51 → 0,55 |
| misto | 9,3 → 10,9 | 441 → 412 | 58,0 → 15,1 | 5,2 → 1,1 | 140 → 181 | 0,65 → 0,69 |

Cosa dice:

- L'ipotesi regge anche sul Pi: il tempo CPU del ping sta quasi tutto nei
  frame con resize (render senza resize 0,6-0,9 ms), e ogni resize costa
  140-250 ms, non 7-11 come sulla RTX. Il branch toglie metà o più dei
  resize e il tempo CPU del ping scende di 1,6 volte (scia) e 3,8 (misto).
- Gli fps però quasi non cambiano: 12,0 → 12,6 con la scia, 9,3 → 10,9 col
  misto. Il resto del costo della scia sul Pi non è il resize. Sul Pi i resize
  sono 2,6 al secondo e non 13 come in locale, perché i frame sono pochi.
- I pixel dello shader salgono del 6-8%, non fanno danni visibili.
- Da capire (non indagato): perché un resize costi 150-250 ms sul Pi, e dove
  vada il resto del frame con la scia (canvas visibili 1,3-1,5 Mpx contro
  0,62 senza ping).

## Revisione (sessione nuova, 16 nov 2026)

Nessun problema bloccante: coordinate corrette, `compare-visual` rifatto con
esito «nessuna differenza», prova a tappeto di `grownRect`/`place` senza
violazioni, `npm test` verde. Punti aperti, non corretti:

- `grownRect` (shader-effects.js:1976-1977) fa crescere larghezza e altezza
  in modo indipendente: un gesto a L tiene un buffer più grande del
  necessario. Rimedio possibile: isteresi (restringere quando l'area usata
  scende sotto 1/4 del buffer).
- La prova «scia» è un cerchio fisso al centro, il caso migliore per
  `growOnly`: manca una prova con una scia rettilinea.
- La scia nello shader (`trailAlphaAt`) non esce in anticipo: ogni pixel in
  più del riquadro costa come un pixel della scia.
- Il commento in shader-effects.js:1936-1938 dice «7-11 ms per resize», la
  tabella locale dice 5,0-11,5 ms (sul Pi 140-250).
- La tabella «Misure locali dopo» riporta solo i Mpx dello shader, non l'area
  ricomposta.
- Nessun test unitario controlla che `PingLayer` usi il riquadro restituito
  da `place()` per viewport e `u_offset` (lo copre solo `compare-visual`,
  che non gira in `npm test`).
