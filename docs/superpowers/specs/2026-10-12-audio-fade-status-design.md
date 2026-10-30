# Audio: dissolvenze e stato reale del display

Data: 2026-10-12. Branch: `claude/audio-development-proposals-664ebb`.

## Obiettivo

Transizioni audio morbide al tavolo (niente tagli netti) e, su `/control`, un
indicatore di cosa fa davvero l'audio di `/display`.

## Vincoli

- `/display` gira su Raspberry Pi 4 con Chromium in kiosk, senza mouse né tocco:
  nessun avviso o click nuovo su `/display`. L'autoplay resta com'è (funziona).
- Il modello server resta invariato: `activeAudioTrack`, `audioState`,
  `audioTriggerSeq`, eventi `audio:*` esistenti. Si aggiunge solo `audio:status`.
- Durate fisse (costanti in un solo punto), nessun campo dati nuovo salvato.
- Fuori scope: barra di avanzamento, loop A-B, normalizzazione, soundboard,
  tracce a strati.

## Comportamento

Costanti: `FADE_LOCATION_MS=2000`, `FADE_TRANSPORT_MS=400`,
`DUCK_OUT_MS=600`, `STING_IN_MS=300`, `RESUME_IN_MS=1500`.

- **Cambio file della principale** (cambio location incluso): la vecchia sfuma in
  uscita e la nuova in entrata insieme (crossfade, `FADE_LOCATION_MS`).
- **Sting speciale** (`activeAudioTrack` passa a `special`): la principale sfuma
  fino alla pausa (`DUCK_OUT_MS`) **mantenendo `currentTime`**; lo sting entra in
  `STING_IN_MS`. Alla fine dello sting (`audio:specialEnded` → server torna a
  `main`) la principale riprende dalla posizione salvata e risale in
  `RESUME_IN_MS`. Cambia rispetto a oggi: prima ripartiva da zero.
- **Ritorno forzato** (stop dello sting, location cambiata durante lo sting): la
  posizione salvata vale solo se il file della principale è lo stesso; altrimenti
  parte da zero con fade-in.
- **Play / pausa / stop**: rampa di volume di `FADE_TRANSPORT_MS`, poi
  `pause()`/azzeramento. Il comando volume del DM resta immediato (nessuna rampa).
- Re-trigger dello sting mentre suona: riparte da zero senza fade (invariato).

## `/display`

- Due elementi `<audio>` (`scene-audio`, `scene-audio-b`), alternati come
  corrente/in uscita. Rampe di volume su `requestAnimationFrame`; il volume
  finale di ogni elemento è `trackVolume * rampa`.
- Funzioni pure in un file condiviso `public/shared/audio-fade.js` (classico,
  come `media.js`): rampa lineare/ease, calcolo del volume a un istante, decisione
  della transizione (`crossfade` | `duck` | `resume` | `transport` | `none`) dati
  stato precedente e nuovo. Testate con `node --test`.
- `renderAudio` resta il punto d'ingresso; la logica di `ended`/`error` verso
  `audio:specialEnded` resta, riferita all'elemento della speciale.

## Stato reale (`audio:status`)

- Display → server: `{ status: 'playing'|'idle'|'error'|'blocked', slot }`,
  inviato quando cambia (non ad ogni frame). `blocked` = `play()` rifiutato;
  `error` = evento `error` sull'elemento / file mancante.
- Server: tiene `displayAudio` solo **in memoria** (mai su disco, mai migrato),
  lo include in `state:update`; azzerato quando il display si disconnette.
  Validazione: `status` in whitelist, `slot` in `main|special`, altrimenti ignora.
- `/control` (`AudioBox`): riga discreta "Display: in riproduzione / fermo / file
  non trovato / audio bloccato / non connesso". Sola informazione. `/party`
  invariato.

## Test e verifica

- `node --test`: rampe e decisioni di transizione; validazione `audio:status`.
- Vitest: `AudioBox` per ogni stato; store con `displayAudio`.
- Browser su copia dei dati, porta 3100, mai su dati o display veri; si
  controllano `volume`, `paused`, `currentTime` dei due elementi nel tempo (il
  suono non è verificabile).
- Ricostruire e committare `public/control/` (`npm run build:control`).
  `/display` è vanilla, nessuna build.

## Rischi noti

- Due elementi `<audio>` contemporanei sul Pi 4: carico da verificare a mano.
- Il giudizio d'ascolto (durate, curva) resta all'utente: le costanti sono in un
  solo punto proprio per ritoccarle.
