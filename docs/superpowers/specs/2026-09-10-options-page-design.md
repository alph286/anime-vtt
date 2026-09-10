# Pagina Opzioni — Design

**Goal:** una nuova pagina `/opzioni`, raggiungibile da `/editor`, che permetta di configurare l'URL di PicSender e il nome della campagna senza modificare file a mano, mostri i credit e la versione del software, e offra collegamenti rapidi a `/control` e `/display`.

**Architecture:** una quarta pagina statica (`public/opzioni/`), nello stesso stile visivo scuro già in uso ovunque (`/shared/theme.css`). A differenza di editor/control/display, non ha bisogno di sincronizzazione in tempo reale via socket.io — è una pagina che si apre di rado, per conto proprio, non mentre altri schermi sono aperti in parallelo: usa normali richieste HTTP (`GET`/`POST`), più semplice del pattern socket.io usato altrove.

`PICSENDER_URL` smette di vivere solo in `.env` e si sposta in `data/state.json` (nuovo campo `state.settings.picsenderUrl`), con lo stesso meccanismo di salvataggio già usato per tutto il resto dell'app. Alla prima apertura dopo l'aggiornamento, se `.env` ha già `PICSENDER_URL` impostato, il valore viene migrato automaticamente in `state.settings.picsenderUrl` — chi lo aveva già configurato non deve reinserirlo. Il nome della campagna usa il campo `state.campaign.name` già esistente (oggi modificabile solo a mano nel JSON), senza duplicarlo in un campo nuovo.

Alternativa scartata: tenere `PICSENDER_URL` solo in `.env` e far scrivere alla pagina Opzioni direttamente quel file. Scartata perché riscrivere un `.env` da codice rischia di perdere commenti/formattazione/altre variabili che l'utente ci ha messo a mano, e perché romperebbe la coerenza con come ogni altra impostazione di questa app viene salvata (sempre `data/state.json`, mai file di configurazione riscritti a runtime).

Endpoint nuovi, ridotti al minimo: la pagina legge i valori iniziali dal già esistente `GET /api/state` (che dopo la migrazione include `campaign.name` e `settings.picsenderUrl` come qualunque altro campo dello stato) — nessun nuovo endpoint di lettura per le impostazioni. Solo due aggiunte: `POST /api/settings` per salvare, e `GET /api/info` per i dati statici che non vivono nello stato (versione, percorsi, repository).

## Header e navigazione

Una nuova icona (ingranaggio) nell'header di `/editor`, subito a destra di quella esporta/importa — click porta a `/opzioni` come una vera navigazione di pagina (non un menu a tendina, a differenza di esporta/importa e pulizia orfani). Nella pagina Opzioni, un pulsante "← Editor" in alto a sinistra (stesso stile `icon-btn` già in uso) riporta a `/editor`.

## PicSender

Un campo testo con l'URL attuale (precompilato da `state.settings.picsenderUrl`) e due pulsanti separati:
- **Salva** — persiste URL e nome campagna (vedi sezione successiva, stesso form) su `data/state.json` via `POST /api/settings`. Non testa la connessione da solo: salvare e verificare restano due azioni distinte e prevedibili.
- **Testa connessione** — richiama l'endpoint già esistente `/api/telegram/destinations` (quello che l'editor usa già per popolare le destinazioni nell'invio foto) sull'URL attualmente salvato, e mostra subito l'esito: numero di destinazioni trovate se funziona, il messaggio d'errore se no. Riusa una funzione server già scritta, nessun nuovo endpoint di test.

## Nome campagna

Un campo testo nello stesso form (stesso pulsante Salva), precompilato da `state.campaign.name`. Puramente informativo/cosmetico all'interno dell'app (non ha effetto sul funzionamento, solo sui metadati di export/import) — risolve la frizione che il README lasciava aperta ("puoi cambiarlo modificando data/state.json a mano").

## Link rapidi

Due pulsanti, "Apri /control" e "Apri /display", ciascuno un link (`target="_blank"`) che apre la rispettiva pagina in una nuova scheda — non serve conoscere a memoria gli URL o scriverli a mano nella barra degli indirizzi.

## Percorsi di salvataggio

Sezione di sola lettura che mostra i percorsi assoluti correnti di `DATA_DIR` e `STORAGE_DIR` (letti da `GET /api/info`, gli stessi valori già usati internamente dal server). Utile per chi deve fare un backup manuale delle cartelle — altra domanda che il README lascia implicita senza rispondere.

## Credits e versioning

Testo fisso: "Made with love, substances and vibe coding by **Alph286**" con il nome collegato a `https://github.com/alph286`, più il numero di versione corrente (da `GET /api/info`, letto dal `version` di `package.json` lato server — mai duplicato a mano in due posti). La versione in `package.json` passa da `0.1.0` a **`1.0.0-beta`**: il set di funzionalità è ormai quello di una v1 completa (location, fog of war con editing e undo/redo, griglia, rosa dei venti, audio, invio Telegram, export/import, interfaccia a schede), "beta" perché resta un progetto personale mai testato da altri.

## Gestione errori

- `POST /api/settings` con un URL PicSender vuoto è valido (significa "non configurato", stesso comportamento già gestito ovunque in `picsender.js`) — nessun errore, nessuna validazione di formato URL lato server (un URL scritto male si scopre subito col pulsante "Testa connessione", non serve bloccarlo prima).
- "Testa connessione" con nessun URL salvato mostra lo stesso messaggio che l'editor già mostra oggi in quel caso ("PICSENDER_URL non configurato"), non un errore diverso.
- Se PicSender non risponde o risponde con un errore, il messaggio mostrato è lo stesso testo d'errore che `picsender.js` già produce per quel caso (nessun messaggio nuovo da inventare/mantenere in due posti).

## Testing

Nessuna suite automatica (per scelta di progetto). Verifica manuale su server isolato:
- Aprire `/opzioni` dall'icona nell'header di `/editor`, verificare che i campi mostrino i valori già presenti in `data/state.json`.
- Con un `.env` che ha `PICSENDER_URL` impostato ma `data/state.json` senza il campo `settings`: al primo avvio del server, verificare che la migrazione lo copi in `state.settings.picsenderUrl` senza bisogno di reinserirlo.
- Cambiare URL PicSender e nome campagna, Salva, ricaricare la pagina → i nuovi valori restano.
- Testa connessione con un URL PicSender valido e raggiungibile → mostra il numero di destinazioni.
- Testa connessione con URL vuoto o non raggiungibile → mostra il messaggio d'errore corretto, nessun crash.
- Cliccare "Apri /control" e "Apri /display" → si aprono in una nuova scheda, `/opzioni` resta aperta dov'era.
- Percorsi di salvataggio mostrati corrispondono a `DATA_DIR`/`STORAGE_DIR` realmente in uso (confrontare con le variabili d'ambiente impostate per il server isolato di test).
- Cliccare "← Editor" → torna a `/editor`.
- Verificare che inviare una foto su Telegram dall'editor continui a funzionare dopo il refactor di `picsender.js` (l'URL letto ora viene da `state.settings.picsenderUrl`, non più da `process.env` in lettura diretta).
