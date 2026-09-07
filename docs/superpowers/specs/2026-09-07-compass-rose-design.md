# Rosa dei Venti su Display — Design

**Goal:** mostrare su `/display` una rosa dei venti (N/S/O/E) in sovraimpressione fissa sullo schermo, visibile solo sopra la mappa (mai sopra le immagini mostrate ai giocatori). Attivabile/disattivabile da `/control`; posizione, rotazione e visibilità configurabili da `/editor`, per singola location.

**Architecture:** nuovo campo `location.map.compass = { visible, x, y, rotation }`, persistito come il resto delle impostazioni di una location. `x`/`y` sono percentuali dello **schermo del display** (non dello spazio locale/non ruotato della mappa, quello di griglia e poligoni) — la rosa dei venti è un elemento fisso sullo schermo, indipendente dalla rotazione/flip della mappa sottostante, esattamente come il pallino wifi già presente su `/display`. `rotation` è un angolo manuale (0-359°) scollegato da flip180/rotate90: se in futuro ruoti/capovolgi la mappa, la rosa dei venti non si aggiusta da sola, la riaggiusti tu se serve.

Un solo evento socket, `compass:update { locationId, visible?, x?, y?, rotation? }` (aggiornamento parziale, stesso pattern già usato per la griglia), usato sia da `/control` (solo `visible`) sia da `/editor` (tutti e tre i campi). Nessuna nuova route HTTP, nessuna nuova dipendenza.

## Modello dati e migrazione

Default per ogni location (nuove e già esistenti, via `migrate()`): `visible: false` (nessuna sorpresa sulle mappe già in uso — la attivi tu quando vuoi), `x: 88, y: 85` (basso a destra), `rotation: 0` (N in alto). Una volta attivata su una location, resta così finché non la spegni tu (da `/control` o `/editor`) — nessun reset automatico, nessuna distinzione tra "visibilità di default" e "visibilità corrente": è lo stesso campo, scritto da entrambe le superfici.

Valori sempre clampati lato server: `rotation` in 0-359, `x`/`y` in 0-100 — un client malformato non può mandare uno stato fuori range.

## `/display`

Nuovo elemento fisso dentro `#viewport`, sorella di `#map-layer`/`#image-layer` (non dentro la parte che ruota con la mappa). Visibile solo quando: la mappa è mostrata (non un'immagine) e `compass.visible` è vero per la location attiva. Posizionata via percentuali CSS (`left`/`top` su `#viewport`), ruotata come un unico blocco (lettere comprese) in base a `rotation`.

## `/control`

Un interruttore "Rosa dei venti" nella scheda Mappa (vicino a Opacità griglia), che segue lo stesso principio già in uso lì: agisce su `previewLocationId`/`getPreviewLocation()`, non sulla location attiva — puoi prepararla (accenderla/spegnerla) in anteprima senza che i giocatori la vedano finché non mandi quella location in onda, esattamente come già succede per griglia e fog.

## `/editor`

Tre controlli nella toolbar della mappa:
- Un pulsante icona "mostra/nascondi rosa dei venti" (stesso stile `.icon-btn.tool.active` già usato per griglia/allinea griglia).
- Un campo numerico per la rotazione (0-359°), stesso stile dei controlli griglia esistenti (`.icon-num`).
- La **posizione** non ha un campo numerico: si trascina l'icona della rosa dei venti direttamente sopra l'anteprima della mappa nel canvas dell'editor, in un punto fisso rispetto al riquadro del canvas (non dentro la parte che ruota con la mappa) — come si sposterebbe un poligono, ma con un solo punto invece di un contorno. La rosa resta visibile e trascinabile nell'editor anche quando è spenta (per poterla posizionare in anticipo prima di attivarla), mostrata in questo caso semi-trasparente e tratteggiata per distinguerla dallo stato "attiva".

## Resa grafica

Un'icona a forma di stella a 4 punte con le lettere **N / S / O / E** (italiane, coerenti col resto dell'app — non le lettere inglesi), disegnata come SVG lineare nello stesso stile delle altre icone del progetto, in colore accento (ambra). Dimensione fissa (non richiesta come configurabile). Ruota come un unico blocco (lettere comprese) in base all'angolo impostato — nessun contro-ruotamento delle lettere per tenerle dritte: si ruota la rosa intera, non solo l'indicatore del nord. Mockup approvato: https://claude.ai/code/artifact/eace9e63-c1e1-434f-b739-35c3966ae0a4

## Gestione errori

`compass:update` segue lo stesso schema difensivo degli altri eventi socket (location non trovata → nessun effetto). Nessun caso di errore particolare: nessun file caricato, nessuna nuova dipendenza, nessun rischio di perdita dati.

## Testing

Nessuna suite automatica (per scelta di progetto). Verifica manuale su server isolato:
- Attivare/posizionare/ruotare la rosa dei venti da `/editor`, verificare che compaia su `/display` esattamente in quella posizione/rotazione, sopra la mappa.
- Passare a mostrare un'immagine ai giocatori: la rosa dei venti sparisce; tornare alla mappa: ricompare.
- Spegnerla da `/control`: sparisce da `/display`; riavviare il server: resta spenta (persistita).
- Cambiare location: la rosa dei venti riflette le impostazioni della nuova location (posizione/rotazione/visibilità indipendenti tra location).
- Verificare che ruotare/capovolgere la mappa (flip180/rotate90) non sposti né ruoti la rosa dei venti.
- Location senza mappa caricata (placeholder): la rosa dei venti, se attiva, resta visibile comunque (è un overlay dello schermo, non della mappa).
