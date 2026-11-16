# Anime VTT (Magnetron)

Display locale di mappe e fog of war per campagne D&D. Il server (Express +
socket.io, `server/`) gira su un Raspberry Pi e serve solo file statici.

La cronaca delle sessioni fino all'11 nov 2026 (decisioni, deviazioni, cose
verificate e non, limiti noti di ogni lavoro) è in
`docs/storia/claude-md-fino-al-2026-11-11.md`: cercala lì prima di toccare una
parte che non conosci. Spec e piani: `docs/superpowers/specs/` e `plans/`.

## Pagine

| Pagina | Cos'è | Codice |
|---|---|---|
| `/editor` | preparazione delle location (DM, mouse) | `editor-app/src/` (React + shadcn) |
| `/control` | regia in sessione (DM, telefono) | `editor-app/src/control/` |
| `/party` | mappa e aree d'effetto per i giocatori | `editor-app/src/party/` (riusa store e componenti di /control, mai copie) |
| `/display` | TV dei giocatori, kiosk sul Raspberry | `public/display/` (vanilla, lasciato così apposta) |
| `/handout` | secondo schermo: media in onda su /display, altrimenti default della location attiva, poi globale, poi nero | `public/handout/` (vanilla) |
| `/opzioni` | campagna e Telegram | `public/opzioni/` (vanilla) |

`public/shared/media.js`, `shader-effects.js` e `audio-fade.js` sono script
classici (globali, tipi in `editor-app/src/globals.d.ts`): non sono ES module
e non vanno importati.

## Regole di lavoro

- **Branch dedicato** per ogni lavoro, proposto prima di iniziare. Mai su `main`.
- **Mai sui dati veri.** Le prove usano la porta 3100 con `DATA_DIR` e
  `STORAGE_DIR` su una copia o su cartelle vuote.
- **Mai aprire `/display` o `/control` di prova su un server in uso**: il server
  tiene un solo `displayViewport` e un solo `displayAudio` globali, una scheda di
  prova li sovrascrive e sballa la sessione vera. Per leggere lo stato usa un
  client socket in sola lettura.
- **Build committate.** Express serve `public/editor`, `public/control` e
  `public/party` già costruite. Dopo ogni modifica sotto `editor-app/` (o ai
  componenti di /control che /party riusa): `npm run build:all` e commit di
  `public/`. `npm run check:build` fallisce se te ne dimentichi.
- **Test:** `npm test` dalla radice (server con `node --test`, Vitest di
  `editor-app`, controllo della build). Deve essere verde prima di ogni commit.
- **Shader:** niente screenshot per giudicarli; si controlla che compilino e,
  se serve, i pixel con `gl.readPixels` nello stesso frame. Il giudizio visivo
  lo dà Alph dal vivo.
- **Prove a puntatore:** sempre la terna completa pointerdown, move, up, e il
  DOM va riletto a ogni click (le liste si ridisegnano).
- **Cronaca:** a fine lavoro NON allungare questo file. Scrivi decisioni, cose
  verificate e non verificate in `docs/storia/AAAA-MM-GG-<nome>.md`; qui
  aggiungi una riga solo se cambia una regola o una delle sezioni sotto.

## Sicurezza

- **PIN del DM** (`DM_PIN` in `.env`, `server/auth.js`): predisposto ma SPENTO
  (`DM_PIN` vuoto, scelta di Alph: si gioca tra amici). Se lo si accende, senza cookie valido
  sono raggiungibili solo `/`, `/party`, `/display`, `/handout`, `/shared`,
  `/storage`, `/home`, `/login`, `/api/login`, `/api/webproxy`, e sui socket
  solo `hello`, `display:viewport`, `audio:status`, `audio:oneshotEnded` e gli
  eventi `aoe:*`. Una route o un evento nuovo è del DM per default: se deve
  usarlo un giocatore o il display va aggiunto all'elenco in `server/auth.js`.
- **Token Telegram** in `data/telegram.json` (0600, gitignored), mai in `state`:
  `state:update` arriva a ogni client e finisce nei backup.
- `state:update` manda a tutti lo stato intero, zone di fog non rivelate
  comprese: i giocatori su `/party` lo ricevono.

## Stato sul server

- `state` (in `server/index.js`) viene RIASSEGNATO dal ripristino di un backup:
  un modulo che ne tiene un riferimento resta sul vecchio.
- I trascinamenti (pan, AOE, shader) passano da `scheduleSaveAndBroadcast`
  (un salvataggio ogni 60 ms al massimo); il resto salva subito.
- `displayViewport` e `displayAudio` vivono solo in memoria, fuori da `state`.
- Eventi socket in `server/socket-<gruppo>.js` (`register<Gruppo>Events(socket, ctx)`), rotte di upload e backup in `server/routes-*.js`; i moduli leggono lo stato solo con `ctx.getState()` dentro ogni handler. I moduli stanno in `server/` e non in sottocartelle: il test «copertura» legge solo `server/*.js`.
- Logica audio in `server/audio.js`, Telegram in `server/telegram*.js`,
  export/import in `server/exportImport.js`, migrazioni in `server/state.js`.

## Mai verificato dal vivo (serve Alph)

- Invio reale su Telegram (foto, `mp4` come animazione, ripiego su documento) e
  «Rileva» con un bot vero.
- Ascolto dell'audio: durate dei fade e ducking (`AUDIO_FADE`,
  `AUDIO_DUCK_LEVEL` in `public/shared/audio-fade.js`), più tracce insieme sul
  Raspberry, eco tra `/display` e `/handout`, stato «bloccato dal browser».
- Tocco vero su telefono: pinch a due dita su `/control`, trascinamento su
  `/party`, più telefoni insieme.
- Resa visiva degli shader (ping, scia, aree d'effetto, linea).
- Pagine Web su siti internet reali, video `mp4` su `/handout`, media su una TV.
