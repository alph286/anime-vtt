# Invio Foto a Telegram via PicSender — Design

**Goal:** dal `/control`, poter inviare una foto già caricata su una location (quelle mostrabili ai giocatori via `image:show`) al gruppo Telegram della campagna, nel topic giusto, con una didascalia — riusando PicSender, l'app Flask già in produzione sul Raspberry Pi che gestisce l'invio vero e proprio (bot Telegram, resize, retry). Come parte della stessa funzione, ogni foto guadagna una didascalia e una destinazione (topic) assegnabili e modificabili sia da `/editor` che da `/control`, e la selezione di una foto in `/control` diventa un'anteprima locale (non istantaneamente visibile ai giocatori) — lo stesso principio già usato per l'anteprima delle location.

**Architettura:** anime-vtt non implementa nulla di Telegram: il suo server fa da proxy verso l'API HTTP già esistente di PicSender (`GET /api/destinations`, `POST /api/upload`, `POST /api/send`, `DELETE /api/images/<id>`), senza alcuna modifica a PicSender. Ogni invio è un ciclo completo upload→send→delete: PicSender resta solo un tramite, non un secondo archivio delle foto del VTT.

**Tech Stack:** Node/Express/socket.io lato server (fetch nativo per chiamare PicSender), vanilla JS lato client — stessi di tutto il resto del progetto. Nessuna nuova dipendenza.

## Ambito

Riguarda solo `location.images[]` — le foto mostrabili ai giocatori da `/control` (`image:show`/`image:hide`). La mappa di sfondo della location resta fuori: non è inviabile a Telegram con questa funzione.

## Integrazione con PicSender

PicSender espone già (senza modifiche):
- `GET /api/destinations` → `[{index, name}, ...]`
- `POST /api/upload` (multipart, campo `images`) → salva, ridimensiona, genera thumbnail, ritorna `{saved: [{id, ...}], skipped}`
- `POST /api/send` con `{ids, caption, destination: <indice>}` → invia via bot al `chat_id`/`thread_id` configurato per quella destinazione
- `DELETE /api/images/<id>` → rimuove file e metadati

Il server di anime-vtt aggiunge una variabile d'ambiente `PICSENDER_URL` (es. `http://raspberryserver.local:5001`), seguendo lo stesso pattern di `PORT`/`DATA_DIR`/`STORAGE_DIR` già in `.env`. Se non impostata, ogni funzione legata a Telegram risponde con un errore chiaro invece di andare in crash o bloccare l'avvio del server.

### Elenco destinazioni (proxy)

Nuovo endpoint su anime-vtt: `GET /api/telegram/destinations`. Il server chiama `GET /api/destinations` su PicSender e rilancia il JSON così com'è. Usato da `/editor` e `/control` per popolare le tendine destinazione. Se PicSender non risponde, l'endpoint risponde con un errore che il client interpreta come "destinazioni non disponibili" (tendina disabilitata, nessun crash).

### Flusso di invio

Trigger: evento socket `image:sendTelegram { locationId, imageId }`, emesso dal pulsante "Invia" di `/control`. Il server, per quell'immagine:

1. Legge il file da `storage/images/<file>`.
2. `POST /api/upload` su PicSender (multipart) → ottiene un `id` temporaneo lato PicSender.
3. Risolve `image.telegramDestination` (un **nome**, es. `"Anime Salve — Mappe"`) all'indice richiesto da PicSender, cercandolo nella lista corrente di `GET /api/destinations`. Se non lo trova più (rinominato/rimosso su PicSender nel frattempo), interrompe con un errore esplicito, senza inviare.
4. `POST /api/send` con `{ids:[id], caption: image.caption, destination: <indice risolto>}`.
5. Se l'invio riesce **o** fallisce, tenta comunque (best-effort) `DELETE /api/images/<id>` su PicSender per ripulire la copia temporanea — PicSender non deve mai accumulare le foto inviate dal VTT. Un fallimento della cancellazione non sovrascrive un eventuale errore d'invio già riportato.
6. Risponde al client con `telegram:sendResult { imageId, ok, error? }`.

Ogni invio ripete l'intero ciclo da zero: non c'è alcun id PicSender salvato tra un invio e l'altro. Rinviare la stessa foto in futuro funziona esattamente come la prima volta.

**Lato VTT, l'immagine non viene mai toccata automaticamente da questo flusso**: resta in `location.images[]`, mostrabile e re-inviabile quante volte serve, indipendentemente dagli invii Telegram passati.

## Data model

Ogni elemento di `location.images[]` guadagna due campi:
- `caption: ''` (didascalia, default stringa vuota)
- `telegramDestination: null` (nome della destinazione scelta, o `null` se non ancora assegnata — un nome, non un indice, perché l'indice può cambiare se la lista destinazioni su PicSender cambia; il nome viene risolto all'indice corretto solo al momento dell'invio, per restare valido anche se l'ordine su PicSender cambia)

Migrazione: backfill dei due campi per le immagini esistenti che non li hanno ancora, stesso pattern già usato per gli altri campi opzionali di `location.images`/`location.map`.

Due nuovi eventi socket, paralleli all'esistente `image:rename`:
- `image:caption { locationId, imageId, caption }`
- `image:destination { locationId, imageId, destination }` (`destination` è il nome, o `null` per rimuovere l'assegnazione)

## Modifiche a `/editor`

Ogni riga della lista immagini (`image-editor-row`, quella con thumbnail + nome + cestino) guadagna due nuovi campi editabili in-place, con lo stesso comportamento del campo nome esistente (aggiornamento immediato al `change`, nessun salvataggio esplicito):

- **Didascalia**: campo di testo che emette `image:caption`.
- **Destinazione**: tendina popolata da `GET /api/telegram/destinations` (richiesta una volta al caricamento della pagina), che emette `image:destination`. Se le destinazioni non sono disponibili, la tendina mostra "Destinazioni non disponibili" e resta disabilitata, senza bloccare il resto della pagina.

Appena una foto viene caricata, la riga compare subito con questi due campi vuoti, pronti da compilare nello stesso punto dove già si rinomina l'immagine.

## Modifiche a `/control`

Stesso principio dell'anteprima già esistente per le location: selezionare una foto nella griglia non la mostra subito ai giocatori. Un nuovo stato locale `previewImageId` (analogo a `previewLocationId`) traccia quale foto stai guardando/modificando su `/control`, indipendente da `state.activeImageId` (quella davvero visibile su `/display`). Di default `previewImageId` è `null` (nessun pannello, solo la griglia): se un'immagine è già in mostra quando apri `/control`, la griglia la evidenzia (come oggi) ma il pannello di dettaglio resta chiuso finché non la tocchi esplicitamente — coerente con l'idea che aprire `/control` non deve mai spostare cosa stai già guardando/modificando.

- **Tap su una thumbnail nella griglia immagini** → imposta `previewImageId` (nessuna chiamata al server) e apre un pannello con l'immagine ingrandita, il campo **didascalia** e la tendina **destinazione** (stessi eventi `image:caption`/`image:destination` di `/editor` — editabili anche da qui, in qualunque momento, non solo al caricamento), e tre pulsanti:
  - **Mostra** — emette `image:show { imageId: previewImageId }`: `/display` passa a mostrare questa foto. Mostra uno stato "già in mostra" (disabilitato o evidenziato) quando `state.activeImageId === previewImageId`.
  - **Invia** — emette `image:sendTelegram { locationId, imageId: previewImageId }`. Disabilitato finché `telegramDestination` non è assegnata. Mostra un feedback transitorio di successo o errore in base a `telegram:sendResult`.
  - **Ritorna alla mappa** — emette `image:hide`: `/display` torna a mostrare la mappa. Abilitato solo quando qualcosa è effettivamente in mostra (`state.activeImageId` impostato) — sostituisce l'attuale pulsante "Torna alla mappa".

La griglia di thumbnail resta visibile sopra il pannello, per cambiare foto selezionata in qualsiasi momento. Il pannello (didascalia, destinazione, i tre pulsanti) si comporta allo stesso modo sia che la foto sia solo in anteprima sia che sia già live su `/display` — cambia solo lo stato dei tre pulsanti, non l'editabilità dei campi.

## Gestione errori

- **PicSender irraggiungibile** (Pi spento, URL sbagliato, servizio giù): la richiesta destinazioni fallisce → tendine caption/destinazione disabilitate con un messaggio, senza bloccare il resto della pagina. Un tentativo di invio in questo stato risponde con un errore chiaro ("PicSender non raggiungibile").
- **Errore Telegram/PicSender a invio già iniziato** (bot token sbagliato, rate limit non recuperato, ecc.): il messaggio d'errore di PicSender viene mostrato così com'è nel banner di errore su `/control`. La pulizia (`DELETE`) viene comunque tentata come passo finale best-effort, ma non sovrascrive l'errore da mostrare.
- **Destinazione assegnata a un'immagine ma non più presente su PicSender**: risolvendo il nome all'indice al momento dell'invio, se non si trova viene riportato un errore esplicito ("Destinazione «X» non più configurata su PicSender") invece di inviare al topic sbagliato o andare in crash.
- **`PICSENDER_URL` non configurato**: il server non va in crash all'avvio; ogni chiamata verso PicSender (destinazioni o invio) risponde con un errore chiaro finché la variabile non viene impostata.

## Testing

Nessuna suite automatica (per scelta di progetto). Verifica manuale su server isolato, con PicSender vero (o un finto server HTTP che simula le sue risposte per i casi di errore):
- Caricare una foto da `/editor`, impostare didascalia e destinazione, verificare che compaiano subito anche riaprendo `/control`.
- Modificare didascalia/destinazione da `/control` e verificare che si riflettano anche in `/editor` (stato condiviso via socket, come già per il rename).
- Selezionare una foto in `/control`: verificare che non cambi nulla su `/display` finché non si preme "Mostra".
- "Mostra" → la foto compare su `/display`; "Ritorna alla mappa" → torna la mappa.
- "Invia" con destinazione assegnata → la foto arriva nel topic Telegram giusto con la didascalia corretta; verificare che la copia temporanea sparisca da PicSender (nessuna voce residua in `images.json`/`uploads/`) e che l'immagine resti intatta e ri-mostrabile/ri-inviabile sul VTT.
- "Invia" senza destinazione assegnata → pulsante disabilitato.
- PicSender spento → tendine destinazione disabilitate con messaggio, tentativo di invio fallisce con errore leggibile, nessun crash del server VTT.
- Un secondo invio della stessa foto in una sessione successiva → funziona di nuovo da zero (nuovo upload su PicSender, nuovo invio, nuova cancellazione).
