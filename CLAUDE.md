# Piano di lavoro

Elenco delle cose da fare sul progetto, aggiornato man mano che si procede.
Va tenuto aggiornato ad ogni sessione: spuntare i completati, aggiungere
nuovi punti quando emergono, annotare qui decisioni o vincoli scoperti
strada facendo (non solo nella chat, che si perde).

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
