# Invio foto su Telegram nativo (senza PicSender) — Design

**Goal:** chi scarica il repo deve poter configurare da solo, dal browser, l'invio di foto su Telegram, senza installare PicSender. L'integrazione PicSender esce dal progetto (scelta esplicita: "solo Telegram nativo"); il PicSender dell'autore resta acceso per conto suo, ma anime-vtt non lo usa più.

**Successo:** un utente nuovo crea un bot con @BotFather, lo configura in `/opzioni` (token + destinazioni, anche con rilevamento automatico di chat e topic) e invia foto da `/control` come oggi. L'UI di invio (didascalia, tendina destinazione, pulsante Invia) non cambia.

**Assunzioni** (non dette dall'utente, da confermare nella review):
- Il bot è dell'utente; il progetto non fornisce un bot condiviso.
- Il VTT gira in rete locale, senza autenticazione sugli endpoint (come oggi): per questo il token non deve mai essere leggibile da nessun client.

## Vincolo di sicurezza che guida il design

`state` (comprese le `settings`) viene trasmesso con `state:update` a TUTTI i client (`/display`, `/party`, ogni telefono in rete). Il bot token NON può stare in `state`. Vive in un file separato lato server, non incluso in `state:update`, negli export né nei backup, e nessun endpoint lo restituisce in chiaro.

## Architettura

### `server/telegram.js` (client Bot API, puro)
`fetch` iniettabile per i test. Nessuno stato, nessun accesso a file.
- `getMe(token)` → `{ ok, username }`, valida il token.
- `sendPhoto({ token, chatId, threadId, filePath, caption })` → `{ ok } | { ok:false, error }`. Non lancia mai. Se Telegram rifiuta la foto per dimensioni/peso (`PHOTO_INVALID_DIMENSIONS`, file oltre 10 MB), secondo tentativo con `sendDocument` (file originale, non compresso). Il 429 non viene ritentato: l'errore riporta `retry_after`.
- `sendText({ token, chatId, threadId, text })` per la prova invio.
- `detectChats(token)` → `[{ chatId, chatTitle, threadId|null, topicName|null }]` da `getUpdates` SENZA `offset` (gli aggiornamenti non vengono consumati). Il nome del topic compare solo se è stato visto il messaggio di creazione; altrimenti `topicName` è null e la UI mostra "Topic <id>". Un 409 (webhook attivo) diventa un errore dedicato; il webhook non viene toccato.
- Errori tradotti in italiano: token non valido (401), bot non nel gruppo o senza permessi (400/403), webhook attivo (409), rate limit (429 + secondi), Telegram irraggiungibile.

### `server/telegram-config.js` (persistenza)
File `data/telegram.json`: `{ botToken: string, destinations: [{ name, chatId, threadId|null }] }`.
- Scrittura atomica (file temporaneo + rename), permessi `0600`.
- File mancante o corrotto → "non configurato" (stato vuoto), il server parte comunque.
- `data/telegram.json` va in `.gitignore`.
- Validazione destinazioni: nome non vuoto e univoco, `chatId` numerico (anche negativo), `threadId` intero positivo o assente.
- Viste: `publicConfig()` → `{ tokenSet, botUsername, destinations }` (mai il token).

### Endpoint (in `server/index.js`)
- `GET /api/telegram/destinations` → `[{ name }]` (solo nomi: lo usano `/editor` e `/control`; il hook client `use-telegram-destinations.ts` legge già solo `name`, nessuna modifica).
- `GET /api/telegram/config` → `publicConfig()`, per `/opzioni`.
- `POST /api/telegram/token` → valida con `getMe`, salva solo se valido. `DELETE` lo rimuove.
- `PUT /api/telegram/destinations` → valida e salva la lista.
- `POST /api/telegram/detect` → `detectChats`.
- `POST /api/telegram/test` `{ name }` → `sendText` alla destinazione, per la prova invio.

### Invio
L'evento socket `image:sendTelegram { locationId, imageId }` e la risposta `telegram:sendResult { imageId, ok, error? }` restano identici. Il server risolve `image.telegramDestination` (un nome) nella riga di `destinations` e chiama `sendPhoto`. Nome non più presente → errore esplicito come oggi, senza inviare. Nessuna destinazione assegnata → errore come oggi.

## UI di `/opzioni`
Sezione "Telegram" al posto del campo URL PicSender (resta "Nome campagna" e il resto della pagina):
1. **Bot**: campo token (password) + "Salva". Valida con `getMe`, poi mostra "Bot @nome ✓". Il token non viene mai ricaricato nel campo: dopo il salvataggio compare "configurato" con "Sostituisci" e "Rimuovi". Breve passo-passo: crea il bot con @BotFather, aggiungilo al gruppo, nei gruppi con topic dagli il permesso di scrivere.
2. **Destinazioni**: tabella nome / `chat_id` / `thread_id` (facoltativo) / elimina, "Aggiungi riga", salvataggio unico, errori di validazione sotto la riga colpevole.
3. **Rileva**: l'utente scrive un messaggio nel topic voluto, preme il pulsante, vede le chat/topic visti; un click compila una nuova riga (sceglie solo il nome). L'inserimento manuale resta sempre possibile.
4. **Prova invio**: pulsante per riga che manda un messaggio di test a quella destinazione.

## Rimozioni e migrazione
- Rimossi: `server/picsender.js`, `settings.picsenderUrl` (e la sua migrazione in `server/state.js`), il campo e il "Testa connessione" di `/opzioni` (`public/opzioni/index.html`, `opzioni.js`), `PICSENDER_URL` da `.env.example`, le menzioni nel README.
- `state.settings` resta come contenitore per le altre impostazioni (per ora solo il nome campagna vive in `state.campaign`): una `picsenderUrl` presente in uno `state.json` esistente viene semplicemente ignorata e rimossa al primo salvataggio.
- `image.telegramDestination` è già un nome: ricreando le destinazioni con gli stessi nomi di PicSender le assegnazioni esistenti tornano valide, senza migrazione.
- Export/import non contengono impostazioni Telegram (portano solo `telegramDestination`): invariati.
- Da verificare in implementazione: che l'export "backup" non impacchetti l'intera `data/` (altrimenti `telegram.json` dev'essere escluso esplicitamente).

## Test
- `node --test` per `telegram.js` con `fetch` finto: successo, ogni codice d'errore, ripiego su `sendDocument`, parsing di `getUpdates` con e senza topic, 409 webhook.
- `node --test` per `telegram-config.js`: scrittura atomica, file mancante, file corrotto, validazione destinazioni, permessi `0600`.
- Test di regressione: il token non compare mai in `state:update`, `GET /api/telegram/config`, `GET /api/telegram/destinations`, export location, export backup.
- Vitest per `use-telegram-destinations` solo se il formato cambia (non cambia).
- Verifica nel browser su copia dei dati (mai sui dati vivi).
- **Non verificabile senza bot reale:** un invio vero su Telegram. Resta "non verificato" finché l'autore non lo prova con un proprio bot e una propria chat.

## Fuori scope
Webhook e ricezione messaggi, più bot contemporanei, invio di mappe o di video, ridimensionamento lato server (il ripiego su `sendDocument` basta), autenticazione degli endpoint.
