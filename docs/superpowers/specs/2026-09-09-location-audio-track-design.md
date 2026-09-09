# Traccia Audio per Location — Design

**Goal:** poter caricare da `/editor` una traccia audio (mp3 o simile) legata a una location, e controllarne la riproduzione (play/pausa/stop, volume) da `/control`, con l'audio che esce fisicamente dalla TV (via HDMI del Raspberry Pi che serve `/display`).

**Architecture:** un unico elemento `<audio>` su `/display`, guidato interamente dallo stato trasmesso dal server — stesso schema già in uso per griglia, fog, rosa dei venti. `/control` non riproduce nulla in locale: invia comandi, il server aggiorna lo stato e lo trasmette a tutti i client, `/display` reagisce. Il Chromium in kiosk mode sul Pi è già lanciato con `--autoplay-policy=no-user-gesture-required` (deploy/kiosk-display.sh), quindi l'avvio della riproduzione funziona senza richiedere un'interazione diretta sulla pagina.

Alternativa scartata: comandi "fire and forget" gestiti solo localmente da `/display`, senza stato persistito sul server. Non permetterebbe al pulsante Play/Pausa di `/control` di riflettere correttamente se l'audio sta suonando in caso di riconnessione o di una seconda scheda `/control` aperta — con lo stato sul server invece funziona come tutto il resto dell'app.

## Modello dati

Ogni location guadagna `location.audio = { name: '', file: null, volume: 0.7 }` (backfill per le location esistenti, come già fatto per griglia/rosa dei venti). `volume` è una frazione 0-1 (come `grid.opacity`), regolata a passi di 0.1 dai pulsanti +/- di `/control`, mostrata come percentuale arrotondata. Nessun campo per il loop (sempre attivo, impostato una volta sull'elemento `<audio>`) né per la posizione di riproduzione (mai sincronizzata tra client: l'audio riparte sempre da capo quando parte, salvo il caso pausa→play che riprende localmente sull'elemento `<audio>` di `/display`, mai a livello di stato condiviso).

Un nuovo campo top-level `state.audioState`, con tre valori possibili: `"stopped"` (default), `"playing"`, `"paused"`. Sostituisce l'idea iniziale di un semplice booleano `audioPlaying`, perché pausa e stop devono comportarsi diversamente su `/display` (pausa mantiene la posizione di riproduzione corrente sull'elemento audio, stop la azzera) — la sola distinzione booleana "sta suonando/non sta suonando" non basterebbe a `/display` per sapere quale delle due azioni eseguire. Resettato a `"stopped"` da `applyStartupDefault()` (nessuna ripartenza automatica dopo un riavvio del server) e dall'evento `location:set` (cambiare location ferma sempre l'audio).

I file audio vivono in una nuova cartella `storage/audio/`, con lo stesso meccanismo di upload/orfani già usato per mappe e immagini (nome file generato con `nanoid()`, cancellazione sicura, inclusione nella scansione "pulisci file orfani").

## `/editor`

Nuova sezione in sidebar, "Audio" (stesso trattamento a pannello delle altre sezioni: Location, Immagini, Fog of war). Contiene:
- Se non c'è nessuna traccia: un pulsante "Carica traccia audio" (stesso stile del pulsante "Carica immagine" già esistente).
- Se c'è una traccia: il nome del file (etichetta modificabile, come il nome delle immagini) e un pulsante di eliminazione con lo stesso pattern arma-poi-conferma già usato ovunque nell'app.

Caricare una nuova traccia quando ce n'è già una sostituisce quella precedente (stessa logica del caricamento mappa: un file alla volta). Sostituire o eliminare la traccia mentre quella vecchia sta suonando ferma sempre la riproduzione (torna a `"stopped"`) — una nuova traccia caricata in seguito richiede un Play esplicito, non riprende automaticamente. Il volume non ha un controllo qui — resta un'impostazione live di `/control`, con un default sensato (70%) alla prima assegnazione della traccia.

## `/control`

Nuova sezione "Audio" nella scheda Mappa (vicino a Opacità griglia/Rosa dei venti), visibile solo se la location attiva ha una traccia caricata:
- Un pulsante Play/Pausa combinato (▶ quando fermo/in pausa, ⏸ quando in riproduzione) — invia rispettivamente `audio:play` o `audio:pause`.
- Un pulsante Stop separato (⏹) — invia `audio:stop`, riporta sempre l'audio all'inizio la prossima volta che parte.
- Uno stepper volume (−/+, passi del 10%), stesso stile di Opacità griglia.

A differenza di griglia/fog/rosa dei venti, questi comandi agiscono **sempre sulla location attiva**, mai su `previewLocationId`: non ha senso "prevedere" una riproduzione audio in anteprima, dato che suonerebbe comunque subito ai giocatori — non esiste un equivalente locale/silenzioso da mostrare prima sul telefono, come invece succede per posizione/griglia/mappa (che `/control` può disegnare in anteprima sullo schermo del telefono senza che nessuno la senta). Il volume resta invece modificabile in ogni momento (persistito sulla location, si sente subito se sta suonando).

## `/display`

Un elemento `<audio loop hidden>` nella pagina, mai visibile — solo suono. Ad ogni aggiornamento di stato:
- se il file della traccia è cambiato (nuova location, o traccia sostituita da `/editor`), aggiorna la sorgente.
- il volume dell'elemento segue sempre `location.audio.volume`.
- `state.audioState` determina l'azione: `playing` → riproduci (riprende da dove si era fermata se era solo in pausa); `paused` → metti in pausa senza azzerare la posizione; `stopped` → metti in pausa e azzera la posizione a zero.

## Gestione errori

- Upload: accetta qualunque file audio (`audio/*`, copre mp3/ogg/wav/m4a senza restringere artificialmente a mp3), limite dimensione 50MB (abbondante per un brano in loop).
- I comandi `audio:play`/`audio:pause`/`audio:stop`/`audio:volume` seguono lo schema difensivo già in uso: nessuna location attiva o nessuna traccia assegnata → nessun effetto, nessun errore.
- File audio mancante/corrotto su `/display`: fallisce silenziosamente (nessun crash della pagina), stesso principio già in uso per mappe/immagini con riferimenti non validi.

## Testing

Nessuna suite automatica (per scelta di progetto). Verifica manuale su server isolato:
- Caricare una traccia da `/editor`, verificare che la sezione Audio compaia su `/control` solo per quella location.
- Play da `/control` → si sente su `/display`; Pausa → si interrompe; Play di nuovo → riprende da dove si era fermata (non da capo).
- Stop → si interrompe; Play successivo → riparte dall'inizio.
- Cambiare volume con +/- → cambia subito il volume in riproduzione.
- Cambiare location (da editor o da controller) mentre suona → l'audio si ferma automaticamente.
- Mostrare un'immagine ai giocatori mentre suona → l'audio continua.
- Riavviare il server mentre suona → alla ripartenza l'audio è fermo, nessuna riproduzione automatica.
- Location senza traccia assegnata → la sezione Audio non compare su `/control`.
- Sostituire la traccia da `/editor` mentre quella vecchia sta suonando → la riproduzione si ferma, la nuova traccia richiede un Play esplicito.
