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

- Gli fps e il tempo di `render()` sul Pi: la misura la fa Alph. File da
  copiare sul Pi: `public/shared/shader-effects.js` (l'unico cambiato sotto
  `public/`; `display.js` non cambia).
- Se sul Pi il 12-18% di pixel in più da comporre costa più dei resize
  risparmiati. In locale non si vede (60 fps in ogni caso).
- Perché un resize costi 7-11 ms di CPU sulla RTX: non indagato.
- Il giudizio visivo dal vivo.

## Limiti noti

- Un gesto che attraversa la mappa tiene il buffer grande fino a quando tutti
  i ping sono sfumati.
- Il primo frame di ogni gesto rialloca comunque il buffer (canvas nascosto
  tra un gesto e l'altro).
- /control e /party usano lo stesso `PingLayer`, quindi anche lì il buffer
  cresce senza restringersi. `use-shader-loop.ts` (non cambiato) chiama
  `render()` con zero gruppi quando i ping finiscono, e la misura riparte
  (letto nel codice, non provato sul telefono).
