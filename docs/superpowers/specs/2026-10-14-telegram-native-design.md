# Invio foto su Telegram nativo (senza PicSender) — Design

**Goal:** chi scarica il repo deve poter configurare da solo, dal browser, l'invio di foto su Telegram, senza installare PicSender. L'integrazione PicSender esce dal progetto (scelta esplicita: "solo Telegram nativo"); il PicSender dell'autore resta acceso per conto suo, ma anime-vtt non lo usa più.

**Successo:** un utente nuovo crea un bot con @BotFather, lo configura in `/opzioni` (token + destinazioni, anche con rilevamento automatico di chat e topic) e invia dalla scheda **Media** di `/control` sia foto sia **video**. L'UI di invio (didascalia, tendina destinazione, pulsante Invia) resta quella di oggi, ma ora vale anche per i video.

**Contesto (dopo il merge di `main`):** la scheda Immagini si chiama **Media** e contiene anche video (handout, fino a 150 MB, estensioni `mp4 webm ogv ogg mov m4v mkv avi wmv flv`). Oggi per i video il server risponde "Invio dei video su Telegram non supportato" e la UI nasconde didascalia e "Invia". Questa spec toglie entrambi i blocchi.

**Assunzioni** (non dette dall'utente, da confermare nella review):
- Il bot è dell'utente; il progetto non fornisce un bot condiviso.
- Il VTT gira in rete locale, senza autenticazione sugli endpoint (come oggi): per questo il token non deve mai essere leggibile da nessun client.

## Vincolo di sicurezza che guida il design

`state` (comprese le `settings`) viene trasmesso con `state:update` a TUTTI i client (`/display`, `/party`, ogni telefono in rete). Il bot token NON può stare in `state`. Vive in un file separato lato server, non incluso in `state:update`, negli export né nei backup, e nessun endpoint lo restituisce in chiaro.

## Architettura

### `server/telegram.js` (client Bot API, puro)
`fetch` iniettabile per i test. Nessuno stato, nessun accesso a file.
- `getMe(token)` → `{ ok, username }`, valida il token.
- `sendMedia({ token, chatId, threadId, filePath, caption })` → `{ ok } | { ok:false, error }`. Non lancia mai. Sceglie il metodo dall'estensione (`isVideoFile` di `public/shared/media.js`):
  - **foto** → `sendPhoto`; se Telegram la rifiuta per dimensioni/peso (`PHOTO_INVALID_DIMENSIONS`, oltre 10 MB) → secondo tentativo con `sendDocument` (file originale).
  - **video `mp4`, `m4v`, `mov`** → `sendAnimation` (in chat appaiono come una GIF: autoplay, loop, muti; Telegram si aspetta H.264 senza audio, e l'audio eventualmente presente viene ignorato). Se Telegram rifiuta l'animazione → secondo tentativo con `sendDocument`.
  - **altri video** (`webm`, `ogv`, `ogg`, `mkv`, `avi`, `wmv`, `flv`) → `sendDocument` (arrivano come file: Telegram non li riproduce come animazione). **Nessuna conversione**: niente ffmpeg né altre dipendenze, scelta esplicita ("caricherò solo MP4"). Per ottenere un'animazione l'utente carica un MP4 H.264.
  - **Limite 50 MB** (Bot API pubblico) controllato PRIMA dell'upload, per foto e video: oltre → `{ ok:false, error }` "Il file pesa X MB: Telegram accetta fino a 50 MB, comprimilo prima di inviarlo". Nessuna ricompressione e nessun supporto a Bot API locale (fuori scope).
  - Il 429 non viene ritentato: l'errore riporta `retry_after`.
  - L'upload usa `FormData`/`Blob` come oggi per PicSender, ma il file viene letto in streaming dove possibile, perché un video da 50 MB non deve restare tutto in memoria sul Raspberry Pi.
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
L'evento socket `image:sendTelegram { locationId, imageId }` e la risposta `telegram:sendResult { imageId, ok, error? }` restano identici (il nome "image" è storico: vale per ogni elemento di `location.images[]`, foto o video). Il server risolve `image.telegramDestination` (un nome) nella riga di `destinations` e chiama `sendMedia`. Il rifiuto dei video in `server/index.js` (`isVideoFile` → "non supportato") viene rimosso. Nome non più presente → errore esplicito come oggi, senza inviare. Nessuna destinazione assegnata → errore come oggi.

## Modifiche a Media (`/control` e `/editor`)
- `editor-app/src/control/tabs/ImagesTab.tsx`: tolti i due `!isVideo` che nascondono didascalia e pulsante "Invia"; i video hanno gli stessi campi e lo stesso flusso delle foto.
- `editor-app/src/sidebar/ImagePanel.tsx`: tolto `!isVideoFile(img.file)` attorno a didascalia e tendina destinazione.
- L'errore dei 50 MB arriva già dal server come `telegram:sendResult` e compare nel feedback esistente; nessuna logica nuova lato client. Eventuale testo d'aiuto accanto al pulsante per i video grossi: non necessario.
- Un video viene inviato come file originale, così com'è sul disco (nessuna conversione).

## UI di `/opzioni`
Sezione "Telegram" al posto del campo URL PicSender (resta "Nome campagna" e il resto della pagina):
1. **Bot**: campo token (password) + "Salva". Valida con `getMe`, poi mostra "Bot @nome ✓". Il token non viene mai ricaricato nel campo: dopo il salvataggio compare "configurato" con "Sostituisci" e "Rimuovi". Breve passo-passo: crea il bot con @BotFather, aggiungilo al gruppo, nei gruppi con topic dagli il permesso di scrivere.
2. **Destinazioni**: tabella nome / `chat_id` / `thread_id` (facoltativo) / elimina, "Aggiungi riga", salvataggio unico, errori di validazione sotto la riga colpevole.
3. **Rileva**: l'utente scrive un messaggio nel topic voluto, preme il pulsante, vede le chat/topic visti; un click compila una nuova riga (sceglie solo il nome). L'inserimento manuale resta sempre possibile.
4. **Prova invio**: pulsante per riga che manda un messaggio di test a quella destinazione.

## Rimozioni e migrazione
- Rimossi: `server/picsender.js` (e il blocco `isVideoFile` in `image:sendTelegram`), `settings.picsenderUrl` (e la sua migrazione in `server/state.js`), il campo e il "Testa connessione" di `/opzioni` (`public/opzioni/index.html`, `opzioni.js`), `PICSENDER_URL` da `.env.example`, le menzioni nel README.
- `state.settings` conteneva solo `picsenderUrl`: viene eliminato del tutto da `migrate` (uno `state.json` esistente lo perde al primo salvataggio). Nessun altro codice lo legge.
- `image.telegramDestination` è già un nome: ricreando le destinazioni con gli stessi nomi di PicSender le assegnazioni esistenti tornano valide, senza migrazione.
- Export/import non contengono impostazioni Telegram (portano solo `telegramDestination`): invariati.
- Verificato: `writeBackupArchive` costruisce il manifest da `state` (campagna, griglia, location), non impacchetta `data/`: `telegram.json` non finisce nei backup. Un test di regressione lo copre.

## Test
- `node --test` per `telegram.js` con `fetch` finto: successo, ogni codice d'errore, ripiego su `sendDocument`, parsing di `getUpdates` con e senza topic, 409 webhook; scelta del metodo per estensione (foto → `sendPhoto`, `mp4/m4v/mov` → `sendAnimation`, `webm/mkv/…` → `sendDocument`); rifiuto sopra 50 MB senza chiamare Telegram.
- Vitest: aggiornare `images-audio.test.tsx` (ora testa che per un video didascalia e "Invia" NON compaiano: il test va invertito) e il test del pannello Immagini dell'editor.
- `node --test` per `telegram-config.js`: scrittura atomica, file mancante, file corrotto, validazione destinazioni, permessi `0600`.
- Test di regressione: il token non compare mai in `state:update`, `GET /api/telegram/config`, `GET /api/telegram/destinations`, export location, export backup.
- Vitest per `use-telegram-destinations` solo se il formato cambia (non cambia).
- Verifica nel browser su copia dei dati (mai sui dati vivi).
- **Non verificabile senza bot reale:** un invio vero su Telegram, di foto e di video (in particolare che un `mp4` parta come animazione in loop e che il ripiego su `sendDocument` funzioni). Resta "non verificato" finché l'autore non lo prova con un proprio bot e una propria chat.

## Fuori scope
Webhook e ricezione messaggi, più bot contemporanei, invio delle mappe di sfondo (anche se video), ridimensionamento o ricompressione o conversione di foto e video (nessun ffmpeg), server Bot API locale per file oltre 50 MB, autenticazione degli endpoint.
