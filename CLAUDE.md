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

- [ ] **1. Movimento visuale PG** (oggi "pan mode") — il pad di controllo
      (quello già in "Controlli"), più **due** opacità griglia separate:
      una per la vista del DM su `/control`, una per quella dei giocatori
      su `/display` (oggi è un solo valore condiviso: va sdoppiato in due
      campi). Più un attiva/disattiva griglia che vale **solo** per la
      vista del DM (i giocatori restano secondo l'impostazione condivisa,
      indipendente da questo toggle).
- [ ] **2. Fog of war** — opacità fog (già esiste, va spostata qui sotto
      la mappa). Sotto, una percentuale di completamento ("11/18") con
      barra di progresso, calcolata su zone rivelate / totale zone del
      location corrente.
- [ ] **3. Ping** — la bussola/rosa dei venti si sposta qui (oggi vive
      nella sezione di "movimento visuale"/pan). Nuovo: tap-e-trascina per
      lasciare una scia dietro al ping. Il ping stesso diventa uno shader
      (riusando la pipeline `ShaderLayer` già usata per le decorazioni
      "Portale" piazzate da `/editor`).
- [ ] **4. Zoom** — **rimuovere** lo zoom automatico all'ingresso in
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
- [ ] **5. AOE** — il box che oggi sta sopra la mappa (`#aoe-panel`: forme,
      colori, taglia, lista aree) si sposta sotto, come gli altri quattro.

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
