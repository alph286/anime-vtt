# /party: verifica di parità con il party vanilla (Task 6)

Data: 2026-10-12. Branch `party-display-shadcn` (creato sopra `control-shadcn`).
Riferimento: il /party originale (`public/party/party.js`, `party.css`,
`index.html`), confrontato leggendo il codice, non aprendolo nel browser.

**Ambiente:** copia di `data/` e `storage/` in una cartella temporanea (gli
originali solo letti), server di prova `PORT=3100 DATA_DIR=… STORAGE_DIR=…` con
`NODE_PATH` verso i node_modules del repo principale; dev server
`VTT_BACKEND=http://localhost:3100` con la config `vite.party.config.ts` su :5175.
Nel browser integrato aperta SOLO `http://localhost:5175/party/`, mai `/display`
né `/control`. Display e azioni del DM simulati da script Node (`socket.io-client`
di `editor-app/node_modules`) collegati solo alla 3100: un processo in background
con `hello {role:'display'}` + `display:viewport {1745×872}`, e invii singoli di
`location:set`, `view:pan`, `view:zoom`, `view:reset`, `mapRotate90:toggle`,
`image:show`, `image:hide`. Viewport 375×812 (preset mobile) per pannello e pad,
desktop per i primi controlli. A fine prova server, client e Vite fermati per
PID e copia dei dati cancellata.

Metodo: click e trascinamenti veri del browser dove conta il puntatore; esito
letto dallo stato della copia (client socket `state:update`) o dal DOM
(`getBoundingClientRect`, attributi), non a occhio. **Gli screenshot del
pannello browser nascosto risultano spesso in ritardo di uno o più render**
(mostravano la mappa non ruotata dopo `rotate90`): per questo nessun esito qui
sotto si basa su uno screenshot.

## Checklist

| # | Voce | Esito | Note |
|---|---|---|---|
| 0 | Avvio in sviluppo (`npm run dev:party`) | **KO → corretto** | `/shared/media.js` e `shader-effects.js` davano 404: Vite in dev antepone la base (`/party/shared/…`) e il proxy `/shared` non li intercettava; lo store falliva con `AOE_METERS_PER_CELL is not defined`, pagina vuota. Aggiunto in `vite.party.config.ts` un proxy `/party/shared` → backend con la base tolta (`6729be1`). La build non era toccata (gli `<script>` classici restano `/shared/…`). |
| 1 | Header: pallino | OK | connesso: classe `ok`, trasparente, opacità 0.35, title "Connesso"; server di prova fermato: `bg-[var(--danger-bg)]` rgb(58,31,31), opacità 1, title "Server non connesso"; riavviato: torna tenue |
| 1 | Header: nome location attiva | OK | segue `location:set` (Caverna Troll → Nuova Brahill → Taverna) |
| 1b | Stato iniziale al caricamento | **KO → corretto** | 1 reload su 6: pallino "Connesso" ma nessuna location né pillole, fino alla prima azione del DM. Il server manda lo stato solo alla connessione; se il socket era già connesso al mount dell'hook, l'evento era perso. Ora l'hook si riconnette se è già connesso senza stato (`573ee89`, 3 test nuovi). Dopo il fix: 8/8 reload con stato. |
| 2 | Senza display: mappa intera, nessun transform, griglia | OK | `--map-aspect: 3924 / 2944` (proporzione della mappa), `#map-layer` `transform: none`, 79 linee di griglia, stroke 0.3 (= `grid.lineWidth`) |
| 3 | Con display 1745×872: proporzione del box | OK | `--map-aspect: 1745 / 872`, box 690×344 (2,006) |
| 3 | Pan/zoom del DM seguiti | OK | live {1.6, -32.11, -150.64}, k = 690/1745 = 0.3954: `translate(-12.70px, -59.57px) scale(1.6)` (calcolato a mano = DOM). Dopo `view:pan {+100,+50}` e `view:zoom 2.5`: `translate(26.84px, -39.80px) scale(2.5)`, di nuovo identico al calcolo |
| 3 | Griglia a spessore costante | OK | stroke 0.3 → 0.1875 a scale 1.6 → 0.12 a scale 2.5 (0.3/scale) |
| 3 | Contorno AOE non compensato | OK | linee `stroke-width 1.5` invariate allo zoom |
| 4 | Fog | OK | Caverna Troll: 2 zone, 1 rivelata. Un solo `.fog-overlay` (la zona non rivelata) nero pieno, rgb(0,0,0), opacità 1 su sé e sul layer; la rivelata non è disegnata (trasparente) |
| 5 | Portale e AOE lanciata animati | OK (parziale) | `requestAnimationFrame` agganciato: su Caverna Troll (4 shader) il loop gira (contatore > 0 a ogni frame). La resa visiva vera è in "Non verificato a mano" |
| 5 | Loop che si ferma senza shader | OK | su Nuova Brahill (0 shader, 0 AOE) contatore rAF a 0 su più frame |
| 6 | Forme e colori | OK | 4 forme, 4 colori (Rosso/Verde/Bianco/Giallo), "···" |
| 6 | Menu "···" | OK | Zona ragnatela, Fumo circolare, Viola Cornelia, inline sotto la barra colori |
| 6 | Mutua esclusione "···"/colore | OK | Viola Cornelia → nessun colore attivo, "···" attivo; poi Verde → Verde attivo, "···" spento |
| 6 | Taglia / larghezza solo per Linea | OK | "Larghezza" compare solo con Linea |
| 6 | Lista pillole, nessun fulmine | OK | pillole = etichetta + ✕; il lancio è FIRE nel pad |
| 6 | Selezione / deselezione | OK | click sulla pillola: pad visibile e "Modifica: …"; secondo click: pad nascosto, nessuna `.selected` |
| 6 | Eliminazione arma-poi-conferma 2,5 s | OK | 1° click: "Tocca di nuovo per confermare", rosso; dopo 2,8 s torna "Rimuovi" e l'area resta; due click ravvicinati (DOM ri-interrogato tra i due): area eliminata (6 → 5) |
| 7 | Tap su vuoto piazza con snap | OK | Linea 1,5 m verde, origine al centro cella (7,5; 29,5 in celle), `shaderOverride null` |
| 7 | Soglia 8 px su vuoto | OK | trascinamento di 20 px: nessuna area; di 5 px: area piazzata |
| 7 | Trascinamento di un contorno sposta | OK | la Linea si sposta (centro delle celle da y 102,0 a 117,5 px), nessuna area nuova. Come nell'originale, su un contorno non c'è soglia: anche 5 px spostano (agganciato alla cella più vicina) |
| 8 | Rotazione con riaggancio | OK | Cono a (18,77; 12,44) celle, rotazione 240 → 225 e origine riagganciata a (19,00; 12,50) |
| 8 | ▲▼◀▶ in direzione schermo a mappa ruotata | OK | con `rotate90`: ▲ centro schermo y 105,2 → 101,3 (su), ◀ x 141,1 → 137,3 (sinistra), x invariato nel primo e y nel secondo |
| 8 | Colore ciclabile | OK | verde → bianco |
| 8 | Taglia / larghezza | OK | Linea 1,5 → 3 → 4,5 → 6 m; larghezza 1,5 → 3 m (riagganciata al vertice per larghezza pari). Due click nello stesso istante su "+" ne contano uno (nessun aggiornamento ottimistico, come nel `party.js` originale che parte da `editingAoe` del server) |
| 8 | FIRE cast/decast | OK | `cast` false → true → false sullo stato della copia |
| 8 | Trascinamento del pad, chiave dedicata | OK | trascinato da (282,663) a (150,450): `partyAoeNudgeOverlayPos = {"left":69,"top":269}`; `aoeNudgeOverlayPos` mai scritta. Dopo reload il pad ricompare esattamente a 69,269 |
| 9 | Immagine mostrata (`image:show` dal client di prova) | OK | `activeImageId` impostato; `#map-img` resta la mappa, aree invariate; tap su vuoto: nessuna area (5 → 5); trascinamento di un contorno: nessuno spostamento |
| 9 | Pannello e pad con immagine | OK | pad "+" taglia 4,5 → 6 m; colore Giallo dal pannello applicato all'area selezionata |
| 9 | Tolta l'immagine (`image:hide`) | OK | trascinamento sposta di nuovo, tap piazza di nuovo (5 → 6) |
| 10 | Cambio location attiva con area selezionata | OK | `location:set` Taverna: pad sparito, nessuna `.selected`, pannello senza "Modifica" |
| 11 | Reload senza residui di /control | OK | con `zoomLocalState {3,-100,-50}`, `dmGridVisible false`, `dmGridOpacity 0.1` nel localStorage della stessa origine: transform = solo follow (`translate(0,0) scale(1)` dopo `view:reset`), griglia visibile (79 linee, opacità 1, stroke 0.3). Le chiavi di /control restano nello storage, intatte |
| — | Console | OK | dopo i due fix nessun errore né avviso dell'app (solo i messaggi di Vite/React DevTools) |

## Osservazioni (non KO di /party)

- **Stesso 404 in dev per /control ed editor**: `vite.shared.ts` non ha il proxy
  con la base, quindi anche `npm run dev:control` (:5174, base `/control/`) e
  `npm run dev:editor` (:5173, base `/editor/`) dovrebbero chiedere
  `/<base>/shared/media.js`. Non provato (vietato aprire `/control` in questa
  prova) e non corretto qui per non toccare i file di /control: la verifica di
  /control era stata fatta sulla build servita dalla 3100, dove il problema non c'è.
- **Stesso rischio di stato iniziale perso in /control**: `use-control-socket.ts`
  ha lo stesso `if (socket.connected) onConnect()` senza recupero dello stato.
  Non toccato.
- Riavviando il server il suo `applyStartupDefault` rimette la location di default
  (Taverna): comportamento del server, /party lo segue.

## Non verificato a mano

- **Touch e pinch reali**: solo eventi mouse del browser integrato (in emulazione
  mobile); nessun dispositivo touch. /party non ha pinch per scelta, ma il tap con
  il dito e il trascinamento del pad col dito non sono provati.
- **Resa visiva degli shader** (Portale, AOE lanciata): verificato solo che il loop
  rAF gira e si ferma; il pannello browser era nascosto e gli screenshot in ritardo,
  quindi l'animazione non è stata guardata.
- **Confronto con un vero `/display` acceso**: vietato aprirlo (`displayViewport` è
  globale sul server). La corrispondenza è verificata per calcolo (stessa formula di
  `display.js`, k = larghezza box / larghezza display), non affiancando le due viste.
- **Tavolo con più telefoni** contemporanei sulla stessa lista di aree.
- **Build di produzione servita da Express** aperta nel browser: la build è stata
  generata e committata, ma la prova in browser è stata fatta sul dev server. Sulla
  3100 controllato solo via curl: `/party/`, i due asset hashati, `/shared/media.js`
  e `/shared/shader-effects.js` rispondono 200.

## Verifiche finali

- `cd editor-app && npm test`: 32 file, 298/298; `npm run typecheck` pulito.
- `node --test public/shared/media.test.js`: 38/38.
- `git diff control-shadcn..HEAD --stat -- server public/shared public/display public/editor public/control`: vuoto.
- `public/control` e `public/editor` non modificati dalla build.
