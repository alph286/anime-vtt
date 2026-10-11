# /control-next: verifica di parità con /control (Task 14)

Data: 2026-10-11. Branch `control-shadcn`. Riferimento: il /control originale
(`public/control/control.js`, `index.html`, `control.css`), confrontato leggendo
il codice e i commenti, non aprendolo nel browser.

**Ambiente:** copia dei dati (`data/` e `storage/`) in una cartella temporanea,
server avviato con `PORT=3100 DATA_DIR=… STORAGE_DIR=…` e `NODE_PATH` che punta
ai node_modules del repo principale. Aperta solo `/control-next/` sulla 3100.
Nessun /display reale collegato: per avere un `displayViewport` ho aperto, dalla
pagina stessa, un client socket.io verso la MIA 3100 con `hello {role:'display'}`
e `display:viewport {1745×872}`. Viewport: 375×812 (preset mobile), un
controllo a 1000×800, poi ripristinato su desktop. A fine lavoro ho fermato il
server per PID e cancellato le copie.

Metodo: gesti veri del browser (click, trascinamenti, rotellina) dove conta il
puntatore; click via JS su bottoni semplici; esito letto da `/api/state` della
copia o dal DOM, non a occhio. Per il riquadro giallo ho ricalcolato a mano
la formula di `computeViewportScreenRect` dell'originale dentro la pagina (con
`fitRect`/`rotateVector`/`computeTotalRotation` di media.js) e l'ho confrontata
col `getBoundingClientRect` reale.

## Checklist

| Voce | Esito | Note |
|---|---|---|
| Shell: select location (lista non archiviate, valore = anteprima) | OK | Radix Select; ids, non nomi (due "Nuova location" distinte) |
| Shell: banner anteprima + "Invia al display" | OK | Invia → `activeLocationId` cambiato sulla copia, banner sparisce |
| Shell: "Annulla anteprima" | OK | torna alla location attiva |
| Shell: banner "Stai mostrando X ai giocatori" | OK | |
| Shell: pallino wifi | OK | rosso senza display, tenue (`ok`) con display collegato |
| Shell: tab Mappa/Fog/Immagini | OK | Immagini disabilitata in anteprima |
| Shell: colore della scheda attiva | **KO → corretto** | era grigio (`dark:data-[state=active]:text-foreground` di shadcn); ora ambra `#c9822c` come `.tab-btn.active`. Tolta anche la sottolineatura della variante "line", assente nell'originale (`8303b34`) |
| Layout ≥700px (1000×800) | OK | mappa a sinistra, Fog a destra, scheda Mappa nascosta |
| Mappa: immagine | OK | |
| Mappa: video (mp4) | OK | `readyState 4`, in riproduzione |
| Mappa: placeholder senza file | OK | video svuotato, placeholder visibile, AOE disabilitata |
| Mappa: rotazione 90/180/270/0 | OK | `rotate(N deg)` sul wrap; riquadro giallo identico al calcolo dell'originale a tutte e 4 le rotazioni |
| Mappa: griglia | OK | |
| Mappa: marker bussola, due posizioni | OK | `left/top` in % fuori da pan; `.pinned` in pan |
| Pan: trascinamento | OK | riquadro spostato esattamente di (+50,+20) col dito, `liveView` aggiornato |
| Pan: pad ▲▼◀▶ | OK | ±20/scale, segni come l'originale |
| Pan: zoom +/−, reset | OK | ±0.2; reset → {1,0,0} |
| Pan: Griglia (tu) −/+ | OK | cambia solo l'opacità locale dell'SVG, salvata in localStorage |
| Pan: Griglia (giocatori) −/+ | OK | `grid:update` sul server |
| Pan: occhio griglia solo per te | OK | SVG svuotato/ridisegnato, `dmGridVisible` salvato |
| Riquadro giallo solo in pan | OK | nascosto in fog/ping/zoom/aoe/nessuna |
| Fog: tap su zona | OK | `revealed` cambia sul server, overlay `revealed` |
| Fog: opacità ± | OK | 45→60→50… stessa formula di arrotondamento dell'originale |
| Fog: progresso x/y | OK | 0/1 → 1/1 |
| Fog: lista nella scheda | OK | toggle per riga |
| Fog: Nascondi tutto | OK | |
| Fog: Rivela tutto arma-poi-conferma | OK | "Click di nuovo per confermare"; conferma rivela; timeout 2,5s disarma |
| Ping: tap sonar | OK | un punto per gesto, `strokeId` |
| Ping: trascinamento scia | OK | 3 punti con lo stesso `strokeId` |
| Ping: due tap ravvicinati = due sonar | OK | `PingLayer.render` riceve gruppi `1+1` |
| Ping: disabilitato in anteprima o con immagine mostrata | OK | |
| Ping: box bussola (toggle, nudge 2%, ruota 90°) | OK | |
| Zoom locale: rotellina | OK | ±0.1, la pagina non scorre |
| Zoom locale: "Zooma sull'area dei PG" | OK | prima mai verificato nel browser; transform = valore atteso dalla formula di `zoomLocalToViewport` (scale 1.724, x 23.7, y −11.9) |
| Zoom locale: persistenza dopo reload | OK | |
| Zoom locale: mai riquadro giallo | OK | |
| Zoom locale: entrare in pan azzera | OK | localStorage conservato, come l'originale |
| AOE: 4 forme piazzate col tap | OK | nessuna selezione automatica, come l'originale |
| AOE: aggancio | OK | per ogni area l'origine salvata è un punto fisso di `snapAoeOrigin` |
| AOE: trascinamento | OK | trascinamento vero, seleziona, nessuna area nuova |
| AOE: colore / menu "···" mutuamente esclusivi | OK | Viola Cornelia → purple/purple_fire; Verde → green/null |
| AOE: taglia e larghezza | OK | lato 1,5↔3; linea 3/3 |
| AOE: elimina arma-poi-conferma | OK | anche il disarmo per cambio selezione (correzione A.1) |
| AOE: fulmine / cast | OK | contorno `stroke=none`, celle invariate (18→18); shader nel loop |
| AOE: pad di nudge | OK | frecce in direzione schermo anche a 90°, colore, taglia, FIRE/UN-FIRE |
| AOE: posizione del pad salvata e mantenuta dopo deseleziona→riseleziona | OK | drag vero della maniglia → 109,289 salvato e riapplicato |
| AOE: reattività di "Griglia (tu)" e occhio | OK | prima mai verificata nel browser |
| Immagini: miniature, dettaglio | OK | |
| Immagini: Mostra / Ritorna alla mappa | OK | Ritorna disabilitato senza immagine mostrata, come l'originale |
| Immagini: Invia (Telegram) | OK (solo stato) | disabilitato senza destinazione; mai premuto |
| Audio | OK | play/pausa/stop, volume, traccia speciale; box nascosto su una location senza audio |
| Zero location / stato senza location | OK | seconda copia con `locations: []` sulla stessa 3100: shell, placeholder, box pan/fog/zoom senza errori in console |
| `state:update` remoto durante un trascinamento AOE | OK | un client socket ha cambiato colore della stessa area e spostato un'altra a metà gesto: il drag ha continuato |
| Console | OK | tab nuova: nessun messaggio, nemmeno dopo aver attraversato tutte le modalità. La prima tab mostrava solo `ERR_CONNECTION_REFUSED` già presenti prima (tutte le risorse della pagina erano 200/304), come nel Task 11 |

## Correzioni (Parte A, minori rimandati)

- `f8dc4ee` la selezione cambiata da fuori la lista disarma l'elimina AOE (+ test
  "riscegliere la voce ··· senza selezione").
- `c96060d` il pad di nudge salva la posizione se si nasconde a metà trascinamento.
- `7c64e97` `AudioPlayState` è un'unione vera.
- `2073082` test: casi a 90° calcolati a mano per `computeViewportScreenRect` e
  `panDeltaForDrag`, pad ▶▼, zoom minimo 0.2, drag AOE afferrato lontano
  dall'origine, tap su overlay che non piazza, pinch→drag e pointercancel.

## Non verificato a mano

- Pinch vero a due dita su un touch screen (solo test unitari e rotellina).
- Selettore colore nativo: /control non ne ha.
- Resa visiva fine degli shader (sonar, scia, fiamme): verificato solo che il loop
  riceva i gruppi e le aree giuste, non l'aspetto.
- Invio Telegram reale (mai premuto "Invia").
- Riproduzione audio udibile: verificato solo lo stato sul server.
- Confronto affiancato con il /control originale: per regola non l'ho aperto;
  il confronto è col codice.

## Notato, non corretto

- Due click sintetici sullo stesso stepper nello stesso task JS (es. opacità fog)
  leggono il valore del render precedente. Un utente non ci arriva: due tap veri
  sono eventi separati con un render in mezzo.
