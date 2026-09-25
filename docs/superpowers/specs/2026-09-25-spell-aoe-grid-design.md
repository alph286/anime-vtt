# Aree d'Effetto sulla Griglia — Design

## Obiettivo

Permettere al DM, da `/control`, di piazzare aree d'effetto d'incantesimo (cono,
cubo, sfera, linea) sulla griglia della mappa attiva, con taglia in metri
secondo le convenzioni ufficiali D&D (adattate al rapporto di questo tavolo:
1 cella = 1,5 metri), posizionarle, ruotarle, spostarle e rimuoverle. Le aree
sono visibili in tempo reale anche ai giocatori su `/display`, e restano
visibili finché il DM non le rimuove esplicitamente. Più aree possono
coesistere contemporaneamente sulla stessa mappa.

## Fuori scopo

- Editor di forme personalizzate (solo le 4 forme ufficiali elencate sotto).
- Calcolo automatico di quali token/miniature sono colpiti (non esiste un
  concetto di token in questo progetto).
- Colori o stili per-area personalizzabili dal DM (colore fisso, coerente col
  resto della UI). Se servirà in futuro, è un'estensione separata.
- Configurare il rapporto metri/cella per singola location: è fisso a 1,5m
  a livello di intero progetto.

## Forme supportate

| Forma | Parametri | Esempio D&D |
|---|---|---|
| Cono | lunghezza (m) | Soffio di drago, 4,5m |
| Cubo | lato (m) | area di alcuni incantesimi minori |
| Sfera | raggio (m) | Palla di fuoco, 6m di raggio (sfera e cilindro sono la stessa cosa vista dall'alto — un solo tipo "sfera") |
| Linea | lunghezza (m) + larghezza (m, default 1,5m) | Fulmine, 1,5×9m |

Il cubo non è orientabile (resta allineato agli assi, come nell'uso reale al
tavolo). Cono e linea sono orientabili con due pulsanti ↺/↻ a scatti di 15°.

## Modello dati

Nuovo campo su ogni location, accanto a `polygons`/`grid`/`compass`:

```js
location.map.aoes = [
  {
    id: string,
    shape: 'cone' | 'cube' | 'sphere' | 'line',
    sizeM: number,      // lunghezza/lato/raggio in metri, sempre multiplo di 1.5
    widthM: number,     // solo per 'line'; default 1.5; ignorato per le altre forme
    x: number, y: number, // punto di origine, spazio locale percentuale (0-100) non ruotato — stesso sistema già usato per i punti dei poligoni fog
    rotation: number,   // gradi, 0-359; ignorato per 'cube' e 'sphere'
  },
  ...
]
```

Persistito in `data/state.json` come il resto di `location.map` (stesso ciclo
`saveState`/`broadcastState` già in uso per poligoni/griglia/bussola — niente
di nuovo lato persistenza). Migrato in `server/state.js` con lo stesso pattern
già usato per `compass`/`audio`: se assente, default `[]`.

## Conversione metri → pixel

1 cella = 1,5 metri è un rapporto fisso di progetto (non per-location). I
pixel per metro si calcolano da `location.map.grid.cellSize` (già in pixel
naturali dell'immagine, indipendente dal flag `enabled` di visibilità della
griglia):

```
pixelPerMeter = grid.cellSize / 1.5
```

Se il DM non ha mai calibrato la griglia su quella mappa (`cellSize` al
default 100), le aree avranno una taglia visivamente scorretta — stessa
precondizione già vera oggi per la griglia stessa, non un problema nuovo.

**Nota tecnica per l'implementazione:** la geometria (vertici del cono,
cerchio della sfera, ecc.) va calcolata in pixel naturali reali attorno al
punto di origine, poi convertita in percentuale **separatamente per asse X e
Y** (`xPct = px / naturalWidth * 100`, `yPct = py / naturalHeight * 100`) —
stesso principio già usato da `renderGridSvg` in `shared/media.js` per
`stepXPct`/`stepYPct`. Fare il calcolo direttamente in percentuale produce
forme deformate su mappe non quadrate.

## UI su /control

**Quinto pulsante modalità** "AoE" nella colonna già esistente
(Sposta/Fog/Ping/Zoom locale/AoE), stesso stile, mutuamente esclusivo con le
altre quattro. Disabilitato quando si sta visualizzando in anteprima una
location diversa da quella attiva, o quando è mostrata un'immagine al posto
della mappa — stessa regola già applicata al pulsante Ping, stesso motivo
(i giocatori non vedrebbero comunque nulla).

Quando attivo, sopra la mappa compare una barra orizzontale con i 4 pulsanti
forma (Cono/Cubo/Sfera/Linea) sulla stessa riga, e sotto uno stepper +/− a
passi di 1,5m (1 cella) con il valore corrente (es. "6,0 m"); per la Linea
compare anche uno stepper analogo per la larghezza. Taglia di default alla
prima selezione di una forma: 1,5m (una cella) — il minimo possibile, il DM
sale con lo stepper. Cambiare forma nella barra non resetta la taglia già
impostata (comodo per piazzare più coni della stessa lunghezza di fila).

**Piazzamento:** un tap sulla mappa (tap/pointerup, stesso meccanismo già
corretto per il Ping) piazza una nuova area nel punto toccato, con la forma e
taglia correnti, rotazione 0.

**Lista aree attive:** sotto ai controlli, un elenco (stesso stile della
lista Fog) con una riga per area piazzata (es. "Cono 4,5m"). Toccare una riga
la seleziona: compaiono i pulsanti ↺/↻ (solo cono/linea) e un pulsante
"Rimuovi" per quella specifica area.

**Spostamento:** trascinare un'area già piazzata direttamente sulla mappa (in
modalità AoE) la sposta, seguendo lo stesso pattern pointerdown/move/up già
in uso per lo zoom locale — nessun bisogno di prima selezionarla dalla lista
per spostarla, il trascinamento stesso la individua e la seleziona.

## Rendering (condiviso /control e /display)

Ogni area disegna due livelli, entrambi figli dello stesso contenitore che
porta già rotazione/pan/zoom della mappa (`map-fit-box`, lo stesso spazio
locale di poligoni fog e marcatore ping — eredita tutto automaticamente):

1. **Contorno della forma**: un overlay SVG/CSS con la geometria esatta
   (triangolo per il cono, quadrato per il cubo, cerchio per la sfera,
   rettangolo per la linea), bordo colorato, riempimento leggermente
   trasparente.
2. **Celle evidenziate**: per ogni cella della griglia (stessa griglia già
   disegnata da `renderGridSvg`, stesso `cellSize`/`offsetX`/`offsetY`) il
   cui **centro** ricade dentro la forma, un piccolo riquadro colorato sulla
   cella — stessa regola ufficiale D&D per il gioco su griglia ("una cella è
   colpita se il suo centro è dentro l'area").

Su `/display` il rendering è identico ma sola lettura (nessuna interazione —
i giocatori vedono, non toccano).

## Sincronizzazione

Nuovi eventi socket, sullo stesso modello di `polygon:create`/`compass:update`
(persistono e fanno `broadcastState`, a differenza del `ping:show` transitorio
che invece non persiste):

- `aoe:place { locationId, shape, sizeM, widthM, x, y }` → crea una nuova area
  (rotazione 0), la aggiunge a `location.map.aoes`, salva, broadcast.
- `aoe:move { locationId, aoeId, x, y }` → aggiorna la posizione.
- `aoe:rotate { locationId, aoeId, rotation }` → aggiorna la rotazione
  (ignorato server-side se la forma è cubo/sfera).
- `aoe:remove { locationId, aoeId }` → rimuove l'area dall'array.

Tutti e quattro seguono esattamente il pattern già presente in
`server/index.js` per gli handler di poligoni/griglia/bussola: trova la
location, valida, muta, `saveState`, `broadcastState`.

## Casi limite

- **Cambio location:** le aree sono per-location e viaggiano con
  `location.map` come poligoni/griglia — cambiando location attiva, `/display`
  mostra automaticamente solo le aree di quella location (nessuna logica
  extra, stesso comportamento già naturale di `getActiveLocation`).
- **Nessuna griglia calibrata:** documentato sopra, non risolto da questa
  feature.
- **Rimozione di un'area mentre è selezionata:** la selezione è solo stato
  locale del client `/control` (non persistita), si pulisce da sola quando
  l'elenco si ri-renderizza senza quell'id.

## File toccati (indicativo, il piano di implementazione lo formalizza)

- `server/state.js` — migrazione `aoes: []` di default.
- `server/index.js` — 4 nuovi handler socket.
- `public/shared/media.js` — funzioni condivise di geometria (conversione
  metri→pixel, generazione punti per forma, test centro-cella-dentro-forma),
  usate sia da `control.js` che da `display.js`.
- `public/control/index.html` / `control.css` / `control.js` — quinto
  pulsante modalità, barra forme, stepper taglia, lista aree, piazzamento/
  spostamento/rotazione.
- `public/display/index.html` / `display.css` / `display.js` — rendering
  sola lettura del contorno forma + celle evidenziate.
