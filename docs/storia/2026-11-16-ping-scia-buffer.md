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

## Indagine sul Pi (16 nov 2026, pomeriggio)

Solo indagine, codice di produzione non toccato. Kiosk vero (Pi 4, V3D 4.2,
Chromium 149, TV 1920x1080 a dpr 1), Tarrasque 5, sul Pi lo
`shader-effects.js` del branch e il `display.js` di `main` come nella misura
del mattino. Temperatura 59-71 °C, `throttled=0x0` in tutte le prove. Il Pi
è poi tornato com'era (`b836bf9`, `git status` senza modifiche sotto
`public/`, Copertina attiva, niente porta di debug, tunnel chiuso).

Strumenti nuovi in `tools/perf-ping/`: `pi-probe.mjs` (prove A/B: una
variante cambia una cosa nella pagina via `Runtime.evaluate`, misura fps,
tempo CPU del ping e CPU per thread letta da `/proc` sul Pi), `pi-trace.mjs`
(trace CDP con riassunto per thread, fasi dei frame e finestre attorno ai
resize), `pi-resize.mjs` (micro-prova del resize di un canvas WebGL2 nuovo),
`cdp-lib.mjs` (pezzi comuni). Il contesto del ping risulta
`antialias: true` (4 campioni), `depth: true`, `preserveDrawingBuffer: false`.
La mappa è un `webm` 1650x1254.

### Prove A/B (scia in cerchio, 8 s ciascuna)

| variante | cosa cambia | fps | p95 ms | Mpx ping/frame |
|---|---|---|---|---|
| nessun ping | | 34,7-36,3 | 85-101 | 0 |
| base | scia vera | 11,5-12,3 | 250-370 | 0,47 |
| flat | shader del ping a colore costante | 22,4-22,5 | 150-164 | 0,48 |
| hidden | canvas disegnato ma `visibility: hidden` | 12,8 | 434 | 0,50 |
| full | buffer sempre a tutta mappa, zero resize | 6,3 | 466 | 1,57 |
| full-flat | come full, shader a colore costante | 18,6 | 183 | 1,50 |
| full-clear | come full, solo `clear` | 18,5 | 188 | 1,51 |
| full-seg4 | come full, gruppi tagliati a 4 punti | 11,6 | 383 | 1,53 |
| small | scia di raggio 5% invece di 25% | 21,9 | 167 | 0,10 |
| cull | shader vero + test sul riquadro del segmento prima di `distToSegmentT` | 12,5 | 333 | 0,46 |
| half | buffer del ping a mezza risoluzione | 19,1-19,6 | 171-199 | 0,13 |
| noaa | contesto del ping con `antialias: false` | 12,9 | 233 | 0,49 |
| noaa-half | entrambe | 19,0-20,0 | 194-196 | 0,13 |
| base-novideo | scia, video in pausa | 13,1 | 193 | 0,46 |
| novideo | niente ping, video in pausa | 56,0 | 24 | 0 |
| extra-aa | niente ping, un canvas WebGL in più a tutto schermo ridisegnato a ogni frame | 18,0 | 183 | |
| extra-noaa | come sopra con `antialias: false` | 23,5 | 136 | |

CPU per thread durante la scia (da `/proc`, % di un core): main del renderer
6-11, processo GPU 12-20 in tutto, decodifica del video (CodecWorker +
ThreadPool) ~105 con o senza ping. Nessun thread è saturo.

### Trace (4 s ciascuno)

- `CrGpuMain` (main del processo GPU) occupato 84-94% del tempo in tutte le
  prove, anche senza ping (85%), ma con 12-20% di CPU: è fermo ad aspettare la
  GPU (V3D). Il tempo finisce nella chiamata che incontra l'attesa: con il
  video `RasterDecoderImpl::DoWritePixelsYUVINTERNAL` (caricamento dei frame
  del video, 680-716 ms/s, fino a 312 ms per chiamata), senza video `WebGL`
  (623 ms/s).
- `CrRendererMain` 12-19%; i frame lunghi (fino a 404 ms) sono callback di
  rAF che contengono `CommandBufferHelper::Finish` (vedi sotto).

### Cosa dice

1. **Il resto del frame è tempo GPU, non CPU.** La V3D è già quasi satura
   senza ping (video + shader della mappa) e la scia aggiunge: (a) lo shader
   della scia, ~40 ms per frame a 0,47 Mpx (base 11,8 contro flat 22,5 fps),
   cioè ~70-85 ns per pixel, quasi tutto nel ciclo sui segmenti (a tutta mappa
   4 punti invece di ~25 portano da 6,3 a 11,6 fps; il test sul riquadro del
   segmento invece quasi niente, 11,5 → 12,5: costa l'iterazione, non il
   calcolo della distanza); (b) un layer WebGL in più ripresentato a ogni
   frame, ~16 ms a 0,47 Mpx e ~26 ms a tutta mappa (full-clear, extra-aa),
   di cui con `antialias: false` si risparmiano ~13 ms solo quando il canvas
   è grande (extra-noaa 23,5 contro 18,0; sul ping a 0,47 Mpx 12,9 contro
   11,9, dentro il rumore). Non è la composizione del canvas del ping
   (`hidden` 12,8, non cambia) né il video (13,1 senza, non cambia per la
   scia; costa invece 35 → 56 fps senza ping) né la CPU o il GC.
2. **I p95 da 300-400 ms sono i frame con resize.** A ~12 fps con 1,4-2
   resize al secondo un frame su 6-8 ne contiene uno.
3. **Il resize costa perché è sincrono con una GPU in ritardo.** Nelle
   finestre `performance.measure` attorno al setter di `width`/`height` il
   main del renderer passa il 99% del tempo in `CommandBufferHelper::Finish`
   → `WaitForGetOffset`, chiamato da `GLES2::GetGLError` e
   `CheckFramebufferStatus` (controlli sincroni di Blink sul nuovo drawing
   buffer): aspetta che il processo GPU esegua tutto quello che ha in coda, e
   il processo GPU è a sua volta fermo dietro la V3D (`DoWritePixelsYUV` del
   video 48 ms per finestra, `WebGL` 13-35 ms). L'allocazione vera
   (`SharedImageStub::OnCreateSharedImage`) pesa 2-4 ms per finestra. Niente
   programmi o texture ricreati. Finestre da 6 a 296 ms (media 85 con il
   video, 65 senza): il costo è l'attesa della coda, non la dimensione. Sulla
   RTX la stessa attesa è breve perché la coda si svuota subito (non misurato
   oggi, è la spiegazione coerente con i 7-11 ms).

### Non verificato o incerto

- La micro-prova di `pi-resize.mjs` (12 resize per configurazione) è
  rumorosa: media molto sopra la mediana. Indica `antialias: false` più
  economico (setter 27 contro 86 ms senza ping, 75 contro 130 con la scia) e
  poca dipendenza dalla dimensione (300x200 53 ms, 1900x1060 106 ms senza
  ping), ma con questi campioni non lo do per misurato.
- Che il costo del ciclo sui segmenti venga dalla lettura di `u_points[]` con
  indice dinamico (sulla V3D passa dalla TMU) è un'ipotesi: non misurata.
- Le combinazioni di rimedi (buffer fisso a mezza risoluzione, meno punti,
  `antialias: false` su tutti i layer) non sono state provate insieme, e la
  resa visiva della mezza risoluzione va giudicata da Alph dal vivo.

### Rimedi possibili (non applicati), per guadagno atteso

1. Buffer del ping a mezza risoluzione: 11,9 → 19,6-20 fps misurati, p95
   ~190 ms. Rischio: resa più morbida della scia, da vedere sulla TV.
2. Niente resize mentre i ping sono vivi: buffer allocato una volta (meglio
   se a mezza risoluzione, ~0,4 Mpx a tutta mappa) e disegno limitato al
   riquadro con `gl.scissor`/`viewport`. Toglie i frame da 100-300 ms (il p95)
   ma il layer grande costa ~26 ms a frame a piena risoluzione (full-clear):
   solo insieme al punto 1. In alternativa passi di crescita molto più
   larghi (meno resize). Rischio basso-medio.
3. Meno iterazioni per pixel: meno punti per gesto su /display
   (semplificare la polilinea a 8-12 punti) o geometria per segmento invece
   del triangolo a tutto schermo. Guadagno forte a tutta mappa (6,3 → 11,6
   con 4 punti); la seconda è una riscrittura, rischio più alto.
4. `antialias: false` (e `depth: false`) nei contesti di ping, shader e aree
   d'effetto: per un triangolo a tutto schermo l'MSAA non cambia i pixel.
   Guadagno ~13 ms a frame per un layer a tutto schermo, quasi nullo per il
   ping piccolo. Rischio basso.
5. Fuori dal ping: il video della mappa decodificato in software (~1 core) e
   caricato a ogni frame toglie da solo 35 → 56 fps. Una mappa video più
   piccola o in un formato decodificato in hardware aiuterebbe tutto; non
   provato.

## Metà risoluzione e contesti senza MSAA (16 nov 2026, commit f11205e)

Dai rimedi dell'indagine, applicati i due a rischio più basso:

- `PingLayer(canvas, { resolution: 0.5 })` solo su /display: il buffer è
  metà per lato e il CSS lo stira sullo stesso riquadro. Lo shader riceve
  `u_bufScale` (px del canvas pieno per px del buffer) e lavora sempre in px
  del canvas pieno. /control e /party restano a 1.
- `antialias:false, depth:false` su tutti e tre i contesti (`GL_CONTEXT_OPTS`):
  si disegna sempre un solo triangolo a tutto schermo, senza depth test.

Verificato:

- `npm test` verde (440 server, 345 editor-app, build allineata), test nuovo
  di `SubCanvas` con `resolution`.
- `compare-visual --ref=b836bf9` con risoluzione 1: nessuna differenza su
  /display e /control, quindi togliere MSAA e depth non cambia i pixel.
- Con risoluzione 0,5 (copia temporanea dello script): in tutti i casi pixel
  accesi e somma dell'alpha esattamente 1/4 di prima, errore di posizione 0.
  È la stessa immagine a risoluzione ridotta. Non misura la morbidezza.

Misura sul Pi (stessa procedura, Pi poi ripristinato a `b836bf9`, Copertina
attiva, niente porta di debug, tunnel chiuso; 55 °C, `throttled=0x0`):

| prova | fps main → growOnly → mezza | p95 ms | ping cpu ms/frame |
|---|---|---|---|
| nessun ping | 35,3 → 35,0 → 36,8 | 83 → 91 → 91 | 0 |
| solo tap | 26,4 → 26,2 → 27,1 | 133 → 127 → 116 | 3,5 → 1,9 → 1,8 |
| solo scia | 12,0 → 12,6 → 20,6 | 384 → 324 → 150 | 28,5 → 17,6 → 4,5 |
| misto | 9,3 → 10,9 → 19,5 | 441 → 412 → 201 | 58 → 15 → 8,3 |

Il costo di un resize scende a 57-79 ms (la coda della GPU è più corta).

Non verificato: la resa della scia a metà risoluzione sulla TV (più morbida),
da giudicare dal vivo. Restano aperti gli altri rimedi dell'indagine (scissor
su buffer fisso, meno punti per la scia, video della mappa più leggero).
