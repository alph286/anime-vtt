# Design: gestione multi-location dall'editor

## Contesto

L'app ha già un concetto di "location" (`state.locations[]`) — ogni location ha la propria mappa, griglia, fog of war e immagini, ed editor/controllo hanno già un menu a tendina per passare dall'una all'altra. Il problema: **non esiste alcun modo di creare, rinominare o eliminare una location dall'interfaccia** — oggi l'unico modo è modificare `data/state.json` a mano col terminale. L'utente vuole preparare più mappe (luoghi diversi: taverna, dungeon, foresta...) prima della sessione, dall'editor.

## Obiettivo

Aggiungere gestione completa delle location (crea / rinomina / archivia / ripristina) dall'editor, più una location "predefinita" scelta dall'utente che l'app carica sempre all'avvio del server, indipendentemente da quale fosse rimasta attiva l'ultima volta.

## Decisioni chiave (dal brainstorming)

- **Le location sono luoghi/stanze diversi**, non varianti della stessa mappa — riusano al 100% l'infrastruttura per-location già esistente (mappa, griglia, fog, immagini). Nessun cambio al modello dati per il "contenuto" di una location.
- **"Elimina" è in realtà "archivia"**: non si cancella mai nulla per errore. Una location archiviata sparisce dal menu di selezione rapida ma resta visibile e ripristinabile in un elenco separato nella sidebar. I file (mappa/immagini) restano su disco.
- **Pulizia file orfani è una funzione separata**, volutamente meno in vista, che opera su TUTTI i file non referenziati da nessuna location (attiva o archiviata) — non solo quelli delle location archiviate.
- **La location attiva resta un concetto unico e condiviso** tra editor, controllo e display (nessuno stato "in modifica" separato da quello "in onda") — cambiare location nell'editor cambia subito anche cosa mostra la TV, esattamente come oggi.
- **Nessun nuovo stato per "nessuna location attiva"**: display e controllo mostrano semplicemente il placeholder che già esiste oggi per "nessuna mappa caricata".
- **Fog of war/griglia/immagini persistono già per sempre** per ogni location, a prescindere da quale sia attiva o da riavvii del server — comportamento esistente, nessuna modifica necessaria.
- **La location "predefinita" forza sempre l'avvio**, ignorando quale fosse rimasta attiva all'ultimo spegnimento del server.

## Modello dati

Due nuovi campi booleani su ogni oggetto in `state.locations[]` (in `server/state.js`):

```js
{
  id, name, map: {...}, images: [...],
  archived: false,   // nuovo — di default false
  isDefault: false   // nuovo — di default false, vero su al più UNA location
}
```

`migrate()` in `server/state.js` viene esteso per assegnare `archived: false` e `isDefault: false` alle location esistenti che ne sono prive (stesso pattern già usato per `scale`/`flip180`/`grid.color` ecc.).

## Comportamento all'avvio del server

Subito dopo `loadState()` in `server/index.js` (dove oggi `state = loadState()`), una nuova funzione `applyStartupDefault(state)`:
1. Cerca una location con `isDefault === true` e `archived === false`.
2. Se la trova, forza `state.activeLocationId` a quel valore (sovrascrivendo quanto persistito), e resetta `activeImageId = null` e `liveView = { scale: 1, offsetX: 0, offsetY: 0 }` — stessa pulizia di stato già fatta oggi dall'handler `location:set` quando si cambia location a mano.
3. Se non la trova (nessuna location è marcata default, o quella marcata è archiviata/non esiste più), ricade sulla prima location con `archived === false`, se esiste; altrimenti `activeLocationId = null`.

Questo comportamento vale solo all'avvio del processo — cambiare location durante l'uso normale (via `location:set`) continua a funzionare come oggi, senza toccare il flag `isDefault`.

## Nuovi eventi socket (`server/index.js`)

- **`location:create`** `{}` → crea una location con id generato (`nanoid`), nome `"Nuova location"`, mappa/griglia/fog/immagini vuoti (stessa struttura di default già in `DEFAULT_STATE`), `archived: false`, `isDefault: false`; la aggiunge a `state.locations`, la imposta come `activeLocationId` (con lo stesso reset di `activeImageId`/`liveView` di `location:set`), salva e trasmette.
- **`location:rename`** `{ locationId, name }` → rinomina sul posto, stesso pattern di `image:rename` (troncamento a 120 caratteri, nessuna validazione oltre).
- **`location:archive`** `{ locationId }` → imposta `archived: true`. Se `locationId === state.activeLocationId`, imposta `state.activeLocationId = null` (niente fallback automatico ad altre location — coerente con "va bene mostrare il placeholder"). Non tocca i file su disco.
- **`location:restore`** `{ locationId }` → imposta `archived: false`. Non cambia `activeLocationId` (il ripristino non attiva automaticamente la location).
- **`location:setDefault`** `{ locationId }` → imposta `isDefault: true` sulla location indicata e `isDefault: false` su tutte le altre (al più una location predefinita alla volta). Azione non distruttiva, nessuna conferma richiesta.

Tutti seguono il pattern esistente: validano che la location esista, mutano `state`, chiamano `saveState(state)` e `broadcastState()`.

## Nuovo endpoint REST: pulizia file orfani

`POST /api/storage/orphans/scan` → restituisce l'elenco dei file in `storage/maps/` e `storage/images/` non referenziati da nessun `location.map.file` o `location.images[].file`, su **tutte** le location (attive e archiviate), con nome file e dimensione in byte.

`POST /api/storage/orphans/purge` `{ files: [...] }` → cancella (via lo stesso `deleteUploadedFile()` già usato da `image:delete`, con lo stesso controllo che il path non esca dalla cartella) solo i file passati in `files`, ma solo dopo averli ri-verificati come effettivamente orfani al momento della chiamata (ri-esegue lo scan e cancella l'intersezione — se nel frattempo un file è stato usato da un nuovo upload, non viene toccato). Risponde con l'elenco dei file effettivamente cancellati.

Due chiamate separate (scan poi purge con conferma esplicita dell'elenco) invece di un singolo "cancella tutto" — coerente con "più difficile da raggiungere, con conferma".

## Editor UI

**Toolbar/header**: un pulsante "+" (icona `i-plus`, da aggiungere allo sprite SVG esistente) accanto al menu a tendina `#location-select` in cima alla pagina — click chiama `location:create`, la nuova location diventa subito quella visualizzata (già gestito dal fatto che diventa `activeLocationId`), pronta per essere rinominata sul posto.

**Nuovo pannello "Location" nella sidebar** (`public/editor/index.html`, stesso stile di sezione di Immagini/Fog of war), con due liste:
- **Attive**: una riga per location non archiviata — nome in un `<input type="text">` che commit su blur/Enter (stesso pattern di `image-name-input`), un'icona stella (piena se `isDefault`, vuota altrimenti — click chiama `location:setDefault`), un pulsante archivia (icona cestino, arma-poi-conferma come `delete-polygon`/`image-delete`, chiama `location:archive` alla conferma).
- **Archiviate**: sotto, collassabile o semplicemente più in basso, una riga per location con `archived: true` — stesso campo nome modificabile sul posto (`location:rename` funziona indipendentemente dallo stato di archiviazione), un pulsante "ripristina" che chiama `location:restore`.

**Fondo sidebar**: un link testuale discreto (stile `.link-btn`, non un `.icon-btn` in evidenza) "pulisci file orfani" → al click chiama lo scan REST e mostra l'elenco trovato (nome + dimensione) con un pulsante di conferma arma-poi-conferma per il purge.

## Display/controllo

Nessuna modifica: quando `state.activeLocationId` è `null`, `getActiveLocation()` già restituisce `undefined`/`null`, e sia `display.js` che `control.js` già gestiscono `location` assente mostrando il placeholder "nessuna mappa" esistente (verificato: i rendering path principali usano già `if (location.map.file)` con guardia, e il caso "location stessa assente" richiede solo di estendere quella guardia a `if (location && location.map.file)` dove non già presente).

## Fuori scope (esplicitamente)

- Riordino delle location nell'elenco.
- Duplicazione di una location come punto di partenza per una nuova.
- Qualunque stato "in modifica" nell'editor separato da quello "in onda" sulla TV.
- Cancellazione automatica dei file quando si archivia una location (solo la pulizia orfani separata li tocca).
- Limite al numero di location.

## Verifica

Nessuna suite di test automatica nel progetto (per scelta, coerente con tutto il resto dell'app) — verifica manuale via browser: creare/rinominare/archiviare/ripristinare location dall'editor, confermare che l'archiviazione della location attiva mostri il placeholder su display e controllo, riavviare il server e confermare che riparta sulla location marcata come predefinita ignorando quella attiva al momento dello spegnimento, e verificare lo scan/purge orfani su file di prova (mai su dati reali della campagna).
