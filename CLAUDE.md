# Piano di lavoro

Elenco delle cose da fare sul progetto, aggiornato man mano che si procede.
Va tenuto aggiornato ad ogni sessione: spuntare i completati, aggiungere
nuovi punti quando emergono, annotare qui decisioni o vincoli scoperti
strada facendo (non solo nella chat, che si perde).

## Box sotto la mappa: contenuto diverso per modalità (in corso)

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
- [ ] **3. Ping** — la bussola/rosa dei venti si sposta qui (oggi vive
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
      **Da fare (parte 2/2, sessione successiva):** tap-e-trascina con scia
      + ping come shader `ShaderLayer` — esplicitamente lasciato da parte
      per ora, su richiesta dell'utente.
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
