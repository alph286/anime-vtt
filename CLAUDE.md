# Piano di lavoro

Elenco delle cose da fare sul progetto, aggiornato man mano che si procede.
Va tenuto aggiornato ad ogni sessione: spuntare i completati, aggiungere
nuovi punti quando emergono, annotare qui decisioni o vincoli scoperti
strada facendo (non solo nella chat, che si perde).

## Nuova vista /party per i giocatori (fatto, branch `party-controller`)

Nuova pagina `public/party/`, pensata per essere data in mano al tavolo
(uno smartphone a testa, o uno condiviso): **solo** visualizzazione della
mappa e pannello AOE, nessun altro controllo del DM raggiungibile da lì
(niente location-select, pan, fog editing, ping, zoom locale, audio,
immagini, link editor).

**Decisioni chiave (confermate dall'utente in chat):**
- I giocatori stessi piazzano/modificano/lanciano le proprie aree AOE
  (non sola visualizzazione di quelle del DM) — stesso pannello di
  `/control` (forme, colori, menu "···", taglia/larghezza, lista pillole
  con fulmine/elimina, pad di nudge fisso in basso a destra).
- La mappa segue l'inquadratura live condivisa di `/display` (stesso
  pan/zoom che il DM mostra sulla TV ai giocatori) — **non** la mappa
  intera come la prima versione provata in sessione (vedi sotto). Il box
  di `/party` assume la stessa proporzione dello schermo del display
  (`state.displayViewport`, note solo dopo che un `/display` si è connesso
  almeno una volta) tramite `--map-aspect`, così l'intero box è una
  replica in scala di `#viewport` su `/display`: lo stesso transform CSS
  (`translate+scale`, stessa formula di `renderMap` in `display.js`)
  applicato a un nuovo `#map-layer` (nuovo livello nella gerarchia,
  analogo a quello di `display.js` — prima mancava, il box mostrava
  sempre la mappa fit intera come l'anteprima propria di `/control`)
  mostra quindi esattamente la stessa porzione di mappa, solo più
  piccola. Gli offset del pan (`live.offsetX/Y`, in pixel dello schermo
  della TV) vengono scalati di `k = box.clientWidth / displayViewport.width`
  prima di applicarli — lo zoom (`scale`, un rapporto, non un valore in
  pixel) no. La griglia (non il contorno AOE, stessa scelta già fatta da
  `display.js`) viene compensata dividendo `lineWidth` per quello stesso
  `scale`, altrimenti si sarebbe ingrossata zoomando. **Senza
  `displayViewport` noto** (nessun `/display` mai connesso): degrada alla
  mappa intera, nessun transform — non esiste un `k` valido da applicare
  a offset in pixel di uno schermo sconosciuto. Nessuno smoothing
  dell'animazione come in `display.js` (quello ha un proprio loop rAF
  dedicato per l'interpolazione): qui uno scatto diretto ad ogni
  `state:update` è bastato, scelta deliberata per restare semplice su una
  vista secondaria di lettura.
  **Perché il cambio**: la primissima versione mostrava la mappa intera
  (ragionamento: "i giocatori devono vedere tutto il campo di battaglia
  per piazzare un cono/linea/sfera, non solo l'inquadratura scelta per la
  TV"), ma dopo averla vista live al tavolo l'utente ha chiesto
  esplicitamente il comportamento opposto: seguire l'inquadratura di
  `/display`, non la mappa intera.
- Griglia/fog/decorazioni (shader "Portale" ecc.) restano in sola lettura,
  stessa resa read-only già esistente in `display.js` (`renderFog`/
  `renderAoe` lì sono il modello diretto per le funzioni gemelle qui).
- Nessuna modifica al server oltre alla route statica
  (`app.use('/party', ...)` in `server/index.js`): gli eventi socket
  `aoe:*` erano già generici, non legati al ruolo del client (`hello` con
  `role:'party'` inviato per simmetria con control/display, ma il server
  non lo usa per nient'altro che i due contatori control/display status).
- Nessuna nozione di utente/proprietario per area: più giocatori su
  `/party` contemporaneamente condividono la stessa lista di aree, chi
  modifica/elimina per ultimo vince — stesso comportamento implicito che
  ha già oggi `/control` con un solo DM, nessun lucchetto per-utente
  aggiunto (assunzione esplicitata con l'utente, non richiesta).
- Chiave `localStorage` per la posizione del pad di nudge AOE dedicata
  (`partyAoeNudgeOverlayPos`, non quella di `/control`): stessa origine,
  pagine diverse — condividere la chiave avrebbe fatto trascinare il pad
  su un dispositivo che apre entrambe le pagine.
- Home (`public/home/index.html`) ha ora una quarta voce "Party" accanto
  a Display/Control/Editor.

**Verificato in browser** (server locale, porta 3102, dati reali del
progetto — non un fixture separato): pannello AOE e mappa si renderizzano
correttamente con un'area reale già presente (location "Taverna", un
Cono), piazzamento di una nuova area via tap, lista/eliminazione
funzionanti end-to-end sul socket vero. **Nota per sessioni future**: il
flusso arma-poi-conferma dell'eliminazione (`armedRemoveAoeId`, timeout
2,5s) richiede che i DUE click arrivino nella stessa finestra di tempo —
testando da fuori browser (tool esterni, round-trip di rete tra una
chiamata e l'altra) il timeout scade facilmente tra un click e l'altro, e
soprattutto **va ri-interrogato il DOM ad ogni click**: dopo il primo
click il pannello si ri-renderizza (`aoeChipList.innerHTML = ...`), quindi
un riferimento a un bottone preso prima del primo click è ormai un nodo
staccato dal DOM e un secondo `.click()` su di esso non fa nulla (non
bubbla a un ancestor che non ha più). Non un bug dell'app, un'insidia del
metodo di test — vedere anche la memoria di sessione
`synthetic-pointer-events-testing`.

**Incidente di test da NON ripetere**: per verificare il comportamento
"segue /display" ho aperto una SECONDA tab su `/display` nel browser di
test, mentre un display reale era connesso alla sessione live del
progetto. Il server tiene **un solo** `displayViewport` globale (non uno
per connessione — vedi `server/index.js`, variabile di modulo, non dentro
`state`): la tab di test lo ha sovrascritto con le proprie dimensioni
(1024×768) al posto di quelle vere (1745×872), sballando temporaneamente
il rettangolo di inquadratura su `/control` e il crop su `/party` per la
sessione reale in corso. Risolto chiedendo all'utente di ricaricare il
display vero (basta un reload: `reportViewport()` scatta su ogni
`connect`). **Lezione per sessioni future**: mai aprire una tab di test su
`/display` (né su `/control`, che emette `hello role:'control'`) quando
potrebbe esistere una sessione reale in corso — verificare prima se è così
(es. `display:status`/`control:status` via socket), e se serve davvero
confrontare il crop con l'inquadratura reale, farlo leggendo
`location.map.liveView`/`state.displayViewport` dallo stato (sola
lettura) invece di connettersi come un client display/control vero.

## Box sotto la mappa: contenuto diverso per modalità (fatto)

Oggi alcuni controlli vivono sopra la mappa, altri in una sezione fissa
"Controlli" sempre visibile indipendentemente dalla modalità. Si vuole
invece un box SOTTO la mappa che cambia contenuto a seconda della modalità
attiva (pan / fog / ping / zoom / aoe). Ordine di lavoro concordato:
1 → 2 → 3 → 4 → 5, una alla volta.

- [x] **1. Movimento visuale PG** (oggi "pan mode") — il pad di controllo
      (quello già in "Controlli"), più **due** opacità griglia separate:
      una per la vista del DM su `/control`, una per quella dei giocatori
      su `/display` (oggi è un solo valore condiviso: va sdoppiato in due
      campi). Più un attiva/disattiva griglia che vale **solo** per la
      vista del DM (i giocatori restano secondo l'impostazione condivisa,
      indipendente da questo toggle).
      **Fatto:** `pan-zoom-section` ("Controlli") ora è visibile solo in
      modalità pan (`renderPanSection()` in control.js, chiamata sia da
      `render()` che da `setMode()`). "Griglia (giocatori)" resta il campo
      condiviso esistente (`grid.opacity`, socket `grid:update`, invariato
      per `/display`). "Griglia (tu)" e il toggle "visibile solo per te"
      sono nuovi, puramente client-side (localStorage: `dmGridOpacity`,
      `dmGridVisible`), applicati solo al render della griglia
      nell'anteprima del DM (`renderGrid()`), mai inviati al server — scelta
      confermata dall'utente per non trattarli come dati di gioco
      condivisi. Il vecchio `grid-opacity-row` è stato tolto dalla sezione
      "Opacità" generica (ora contiene solo il Fog, in attesa del punto 2).
- [x] **2. Fog of war** — opacità fog (già esiste, va spostata qui sotto
      la mappa). Sotto, una percentuale di completamento ("11/18") con
      barra di progresso, calcolata su zone rivelate / totale zone del
      location corrente.
      **Fatto:** `opacity-section` (ormai vuota dopo il punto 1) sostituita
      da `fog-section`, visibile solo in modalità fog (`renderFogSection()`
      in control.js, chiamata da `render()` e `setMode()` come
      `renderPanSection()`). Opacità fog invariata: resta locale al DM, solo
      di sessione (nessuna persistenza aggiunta — scelta confermata
      dall'utente, per non rompere il comportamento attuale). La riga di
      completamento (frazione + barra) si nasconde quando la location non
      ha zone fog definite (`polygons.length === 0`); il tab "Fog" in basso
      con lista zone e bulk reveal/hide resta invariato, fuori scope.
- [x] **3. Ping** — la bussola/rosa dei venti si sposta qui (oggi vive
      nella sezione di "movimento visuale"/pan). Nuovo: tap-e-trascina per
      lasciare una scia dietro al ping. Il ping stesso diventa uno shader
      (riusando la pipeline `ShaderLayer` già usata per le decorazioni
      "Portale" piazzate da `/editor`).
      **Fatto (parte 1/2):** `compass-section` ("Rosa dei venti": toggle
      visibile + pad nudge/rotazione) ora è visibile solo in modalità ping
      (`renderPingSection()` in control.js, chiamata da `render()` e
      `setMode()`, stesso pattern di `renderPanSection()`/
      `renderFogSection()`). Scelta confermata dall'utente: i controlli
      bussola sono ora raggiungibili solo quando ping stesso è disponibile
      (location attiva, non in anteprima di un'altra, nessuna immagine
      mostrata) — prima erano sempre raggiungibili. Gating sicuro perché
      `pingModeToggle` si disabilita/forza l'uscita solo per condizioni
      transitorie e recuperabili, non per un dato che potrebbe non arrivare
      mai (a differenza del bug di `displayViewport` risolto sopra).
      **Fatto (parte 2/2):** tap-e-trascina ora lascia una scia continua
      che si consuma dalla coda; niente più soglia-annulla-ping oltre 8px
      (quella soglia è ora il trigger della scia, non uno scarto). Il ping
      stesso è diventato uno shader: NON la pipeline `ShaderLayer` delle
      decorazioni persistite (quella disegna un rettangolo fisso per
      decorazione, un gesto effimero senza rettangolo non ci si adatta) ma
      una classe gemella dedicata, `PingLayer` (`public/shared/shader-effects.js`),
      che riusa solo le funzioni di compilazione/link condivise: un solo
      pass a schermo intero per frame, che calcola per ogni pixel la
      distanza al segmento di scia più vicino e un'opacità che segue l'età
      di quel punto. Canvas dedicato `#map-ping-canvas`, ultimo figlio di
      `#map-fit-box` in entrambe le pagine (stessa posizione del vecchio
      `#ping-marker` CSS che sostituisce, rimosso insieme alla sua
      animazione). **Zero modifiche al server**: stesso evento `ping:show`,
      stesso payload — un tap emette un punto, un trascinamento ne emette
      tanti (soglia di distanza minima lato client per non floodare); il
      relay `io.emit` broadcasta già al mittente stesso, quindi lo stesso
      meccanismo mostra ora il ping anche sulla propria anteprima
      `/control` (scelta confermata dall'utente: prima il DM non vedeva
      nulla, solo i giocatori). Punti con lifespan fisso (1,2s) indipendente
      dal trascinamento in corso: un tap fermo è "gratis" una scia di un
      solo punto, stesso comportamento di prima. Stesso loop
      `requestAnimationFrame` già usato per il Portale (`kickShaderLoop`/
      `stepShaderLayer`), esteso a considerare anche i punti ping vivi.
      Verificato in browser con un drag reale (non sintetico: un
      `PointerEvent` costruito a mano fa fallire `setPointerCapture` con
      `NotFoundError` per mancanza di un pointer attivo reale, falso
      allarme isolato durante i test, non un bug — confermato riproducendo
      con un drag vero dello strumento browser).
      **Affinamento visivo (stessa sessione, su richiesta dell'utente):**
      il tap fermo (singolo punto, `u_pointCount == 1` in
      `PING_FRAGMENT_SRC`) non usa più il bagliore piatto a distanza fissa
      della scia, ma un anello "radar ping" (formula trovata dall'utente su
      Shadertoy, adattata: l'"orologio" è l'età del punto invece del loop
      infinito `mod(iTime,...)` dell'originale, un solo anello che si
      espande una volta e sfuma invece di una scansione radar continua a 3
      copie sfalsate) con un crackle da rumore sul raggio e sull'intensità
      per lo "sfrigolamento" richiesto, stesso linguaggio visivo del
      Portale (stesso campionamento a texture `noise(x){texture(u_noise,
      x*.01).x}`, non hash). `PingLayer` ha ora una propria texture di
      rumore (`ensureNoiseTexture()`, copia di quella di `ShaderLayer` --
      non condivisibile, contesti WebGL separati su due canvas distinti).
      La scia a più punti (trascinamento) resta invariata, fuori scope di
      questa richiesta. Verificato via lettura diretta dei pixel del
      canvas (`gl.readPixels`) a età diverse: quasi invisibile ad età 0
      (il raggio parte da 0, comportamento corretto per un anello che si
      espande), ben visibile e con contorno visibilmente irregolare/vivo a
      metà vita (età 0.5-0.9s su un lifespan di 1,2s).
      **Ritocco (stessa sessione, su richiesta dell'utente):** 3 richieste
      — colore blu "stile Portale" invece dell'accent (nuovo uniform
      `u_ringColor`/costante `PING_RING_COLOR_RGB` in shader-effects.js,
      fisso, non letto da CSS come `u_color` perché non è un token di
      tema ma una scelta propria dell'effetto), anelli più spessi
      (`RING_INNER_TAIL_FRAC` 0.10→0.24, `RING_FRONTIER_FRAC`
      0.012→0.03), e 3 anelli concentrici per tap invece di uno. I 3
      anelli condividono la stessa età (non sfalsati nel tempo, che li
      avrebbe fatti partire in momenti diversi): sono sfalsati nel
      RAGGIO, ognuno richiamando la stessa funzione `ringAt()` con
      `time - i*RING_GAP_FRAC*u_fadeDistance` (increspature concentriche
      che si espandono insieme, non una scansione radar a fasi come
      l'originale Shadertoy). La scia a più punti resta col colore accent
      di prima, fuori scope. Verificato: il raggio misurato via
      `gl.readPixels` cresce correttamente con l'età (6px a 0.1s → 42px a
      1.1s, su un `u_fadeDistance` di 45px), colore in uscita confermato
      sul canale blu dominante, nessun errore/warning di compilazione né
      su /control né su /display.
      **Secondo ritocco (stessa sessione, su richiesta dell'utente,
      verificato SENZA screenshot -- solo compile-check, il giudizio
      visivo lo fa l'utente dal vivo):** crackle ridotto e rallentato
      (`RING_CRACKLE_FRAC` 0.08→0.04; frequenza temporale del crepitio
      sul raggio `age*6.0`→`age*2.5`, del flicker `age*7.8`→`age*3.0` --
      solo le frequenze TEMPORALI, non quelle spaziali su `angle`, che
      controllano quante increspature lungo il contorno, non la
      velocità). Colore non più piatto: `u_ringColor` ora è la base a
      bassa energia, con un `mix()` verso il bianco dove l'energia
      (`ring * flicker`) supera `RING_WHITE_CORE_LOW`/`HIGH` (0.55/0.95)
      -- stesso effetto "nucleo bianco, bordo blu" del Portale, ottenuto
      con un mix esplicito invece di dividere un colore per un `rz`
      piccolo (quello che fa in realtà `portalFragmentSrc`): stesso
      risultato percepito, senza il rischio di dividere per quasi-zero.
      Taglia +30% (`PING_RING_SIZE_PCT` da 45*1,3px fissi a 0,113 della
      larghezza del canvas, vedi sotto il perché del cambio di unità) ed
      easing ease-out quadratico sulla velocità di espansione degli
      anelli (`time` non più lineare in age, parte veloce e decelera).
      **Terzo ritocco (stessa sessione):** l'utente segnalava il ping
      "ancora piccolo" su /display nonostante la taglia fosse identica a
      /control -- causa reale: `u_fadeDistance` era in px CSS fissi
      (`45*1.3*dpr`), ma /control e /display hanno canvas di risoluzione
      molto diversa (telefono del DM vs TV/monitor dei giocatori), quindi
      lo stesso valore fisso occupa una frazione diversa dello schermo.
      Cambiato in percentuale della larghezza del canvas
      (`PING_RING_SIZE_PCT = 0.113`, calibrato per coincidere con la
      taglia già approvata su /control, dove canvas.width≈516px: 0,113×
      516≈58,3px, prima era 45×1,3=58,5px fissi) -- ora la taglia APPARENTE
      è coerente su schermi di risoluzione diversa. Aggiunta anche la
      compensazione per lo zoom che già esiste per griglia/contorno AOE,
      mai estesa al ping: `PingLayer.render()` accetta ora un 4° parametro
      `zoomScale` (su /control `localZoom.scale`, lo zoom locale del DM;
      su /display `displayedView.scale`, il pan/zoom condiviso coi
      giocatori) per cui `u_fadeDistance` e `u_lineWidth` vengono divisi
      -- senza, zoomare avrebbe cambiato anche la taglia del ping, non
      solo quella già compensata di griglia/AOE. Verificato SENZA
      screenshot (richiesta esplicita dell'utente, il giudizio visivo
      resta suo): solo compile-check su /control e /display, nessun
      errore/warning.
      **Quarto ritocco (stessa sessione):** l'anello spariva di colpo a
      fine vita invece di sfumare -- causa: l'unico fade esistente era
      quello spaziale in `ringAt()` (`ring * smoothstep(u_fadeDistance,
      0, r)`, un vignette sul raggio), che per costruzione coincide quasi
      esattamente col momento in cui l'anello guida raggiunge il raggio
      massimo a fine vita, risultando in un cutoff netto invece di una
      sfumatura temporale. Aggiunto un fade esplicito sull'ETÀ
      (`lifeFade`), indipendente dalla posizione: piena intensità per il
      70% della vita (`RING_LIFE_FADE_START = 0.7`), poi sfuma a 0 negli
      ultimi 30%. Verificato numericamente (non visivamente) via
      `gl.readPixels` a età crescenti: picco di alpha 235→190→99→31→0,
      calo continuo senza salti, a differenza del comportamento precedente.
      **Quinto ritocco (stessa sessione) -- bug reale, non un refinement
      cosmetico:** due tap ravvicinati (entrambi ancora vivi entro
      `PING_LIFESPAN_SEC`) finivano nello stesso `pingPoints` piatto, e lo
      shader (che decideva sonar-vs-scia solo da `u_pointCount`) li
      disegnava come UN trascinamento che li collega con una scia color
      accent, bloccando l'animazione del sonar precedente. Causa: nessun
      concetto di "a quale gesto appartiene questo punto" da nessuna
      parte, né lato client né nel payload del socket. Risolto con un
      `strokeId` per gesto (generato una volta per `pointerdown`,
      riusato per tutti i punti di quel tap/trascinamento fino a
      `pointerup`/`pointercancel`): nuovo campo nel payload `ping:show`
      (server/index.js fa solo passthrough, zero validazione di
      formato -- è un id opaco consumato solo dal client), raggruppamento
      lato client via `groupPingPointsByStroke()` (nuova funzione
      condivisa in shader-effects.js) prima di passare i punti allo
      shader. Lo shader stesso ha dovuto cambiare struttura dati: non più
      una lista piatta + `u_pointCount`, ma `u_groupStart[8]`/
      `u_groupCount[8]`/`u_groupTotal` che indicizzano nello stesso
      `u_points`/`u_ages` piatto di prima -- un gruppo da 1 punto è un
      sonar (`sonarAlphaAt()`), un gruppo con più punti è una scia
      (`trailAlphaAt()`), ogni gruppo indipendente, si tiene il
      contributo più luminoso pixel per pixel (`max`) invece di sommarli.
      `PingLayer.render()` ora accetta `groups` (array di array) invece
      di un array piatto di punti. **Nota operativa per sessioni future:**
      durante la verifica di questo fix il server locale di questo
      worktree (porta 3101, avviato con `node --watch` da una sessione
      precedente) risultava SERVIRE CODICE VECCHIO nonostante `--watch` e
      nonostante `server/index.js` fosse stato modificato dopo l'avvio
      del processo (verificato confrontando `stat` del file col momento
      di avvio del processo) -- `--watch` non ha riavviato da solo in
      questo sandbox. Riavviato manualmente (`PORT=3101 node --watch
      server/index.js`, **non** `preview_start`: quel tool in questo
      progetto lancia da cwd sbagliata, la repo principale invece di
      questo worktree -- già capitato una volta in questa sessione).
      Verificato end-to-end con tap reali (non sintetici) attraverso il
      socket vero: due tap ravvicinati → 2 gruppi da 1 punto ciascuno
      (sonar indipendenti); un trascinamento reale → 1 gruppo da 3 punti
      (scia unica). Nessun errore in console.
      **Sesto ritocco (stessa sessione) -- scia rifatta "a stella
      cometa":** prima era un bagliore piatto a colore accent, spessore
      costante lungo tutto il tracciato -- sostituita con lo stesso mood
      del Portale rosso. `trailAlphaAt()` ora: (1) interpola l'età tra i
      due estremi del segmento più vicino (nuova `distToSegmentT()`,
      restituisce anche il parametro lungo il segmento, non solo la
      distanza) invece di un min secco tra le due età, per una
      transizione continua lungo la coda; (2) la LARGHEZZA si assottiglia
      con l'età (`mix(u_lineWidth, u_lineWidth*TRAIL_TAIL_WIDTH_FRAC,
      eased)`, stesso easing ease-out del sonar) -- testa spessa, coda
      sottile, l'"effetto cometa" richiesto; (3) stesso `crackleFbm()` del
      sonar applicato al bordo (non più una linea pulita); (4) nucleo
      bianco nel punto di massima energia via `mix()` verso il bianco,
      ma qui l'energia usata per il colore è smorzata con `(1-eased)`
      (`colorEnergy`, diversa da quella usata per l'alpha) -- SENZA
      questo smorzamento il nucleo bianco appariva anche sul centro della
      coda (campionando esattamente la linea centrale, `glow` tocca 1 lì
      pure, anche se la coda è sottilissima e quasi spenta): scoperto e
      corretto verificando i pixel via `gl.readPixels`, non "a occhio".
      Nuovo colore fisso `PING_TRAIL_COLOR_RGB` (rosso, non più
      derivato da `--accent`) -- rimossi di conseguenza `u_color`,
      `PING_COLOR_RGB` e `hexColorToRgb01()` (diventati inutilizzati:
      sia il sonar che la scia hanno ora un colore fisso proprio
      dell'effetto, non più legato al tema). `PingLayer.render()` ha
      perso il parametro `colorRgb` (firma: `(groups, lifespanSec,
      zoomScale)`). Verificato via `gl.readPixels` su un gruppo-scia di 2
      punti (età 0,02 e 1,1): testa larga 13px colore (0.98,0.85,0.83)
      (quasi bianco, leggera tinta rossa), coda larga 3px colore
      (0.92,0.17,0.08) (rosso puro, combacia con `PING_TRAIL_COLOR_RGB`)
      -- rapporto larghezze ~0,23, vicino al 0,25 atteso. Nessun
      errore/warning di compilazione.
      **Settimo ritocco (stessa sessione):** due richieste -- più spessa
      ovunque (larghezza base `u_lineWidth` in `PingLayer.render()` da
      7 a 13px, stesso rapporto testa/coda 0,25 quindi tutto scala
      insieme), e un bug reale segnalato dall'utente: girando con la
      scia appariva uno spigolo visibile invece di una curva, proprio nei
      punti dove cambia direzione. Diagnosi: NON la geometria della linea
      (quella è già una SDF-capsula per segmento con estremità tonde, il
      minimo tra segmenti consecutivi è già l'unione corretta -- doveva
      essere morbida di suo) ma il crackle, campionato usando la
      DIREZIONE del segmento più vicino (`segAngle`): esattamente nei
      punti dove il "segmento più vicino" passa dall'uno all'altro,
      quella direzione salta di colpo, producendo un salto visibile nel
      rumore proprio lì. L'utente aveva proposto di sovrapporre un
      secondo trail con un fade come soluzione; spiegato perché non
      avrebbe funzionato (è un problema di continuità geometrica/di
      campionamento in un punto preciso, non di opacità nel tempo) e
      proposto invece di campionare il crackle sulla posizione a schermo
      del pixel (`p.x`/`p.y`) invece che su `segAngle` -- lo stesso punto
      fisico ottiene così sempre lo stesso rumore a prescindere da quale
      segmento lo rivendica come più vicino, eliminando il salto alla
      radice. `segAngle` rimosso del tutto (non serviva più a nient'altro).
      Verificato: compila senza errori/warning, spessore misurato via
      `gl.readPixels` raddoppiato circa come atteso (13px→22px in testa,
      3px→5px in coda) con gli stessi colori di prima. La fluidità delle
      curve non è verificabile a pixel isolati con sicurezza totale --
      giudizio visivo dal vivo rimandato all'utente, come da sua richiesta
      di non fare più screenshot per gli shader.
- [x] **4. Zoom** — **rimuovere** lo zoom automatico all'ingresso in
      modalità zoom (implementato in una sessione precedente, va disfatto:
      vedi `zoomLocalToViewport()` chiamata da `setMode` in
      `public/control/control.js`). Al suo posto: un box con un pulsante
      "Zooma sull'area dei PG" che lancia la stessa funzione a comando,
      non più in automatico. Stato e posizione dello zoom locale
      persistono **anche tra un reload e l'altro** (localStorage, come già
      fatto per la posizione del pad AOE — confermato dall'utente). Il
      riquadro giallo che mostra l'inquadratura PG (`#viewport-rect`) deve
      vedersi **solo** in modalità "movimento visuale" (ed entrando lì lo
      zoom locale si azzera per mostrare la mappa intera); **mai** in
      modalità zoom.
      **Fatto:** `setMode()` non chiama più `zoomLocalToViewport()`
      all'ingresso in zoom; nuova `zoom-section` ("Zoom locale", solo
      pulsante "Zooma sull'area dei PG") visibile solo in quella modalità
      (`renderZoomSection()`, stesso pattern delle altre sezioni). Lo stato
      dello zoom locale (`localZoom: {scale, x, y}`) si legge/scrive ora da
      localStorage (`zoomLocalState`) — ma SOLO sui cambi espliciti
      dell'utente (fine drag/pinch, rotellina, click sul pulsante):
      un reset programmatico (cambio location, ingresso in pan) azzera lo
      stato live ma non lo storage, così lo zoom scelto resta lì per il
      prossimo ingresso in modalità zoom invece di perdersi. Al primo
      caricamento lo stato ripristinato va applicato solo dopo che
      `#map-preview` ha dimensioni reali, altrimenti il clamp non avrebbe
      senso: fatto con un guard one-shot (`applyRestoredLocalZoomOnce()`)
      richiamato dalla fine di `renderMapPreview()`. `updateViewportRect()`
      ora nasconde il riquadro giallo a prescindere dai dati disponibili se
      `currentMode !== 'pan'` (prima lo mostrava in qualunque modalità, non
      solo pan); dato che la visibilità dipende ora anche dalla modalità e
      non solo dallo stato del server, `setMode()` richiama esplicitamente
      `updateViewportRect()` ad ogni cambio modalità (altrimenti uscire da
      pan senza un round-trip col server lo avrebbe lasciato visibile).
      Entrare in pan da un'altra modalità chiama `resetLocalZoom()` (stesso
      effetto già usato per il cambio location), per mostrare la mappa
      intera dietro al riquadro giallo. Verificato in browser: toggle zoom
      non zooma più da solo, il pulsante zooma a comando, lo stato
      sopravvive a un reload, il riquadro giallo appare solo in pan e non
      in zoom.
- [x] **5. AOE** — il box che oggi sta sopra la mappa (`#aoe-panel`: forme,
      colori, taglia, lista aree) si sposta sotto, come gli altri quattro.
      **Fatto:** spostato in `index.html` dopo `zoom-section` (prima di
      `audio-section`), stesso ordine "sotto la mappa" delle altre
      quattro sezioni. Era già mode-gated correttamente da una sessione
      precedente (`renderAoePanel()`: `aoePanel.hidden = currentMode !==
      'aoe'`, già richiamata da `render()` e `setMode()`) — qui si è
      trattato solo di spostamento HTML, nessuna logica JS toccata. Il pad
      di nudge (`#aoe-nudge-overlay`, `position: fixed`, pinnato in basso a
      destra) resta altrove nel DOM e non dipende dalla posizione del box,
      quindi non impattato. Nessuna regola CSS dipendeva dall'ordine/
      posizione di `#aoe-panel` nel DOM. Verificato in browser: in
      modalità AOE il box ora appare sotto la mappa; piazzamento area,
      selezione chip, pad di nudge e doppia conferma elimina funzionano
      come prima.

**Prerequisito per il punto 3, già fatto:** anteprima mappa del DM su
`/control` ora mostra un marker della bussola (`#map-compass-marker`,
`renderMapCompassMarker()` in control.js), cosa che prima non esisteva
affatto (solo il pad di nudge alla cieca, nessun feedback visivo). In tutte
le modalità tranne pan è posizionato a `compass.x%`/`compass.y%` dello
stesso tipo di contenitore "a schermo intero" che usa `/display` per il
proprio `#compass` (non lo spazio locale della mappa: resta stabile anche
con lo zoom locale del DM) — stessa identica posizione vista dai giocatori,
confermato confrontando le coordinate reali tra le due pagine. In modalità
pan si fissa invece in basso a destra del viewport (classe `.pinned`,
`right`/`bottom` fissi anziché `left`/`top` percentuale), indipendente da
zoom/posizione reale, ma ruota comunque secondo `compass.rotation`. Nessun
drag diretto sull'icona: l'unica interazione resta il pad di nudge
esistente.

**Bug introdotto dal punto 1, risolto:** `updateViewportRect()` disabilitava
il pulsante "pan" e forzava l'uscita dalla modalità (`setMode(null)`) ogni
volta che `state.displayViewport` non era ancora noto (es. `/display` mai
connesso da quando il server è partito). Prima del punto 1 non si notava
(il box "Controlli" era sempre visibile a prescindere dalla modalità); dopo
averlo reso mode-gated, questo rendeva l'INTERO box irraggiungibile —
inclusi pad, opacità griglia e toggle griglia-DM, che non dipendono affatto
da `displayViewport` (solo il riquadro giallo e il trascinamento diretto
sulla mappa ne hanno bisogno, e già gestivano con grazia il caso mancante).
Tolto `disabled` di default dal bottone in index.html e la logica che lo
disabilitava/forzava l'uscita in `updateViewportRect()`: ora nasconde solo
il riquadro giallo quando i dati non ci sono, senza più toccare
`currentMode`.

## Fatto di recente (branch `worktree-aoe-shaders`)

- Snap flessibile per Cono (vertice o centro-lato, scelto dalla posizione
  di trascinamento/spostamento, non più dalla taglia) e per Linea (centro
  di una cella intera quando la larghezza è dispari; la cella d'origine
  resta esclusa dall'area colpita).
- Pulsanti di rotazione: ora ri-agganciano l'origine alla griglia dopo
  aver ruotato (prima la disallineavano, perché la regola di aggancio
  valida dipende dall'angolo).
- Pad di spostamento AOE ridisegnato: fisso in basso a destra del
  viewport, griglia 4×3 (rotazione, colore ciclabile, spostamento,
  taglia/larghezza +/-, maniglia per trascinare il pannello), posizione
  ricordata tra un reload e l'altro, scompare fuori dalla modalità AOE
  (prima restava visibile se un'area era ancora selezionata).
- Tasti direzionali ▲▼◀▶: si muovono sempre nella direzione SCHERMO
  corretta, anche a mappa ruotata (prima potevano spostare di lato invece
  che in verticale e viceversa).
- Tasto elimina nella lista aree: quadrato, a filo del bordo della
  pillola, con conferma (prima era il toggle mostra/nascondi contorno).
- Zoom locale centrato automaticamente sull'area PG all'ingresso in
  modalità zoom — **da rimuovere**, vedi punto 4 sopra: resta solo il
  pulsante manuale.

## Shader sugli incantesimi AOE (fatto, parziale)

Le aree d'effetto (box sotto la mappa, punto 5 sopra) ora possono mostrare
uno shader animato invece del semplice riempimento flat colorato, portando
gli shader di github.com/alph286/shaders (vedi anche memoria di sessione
"alph286-shaders-repo"). Layout deciso con l'utente: **layout A**, un
fulmine (lancia/rilancia) per ogni pillola della lista aree, non un
bottone globale — ogni area si lancia indipendentemente dalle altre.

**Decisioni chiave (confermate dall'utente in chat, non ovvie dal
codice):**
- Ogni colore della palette esistente (rosso/verde/blu/viola/giallo) è
  abbinato 1:1 a uno shader fisso, non scelto dal DM: rosso→cerchio di
  fuoco rosso, verde→cerchio di fuoco verde, viola→cerchio di fuoco viola,
  giallo→cerchio di fuoco giallo, **blu→moonbeam** (unico shader
  "freddo"/acqua portato finora — l'utente ha detto di procedere con
  questo abbinamento sapendo che potrebbe cambiarlo in futuro).
- Gli shader non abbinati a un colore vivono in un menu "···" (icona tre
  puntini) in fondo alla color bar, che apre un elenco inline (mai un
  overlay/sheet) sotto la color bar stessa: Zona ragnatela, Fumo
  circolare, Luce divina dorata. Scegliere una voce è un toggle (riscelta
  = torna a null) e forza il colore di anteprima a rosso -- da lì il DM lo
  cicla a piacere col pulsante "cambia colore" del pad AOE
  (`aoe-nudge-color`), che resta **indipendente** dall'eventuale override:
  colore e override-shader sono due campi separati sull'AoE, non uno
  deriva dall'altro.
- Finché un'area non viene "lanciata" (fulmine sulla pillola, campo
  `aoe.cast`), resta nel riempimento flat colorato di sempre -- serve a
  leggere bene le celle colpite mentre si piazza/aggiusta l'area prima del
  lancio drammatico vero e proprio.
- **Le 3 varianti "cerchio d'evocazione" del repo sorgente sono rimaste
  fuori**: sono shader multi-pass (fluid sim su più framebuffer:
  uFluid/uRune/uDye), non compatibili con la pipeline a singolo pass degli
  altri 8 (`AoeShaderLayer`/`aoeEffectFragmentSrc` in
  shared/shader-effects.js). Portarle richiede una pipeline multi-pass
  dedicata -- lavoro futuro, non ancora iniziato. Il menu "···" mostra
  quindi 3 voci, non 6.

**Come funziona l'adattamento alla forma (richiesta esplicita: "gli
shaders devono essere adattati anche alle altre forme delle aoe"):** ogni
shader ad area è stato scritto dall'autore originale per riempire un
rettangolo/quadrato (uv centrata, spesso un cerchio/bagliore radiale che
sfuma verso i bordi). Per farlo apparire ritagliato sulla vera sagoma di
Cono/Cubo/Sfera/Linea (anche ruotata), `aoeShaderMaskRect` (shared/
media.js) calcola il bounding box REALE della forma ruotata (mai
allineato agli assi come il Portale, che non ruota mai) più i vertici del
poligono vero in coordinate locali al rettangolo; `aoeEffectFragmentSrc`
(shared/shader-effects.js) avvolge ogni shader portato con un ray-casting
pari/dispari che azzera l'alpha fuori dal poligono, DOPO il colore finale
restituito da ciascun effetto -- nessuna costante/raggio calibrato dagli
autori originali è stata toccata. Verificato non solo visivamente ma per
pixel (`gl.readPixels` dentro lo stesso frame rAF, altrimenti WebGL
cancella implicitamente il draw buffer tra un frame e l'altro e la lettura
risulta sempre vuota -- scoperto durante questa sessione, non un bug reale
ma un artefatto del metodo di verifica): su un Cono ruotato di 45°, i 4
angoli del bounding box risultano trasparenti (fuori dal triangolo) mentre
il centro mostra il colore pieno dello shader.

**Stato/rete**: nuovi campi persistiti sull'AoE, `cast` (bool) e
`shaderOverride` (slug | null), stesso pattern find→valida→muta→salva→
broadcast di tutti gli altri eventi `aoe:*` (server/index.js:
`aoe:setCast`, `aoe:setShaderOverride`, whitelist server-side
`AOE_SHADER_OVERRIDE_IDS` in shared/media.js, stesso ruolo di
`AOE_COLOR_NAMES`). Migrazione in server/state.js backfilla le aree
salvate prima di questa modifica (`cast:false`, `shaderOverride:null`).
Zero validazione di formato sullo shader GLSL stesso, come già per le
decorazioni Portale -- solo la whitelist dello slug.

**Canvas**: nuovo `#map-aoe-shader-canvas`, gemello di `#map-shader-canvas`
(Portale) ma con `AoeShaderLayer` invece di `ShaderLayer` (geometria
diversa: viewport = bbox della forma RUOTATA, non un rettangolo fisso).
Posizionato tra la griglia e `#map-aoe-svg` in entrambe le pagine, così il
contorno dell'area (dentro `#map-aoe-svg`) resta sempre leggibile SOPRA lo
shader. Stesso loop `requestAnimationFrame` di Portale/Ping
(`stepShaderLayer`/`kickShaderLoop`), esteso a considerare anche le AoE
con `cast:true` nella condizione che tiene vivo il loop.

**Verificato in browser** (via socket diretto da console, non solo click):
colore→shader per i 4 fuochi, cono ruotato correttamente ritagliato
(pixel-check sopra), override "···" indipendente dal colore con fallback a
rosso, toggle del fulmine per pillola, propagazione identica su
`/control` e `/display`, nessun errore console, suite di test esistente
(`node --test public/shared/media.test.js`, 38/38) ancora verde. Non
ancora testato con la **Linea** (bbox non quadrato, caso che esercita di
più lo stretch/mask) né con shader multipli attivi contemporaneamente su
aree sovrapposte.

**Noto, non risolto in questa sessione**: il pad di spostamento AOE
(`aoe-nudge-overlay`, fisso in basso a destra) può coprire il pulsante
"···" quando un'area è selezionata, a seconda della larghezza schermo --
stesso tipo di sovrapposizione che il pad già fa con altri controlli per
design (si sposta trascinando la maniglia), non una regressione di questa
modifica ma degno di nota se diventa fastidioso in uso reale.

**Ritocco (stessa sessione, su segnalazione dell'utente): riempimento
pieno per ogni forma, non solo la Zona ragnatela.** Il primo giro sopra
usava un riscalo UNIFORME dal centro del rettangolo (`u_fillScale`) per
spingere la dissolvenza radiale di ogni shader verso il bordo del bbox --
funzionava per Cubo/Sfera (bagliore circolare dentro una sagoma
circolare/quadrata, un buon adattamento naturale) ma lasciava Cono e
Linea chiaramente "vuoti" lontano dal centro (l'utente: "quasi nessuno
tranne ragnatela occupano tutto lo spazio"), perché la distanza euclidea
dal centro del bbox non ha alcuna relazione con quanto la vera sagoma di
quelle due forme si estenda in quella direzione (es. gli angoli della
base di un Cono sono fisicamente lontani dal centro del bbox quanto gli
angoli di un Cubo, ma il Cono lì è comunque "dentro" la sua sagoma,
mentre il Cubo ci arriva solo agli angoli).

Scelta confermata con l'utente (AskUserQuestion, non assunta): **non**
nuovi shader disegnati da zero per ogni combinazione forma+effetto (fino
a 24 varianti, lavoro enorme, probabilmente da fare nelle sessioni
dedicate di alph286/shaders), ma una **trasformazione geometrica diversa
per forma**, riusando la stessa logica di rumore/colore già portata.
Cono e Linea vengono "srotolati" (`aoeShapeWarpParams` in
shared/shader-effects.js, nuovi uniform `u_shapeWarp`/`u_shapeOrigin`/
`u_shapeAxis`/`u_shapeLength`/`u_shapeNear|FarHalfWidth`) in un sistema
di coordinate locale alla forma PRIMA del riscalo: per il Cono,
distanza-dal-vertice lungo l'asse (0=vertice, 1=base) e scarto laterale
diviso per la semi-larghezza A QUELL'ALTEZZA (che cresce da 0 al vertice
alla metà base alla base -- la stessa formula generica, con
semi-larghezza vicina=lontana, gestisce anche la Linea senza bisogno di
un ramo di codice separato). Il risultato è sempre nel range ±1 esatto
sul bordo vero della sagoma lungo TUTTA la sua lunghezza, non solo vicino
al centro del bbox -- quindi lo stesso riscalo verso un bersaglio
costante (ora `sqrt(2)`, l'angolo di un quadrato unitario) funziona
uniformemente. Cubo/Sfera restano nello spazio reale (`u_shapeWarp=0`),
già un buon adattamento naturale, con il calcolo del punto-più-lontano
dai vertici della maschera reale invariato da prima.

Il ritaglio poligonale (`aoeMaskContains`) resta separato e invariato:
usa sempre la posizione FISICA reale del pixel, mai quella srotolata --
lo srotolamento serve solo a decidere QUANTO lo shader si "apre" verso i
bordi, il ritaglio vero (bordo netto della sagoma) continua a venire dal
vero poligono ruotato, indipendentemente da come lo shader interpreta le
proprie coordinate interne.

Anche il bersaglio di riscalo (`AOE_FILL_TARGET_REACH`) è stato rivisto:
il primo tentativo (0.92) puntava a dove la dissolvenza di ogni shader
tocca lo ZERO (`base+feather` nella formula
`1-smoothstep(base-feather,base+feather,rad)` comune a quasi tutti) --
sbagliato, perché il punto più lontano della sagoma finiva comunque
scuro (al bersaglio la densità è già 0). Corretto a 0.55, media dei
`base` calibrati dai vari autori (dove la densità è a MEZZA intensità,
non zero): il punto più lontano resta visibilmente acceso invece di nero,
con una dissolvenza morbida verso quel bordo.

Verificato per pixel (non solo a occhio, stesso motivo del rendering
sincrono-senza-rAF scoperto nel ritocco precedente): su una griglia di
punti dentro la vera sagoma (poligono reale, test lato JS indipendente
dallo shader), frazione di pixel "ancora scuri" (alpha<15) e alpha medio
per tutte e 4 le forme, prima/dopo irrilevante -- solo il "dopo" qui
sotto, il "prima" è quanto descritto dall'utente:

| Forma | Alpha medio (0-255) | Frazione scura |
|---|---|---|
| Cubo | 183.7 | 0% |
| Sfera | 148.9 | 1% |
| Cono (ruotato 20°) | 178.6 | 7% |
| Linea (ruotata 35°) | 185.5 | 1% |

Confermato anche visivamente su `/control` e `/display` (screenshot):
Cubo e Sfera riempiono il proprio riquadro/cerchio in modo solido, Cono e
Linea riempiono l'intera sagoma triangolare/rettangolare ruotata, non più
un piccolo bagliore scentrato. Suite di test esistente ancora verde
(38/38) -- nessuna di queste modifiche tocca `media.test.js`.

**Ritocco (stessa sessione, su richiesta dell'utente): ridisegno
abbinamenti colore/menu, contorno vs evidenziazione celle, bug di
selezione.** Cinque richieste distinte, tutte applicate insieme:

1. **Contorno vs celle a shader attivo, invertito.** Prima: ad area
   "lanciata" (`aoe.cast`) spariva il riempimento flat per cella, restava
   il contorno netto. L'utente lo voleva al contrario: il contorno (la
   sagoma triangolo/rettangolo/cerchio netta) sparisce a shader attivo
   (ridondante con lo shader sopra), ma l'evidenziazione delle celle
   colpite resta SEMPRE visibile (serve a leggere con precisione quali
   celle sono colpite, specialmente proprio quando l'incantesimo è già in
   scena). `renderAoeOverlays`/`renderAoe`: il blocco celle non ha più la
   guardia `if (!aoe.cast)`; il contorno (e il marker "+" origine) usano
   ora `outlineVisible = shapeVisible && !aoe.cast`. Il poligono resta nel
   DOM anche con stroke "none" (serve ancora a trascinare l'area su
   `/control`).
2. **Blu → Bianco (bagliore lunare).** `AOE_COLORS.blue` rinominato
   `white` (stesso ruolo nella palette, nuovo hex quasi-bianco
   `#f2f4fa`/`#a7acc2` scuro) -- resta abbinato a `moonbeam`, solo il
   colore del pulsante/dell'evidenziazione celle cambia. Migrazione in
   server/state.js rinomina `color:'blue'` salvato in `'white'`.
3. **Giallo → Luce divina dorata.** `AOE_COLOR_TO_SHADER.yellow` ora punta
   a `gold_divine_light` (prima nel menu "···"); lo shader `yellow_fire`
   (ormai irraggiungibile da nessuna parte dell'interfaccia) è stato
   rimosso del tutto dal registro invece di lasciarlo come codice morto.
4. **Viola → "Viola Cornelia" nel menu "···".** `purple_fire` è uscito
   dalla color bar (bottone rimosso da index.html) ed è entrato nel menu
   "···" con nuova etichetta "Viola Cornelia" e una nuova icona dedicata
   (`#i-wizard-hat`, cappello da mago). La sua palette colore è stata
   ricalcolata per leggersi come viola vero invece di magenta/rosa
   (richiesta esplicita): prima R e B erano quasi alla pari (~0.79/0.88 al
   picco, leggeva magenta), ora B resta nettamente dominante su R (rapporto
   ~2:1), verificato per pixel (`gl.readPixels`: R122 G49 B245 al centro).
   `purple` resta nella palette `AOE_COLORS` (serve ancora per
   l'evidenziazione di Viola Cornelia, vedi punto 5) ma non è più un
   pulsante né compare nel ciclo colore del pad -- nuova costante
   `AOE_COLOR_CYCLE_NAMES = ['red','green','white','yellow']`, usata sia
   per il ciclo (`aoeNudgeColor`) sia implicitamente dalla color bar (4
   pulsanti invece di 5).
5. **Colore di evidenziazione di default per il menu "···", bianco non più
   rosso.** Nuova mappa `AOE_SHADER_OVERRIDE_DEFAULT_COLOR` in media.js:
   `web_area`/`circular_smoke` → bianco, `purple_fire` → viola (unica
   eccezione, coerente col nome dello shader). Sostituisce il vecchio
   "usa sempre rosso" di una sessione precedente.
6. **Bug "sembra di dover disattivare il menu per riusare i colori",
   risolto.** Causa reale: scegliere un colore dalla color bar non
   azzerava mai `shaderOverride` -- il pulsante del colore si illuminava
   "attivo" ma lo shader lanciato restava comunque quello del menu
   (`resolveAoeShaderId` fa sempre vincere l'override), un disallineamento
   tra cosa mostra il pulsante e cosa viene davvero lanciato. Ora cliccare
   un colore nella color bar azzera anche l'eventuale override attivo
   (simmetrico a quanto le voci del menu "···" già facevano verso il
   colore) -- color bar e menu "···" sono ora un unico gruppo mutuamente
   esclusivo in entrambe le direzioni, non più due toggle indipendenti.
   Verificato: selezionata "Viola Cornelia" su un'area (override
   `purple_fire`, "···" con bordo ambra), poi cliccato "Verde" --
   `shaderOverride` torna `null`, shader risolto torna `green_fire`,
   bordo ambra sparisce dal "···".

Verificato in browser (non solo a occhio): `resolveAoeShaderId` per
giallo/bianco/Viola Cornelia risolve rispettivamente in
`gold_divine_light`/`moonbeam`/`purple_fire`; il contorno sparisce (stroke
"none" sul poligono) mentre 25 celle restano evidenziate su un'area
lanciata; suite di test ancora verde (38/38, `AOE_COLORS.blue` rinominato
`AOE_COLORS.white` anche nei test).
