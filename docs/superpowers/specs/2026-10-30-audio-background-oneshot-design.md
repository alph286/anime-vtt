# Audio a righe: Background e One-shot (design)

Data: 2026-10-30. Branch: `claude/audio-development-proposals-664ebb` (sopra il lavoro
sulle dissolvenze, `2026-10-12-audio-fade-status-design.md`).

## Perché

Oggi ogni location ha UNA traccia principale (loop, parte da sola al cambio location) e
UNA traccia speciale (sting che abbassa la principale). Al tavolo non basta: il DM vuole
più ambienti sovrapposti (pioggia + camino + taverna) da accendere e spegnere al volo, e
una serie di effetti/brani da lanciare una volta (esplosione, risata delle megere, canzone
del boss). Serve una scheda Audio dedicata su `/control`, rapida da usare in sessione,
con un pulsante-icona per audio e il suo volume accanto.

## Cosa vuole il DM (deciso in chat)

- **Nuova scheda "Audio"** nella barra in basso di `/control`, accanto a Fog e Media.
- **Tutto per location**: ogni location ha la sua riga Background e la sua riga One-shot.
  Cambiando location l'audio cambia. Una galleria globale è un lavoro futuro: il modello
  non deve impedirla (vedi "Per dopo").
- **Riga Background** (ambienti in loop):
  - da `/editor` si caricano più audio; ognuno ha un'**icona** scelta dal DM per ricordare
    cos'è;
  - da `/editor`, per ciascuno, si sceglie cosa succede quando lo si spegne da `/control`:
    **riparte dall'inizio** alla prossima accensione, oppure è **sempre a loop** (si
    decide solo se si sente: riaccendendolo riprende dal punto in cui sarebbe arrivato);
  - da `/control` un click sull'icona lo accende/spegne; **più background suonano
    insieme**, mischiati;
  - a destra di ogni pulsante, **− e +** per il volume di quell'audio.
- **Riga One-shot** (suonano una volta): stessa logica (icona, −/+). Click = parte;
  finisce da solo e il pulsante si spegne; **ripremuto mentre suona, si ferma**.
  **Più one-shot possono sovrapporsi.**
- **Durante un one-shot i background si abbassano un po'** e poi risalgono.
- **Tornando su una location**, i suoi background tornano accesi/spenti come li si era
  lasciati.
- **Migrazione**: la vecchia traccia principale diventa un background, la speciale un
  one-shot. Il vecchio sistema principale/speciale sparisce.
- "Stessa struttura usata finora": stesso stile di `/control` e `/editor` (shadcn,
  Zustand, socket, build committate), nessuna libreria nuova.

## Non obiettivi

- Galleria audio globale/condivisa tra location (dopo).
- Audio su `/party` o sul telefono del DM: suona solo `/display`, come oggi.
- Anteprima/ascolto in cuffia lato DM, playlist, fade configurabili dall'interfaccia.
- Audio nell'export/import di location (già escluso oggi, resta escluso).
- Riordino per trascinamento delle righe (vedi "Scelte mie").

## Anti-obiettivi (sarebbe un fallimento anche se "funziona")

- Un click che fa partire qualcosa di diverso da quello che il pulsante mostra (stato
  del pulsante non allineato con ciò che si sente su `/display`).
- Tagli secchi: accendere/spegnere/cambiare location deve sfumare, mai scattare.
- Perdere gli audio già impostati con la migrazione.
- `/display` che chiede un click o mostra avvisi (Raspberry in kiosk senza input).

## Modello dati

`location.map.audio` diventa:

```js
audio: {
  background: [
    { id, name, file, icon, volume, restartOnStop, on }
  ],
  oneshot: [
    { id, name, file, icon, volume }
  ]
}
```

- `id`: nanoid. `file`: nome in `storage/audio/` (stesso storage di oggi). `name`: etichetta.
- `icon`: slug di un'icona dal set fisso (vedi sotto). `volume`: 0..1, default 0.7.
- `restartOnStop` (solo background): `true` = riparte dall'inizio; `false` = sempre a
  loop. Default `false` (mia scelta: per un ambiente è l'uso tipico).
- `on` (solo background): acceso/spento. **Persistito** sulla location, così tornando su
  una location i suoi ambienti sono come li si era lasciati.
- Stato dei one-shot in corso: `state.audioOneshots = { [trackId]: seq }`, nello stato
  globale (non nella location), azzerato all'avvio del server e a ogni cambio di
  location attiva. `state.audioOneshotSeq` è un contatore che rende unica ogni
  partenza (serve a ignorare un "finito" arrivato in ritardo e a far ripartire da capo
  una nuova pressione).
- Spariscono `state.activeAudioTrack`, `state.audioState`, `state.audioTriggerSeq` e
  `audio.main` / `audio.special`.

### Migrazione (`server/state.js`)

Per ogni location con il vecchio formato (`audio.main`/`audio.special`, o il formato
ancora più vecchio a traccia singola già gestito oggi):
- `main.file` presente → un background `{ name, file, volume, icon: 'music',
  restartOnStop: false, on: true }`. `on: true` perché oggi la principale parte da sola
  entrando nella location: il comportamento al tavolo resta lo stesso.
- `special.file` presente → un one-shot `{ name, file, volume, icon: 'zap' }`.
- Tracce senza file vengono scartate. Volumi mancanti → 0.7.
- Tolti dallo stato `activeAudioTrack`, `audioState`, `audioTriggerSeq`; aggiunti
  `audioOneshots: {}` e `audioOneshotSeq: 0` (questi due sempre azzerati al caricamento).
- Location nuove e `DEFAULT_STATE`: `audio: { background: [], oneshot: [] }`.
- `exportImport.js` (che azzera l'audio delle location importate) usa il formato nuovo.

## Server (`server/index.js`)

Come oggi l'audio agisce sulla location attiva per accendere/spegnere (non esiste
anteprima per l'audio), mentre le operazioni di gestione (`/editor`) prendono un
`locationId`.

- `POST /api/upload/audio` con `locationId`, `kind` (`background` | `oneshot`), `file`:
  aggiunge una traccia in coda alla riga. Icona di default `music` (background) /
  `zap` (one-shot), `on: false`. Accetta un file per richiesta (l'editor ne manda più di
  uno in sequenza se il DM ne seleziona tanti). Limite 50 MB come oggi.
- `audio:toggle { trackId }` (location attiva):
  - background → inverte `on`, salva.
  - one-shot → se in `audioOneshots` lo toglie (stop); altrimenti incrementa
    `audioOneshotSeq` e lo aggiunge con quel seq (parte).
- `audio:volume { locationId, trackId, volume }` → clamp 0..1, salva.
- `audio:update { locationId, trackId, name?, icon?, restartOnStop? }` → solo i campi
  validi (name ≤ 120 caratteri, icon slug `^[a-z0-9-]{1,40}$`, restartOnStop booleano,
  solo per background).
- `audio:delete { locationId, trackId }` → rimuove la traccia e il file su disco
  (`deleteUploadedFile`), la toglie da `audioOneshots` se c'è.
- `audio:oneshotEnded { trackId, seq }` (dal display) → toglie la voce solo se il seq
  coincide (un "finito" in ritardo non spegne una ripartenza più recente).
- `location:set` / `location:create`: azzerano `audioOneshots` (i one-shot della
  location vecchia sfumano); i background della nuova location suonano secondo il loro
  `on` persistito.
- File orfani: referenziati tutti i `file` di background e one-shot di ogni location.
- Tolti `audio:play/pause/stop/playSpecial/specialEnded/rename` e `returnToMain`.
- `audio:status` del display resta (sezione sotto), con payload nuovo.

## `/display`: il mixer (`public/shared/audio-fade.js`)

Il motore a due elementi (`createAudioEngine`) viene sostituito da un **mixer** a un
elemento `<audio>` per traccia, creato al volo (nascosto) e rilasciato quando non serve
più. Resta script classico + `module.exports`, testato con `node --test`, senza accesso
al DOM globale (riceve `createElement`, `now`, `requestFrame` dall'esterno).

`apply({ locationId, background: [...], oneshot: [...], oneshots: {id: seq} })`, chiamato
a ogni `state:update` con la location attiva:

- **Background acceso**: se non c'è un elemento lo crea (`loop = true`) e sfuma da 0 al
  volume in `bgIn`. Se c'era ma era spento: con `restartOnStop` riparte da 0; altrimenti
  si posiziona sulla "posizione virtuale" (`(now - ancora) mod durata`, con l'ancora
  fissata la prima volta che quella traccia ha suonato su questo display), così sembra
  che abbia suonato sempre.
- **Background spento**: sfuma a 0 in `bgOut`, poi pausa (e `currentTime = 0` se
  `restartOnStop`). L'elemento resta finché la traccia esiste nella location attiva.
- **One-shot in `oneshots`** con un seq nuovo: (ri)parte da 0 (`loop = false`), ingresso
  `stingIn`. Tolto da `oneshots`: sfuma a 0 in `transport` e si ferma. Evento `ended`
  nativo o errore → `onOneshotEnded(trackId, seq)`.
- **Ducking**: finché almeno un one-shot suona, tutti i background hanno un fattore
  `AUDIO_DUCK_LEVEL` (0.4) raggiunto in `duckOut`; quando l'ultimo finisce tornano a 1 in
  `resumeIn`. Volume effettivo = `volume traccia × livello fade × fattore duck`.
- **Volume** cambiato da `/control`: applicato subito (senza fade).
- **Cambio location**: tutte le tracce della location vecchia sfumano a 0 in `location`
  e vengono rilasciate; quelle accese della nuova entrano in `location`
  (crossfade).
- **Traccia eliminata o file cambiato**: l'elemento sfuma e viene rilasciato.
- Costanti in un solo punto (ms): `location 2000, bgIn 1000, bgOut 1000, transport 400,
  duckOut 600, stingIn 300, resumeIn 1500`; `AUDIO_DUCK_LEVEL 0.4`. Da tarare a orecchio.
- `play()` rifiutato: `NotAllowedError` → stato `blocked`, altro → `error` sulla traccia;
  il prossimo `apply` ritenta (come il fix già fatto).
- `requestFrame` con timer di riserva resta com'è in `display.js` (fade a pagina
  nascosta).

### Stato reale riportato a `/control`

`audio:status` (solo da socket con `hello role display`) con payload
`{ blocked: boolean, errors: [trackId...], playing: [trackId...] }`, validato da
`normalizeDisplayAudioStatus` (array di stringhe, max 100 voci). Il server lo tiene in
`displayAudio` in memoria, lo aggiunge a `state:update`, lo azzera quando l'ultimo
display si disconnette (tutto come oggi). Il display lo rimanda dopo `hello`.

## `/control`: scheda Audio

- Nuova voce nella `TabBar`: **Audio** (icona `Volume2`), dopo Media. `TabId` aggiunge
  `'audio'`. Su schermi ≥700px si comporta come Media (colonna a destra accanto alla
  mappa). Non è disabilitata in anteprima: mostra e comanda sempre la location
  **attiva**, e lo dice in testa ("Audio di: <location attiva>").
- `AudioBox` sotto la mappa viene rimosso.
- In testa, la riga "Display: in riproduzione / fermo / audio bloccato dal browser /
  non connesso" (stessa logica di oggi, adattata al nuovo payload).
- Due sezioni, **Background** e **One-shot**, ognuna una griglia a capo di elementi:
  `[pulsante icona+nome] [− / % / +]`. Il pulsante è un riquadro quadrato con l'icona
  grande e il nome troncato sotto (stesso linguaggio delle miniature di Media); acceso
  = stile ambra `--vtt-accent` (come "Mostra" live in Media). Lo stepper −/+ è verticale
  e stretto a destra del pulsante (passo 10%), riusa `Stepper` o una sua variante
  verticale.
- Un one-shot che suona ha lo stile acceso; tornato spento quando il display riporta la
  fine (via server).
- Un audio che il display segnala in `errors` ha il bordo `destructive` e il titolo
  "file non trovato o illeggibile".
- Riga vuota: "nessun audio di background/one-shot per questa location — si caricano
  da /editor".

## `/editor`: pannello Audio (sidebar, scheda già esistente)

- Due sezioni, **Background** e **One-shot**. Ciascuna: elenco delle tracce e un
  pulsante "Aggiungi audio" (`accept="audio/*"`, `multiple`).
- Ogni riga: pulsante icona (apre un `Popover` con la griglia delle icone del set),
  campo nome (`CommitInput`), elimina con arma-poi-conferma (`useArmConfirm`).
- Solo per Background, sotto il nome: un `Checkbox` "Riparti dall'inizio quando lo
  spegni" (spento = sempre a loop).
- Riflette la location attiva dell'editor (come oggi).

## Icone

Set fisso di icone `lucide-react` (già dipendenza), mappa slug → componente in un modulo
condiviso dentro `editor-app/src/lib/audio-icons.ts`, usato da editor e control. Circa
30 icone pensate per il tavolo: music, cloud-rain, cloud-lightning, wind, flame, waves,
droplets, snowflake, trees, mountain, bird, cat, dog, bug, moon, sun, castle, church,
tent, ship, beer, utensils, swords, shield, skull, ghost, crown, bell, drum, guitar,
zap, bomb, footprints, door-open, sparkles, laugh, heart, eye. Slug sconosciuto →
icona `music`. Il server valida solo la forma dello slug (non la lista): la lista vive
solo lato client.

## Scelte mie (da rivedere alla verifica)

- Icone da un set fisso di lucide, non caricate dal DM.
- `restartOnStop` default `false` (sempre a loop).
- Posizione virtuale dei background "sempre a loop" calcolata localmente dal display
  (nessun audio che suona muto in sottofondo: niente carico sul Pi); si azzera se si
  ricarica `/display`.
- Ducking a 0.4 del volume, durate dei fade come sopra.
- Passo del volume 10%, default 70%.
- Scheda Audio sempre abilitata, legata alla location attiva anche in anteprima.
- Niente riordino delle righe per ora (si aggiungono in coda).
- Più file caricabili in una volta in `/editor` (un upload per file).
- La migrazione accende (`on: true`) l'ex traccia principale.

## Casi limite (decisi da me dopo la revisione del builder)

- **Un solo display supportato** (come `displayViewport`): `displayAudio` resta un solo
  oggetto; con più display vince l'ultimo che ha scritto.
- **One-shot senza display**: con nessun display connesso il server ignora
  `audio:toggle` sui one-shot e `/control` mostra i pulsanti one-shot disabilitati
  ("display non connesso"). I background si accendono/spengono comunque (è uno stato
  persistito, suoneranno quando il display arriva).
- **One-shot e (ri)connessione del display**: a ogni `hello role display` e quando
  l'ultimo display si disconnette, il server azzera `audioOneshots` e ritrasmette.
  Un display che si collega (o si ricarica) non fa mai ripartire un one-shot vecchio.
- **Pulsante background**: acceso = `on`. Se `on` ma il display lo riporta in `errors`,
  bordo rosso. "Bloccato dal browser" compare solo nella riga in testa. `playing` serve
  solo alla riga in testa ("in riproduzione" se non vuoto, altrimenti "fermo").
- **Migrazione e `on`**: l'ex principale diventa `on: true` in ogni location (oggi parte
  da sola entrando), TRANNE nella location attiva se lo stato salvato era
  `activeAudioTrack: 'main'` con `audioState` diverso da `'playing'` (il DM l'aveva
  messa in pausa/fermata): lì `on: false`.
- **Toggle su una traccia non della location attiva** (es. arrivato durante un cambio
  location): ignorato in silenzio. Stesso per `trackId` sconosciuti.
- **`restartOnStop` cambiato**: vale dal prossimo spegnimento/accensione; non sposta
  niente subito. L'ancora della posizione virtuale vive con l'elemento `<audio>` della
  traccia: se la traccia viene eliminata (o la location cambia e l'elemento rilasciato),
  riparte da capo la volta dopo.
- **Volume**: cambia dal vivo anche per un one-shot in corso.
- **Upload multipli**: le richieste partono una dopo l'altra; se una fallisce le altre
  continuano e l'editor segnala quali file non sono stati caricati. Un file appartiene a
  una sola traccia.
- **Codice vecchio**: `AudioBox`, i suoi test, `createAudioEngine` e gli eventi
  `audio:play/pause/stop/playSpecial/specialEnded/rename` vengono rimossi del tutto.

## Per dopo

- Galleria globale: le tracce hanno già `id`/`file`/`icon` autonomi; una galleria
  potrà diventare una lista `state.audioLibrary` referenziata dalle location.
- Riordino delle tracce, anteprima in cuffia, fade regolabili.

## Verifica attesa

- `node --test` (mixer, normalizzazione dello stato, migrazione), Vitest (store, scheda
  Audio, pannello editor).
- Server di prova :3100 con dati temporanei (mai i dati vivi), mai una tab di test su
  `/display` se c'è una sessione reale: background multipli, on/off nei due modi,
  one-shot sovrapposti, stop di un one-shot, ducking, cambio location, migrazione di
  uno state.json col formato vecchio.
- Build di `/control` ed `/editor` ricostruite e committate.
- Non verificabile da me: l'ascolto vero (durate, ducking) e il Pi 4 con più `<audio>`.
