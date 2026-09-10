# Traccia Principale + Traccia Speciale per Location — Design

**Goal:** estendere la feature "traccia audio per location" (già implementata, non ancora integrata) in modo che ogni location possa avere due tracce indipendenti: una **principale** che parte da sola quando la location diventa attiva, e una **speciale** (es. musica da boss fight) che il GM può far partire in qualsiasi momento con un tasto dedicato da `/control`, sostituendo temporaneamente la principale.

**Architecture:** lo stato resta interamente centralizzato sul server, trasmesso a tutti i client — stesso principio già in uso per l'intera app. `location.map.audio` (oggi un solo oggetto) diventa `{ main, special }`, due tracce della stessa forma di prima. Un nuovo campo top-level `state.activeAudioTrack` (`'main'` | `'special'` | `null`) dice a quale delle due si riferisce l'esistente `state.audioState` (`'stopped'|'playing'|'paused'`, invariato). `/display` non decide mai da solo cosa suonare o quando tornare alla principale: riporta solo fatti al server (es. "la speciale è appena finita da sola") tramite un nuovo evento, e reagisce esclusivamente allo stato che il server trasmette — stesso principio già stabilito per il resto della feature.

Il nome scelto per la prima traccia è `main`, non `ambient`: quel nome resta libero per una futura feature di effetti ambientali sovrapposti (mixati, non sostitutivi) — una categoria concettualmente diversa da "quale traccia principale sta suonando ora", che questa spec non tratta.

Alternative scartate:
- *Due stati di riproduzione indipendenti (uno per traccia, entrambi potenzialmente `"playing"`)* — scartata perché la traccia speciale deve sempre **sostituire** la principale, mai sovrapporsi: due stati indipendenti richiederebbero comunque di imporre a mano la mutua esclusione, complessità in più senza reale beneficio.
- *"Fire and forget" lato `/display`, senza stato condiviso su quale traccia sia attiva* — è la stessa alternativa già scartata nella spec originale della feature: un secondo `/control` aperto, o una riconnessione, non saprebbe mai che la speciale sta suonando in quel momento.

## Modello dati

Ogni location: `location.map.audio = { main: { name, file, volume }, special: { name, file, volume } }`, ciascuna con default `{ name: '', file: null, volume: 0.7 }`. Un backfill in `migrate()` sposta l'attuale `location.map.audio` (quello della feature appena implementata, forma `{name,file,volume}`) dentro `.main`, così nessuna traccia già caricata durante lo sviluppo va persa.

Nuovo campo top-level `state.activeAudioTrack`: `'main'` (default quando la location attiva ha una traccia principale), `'special'` (quando il GM l'ha avviata da `/control`), `null` (nessuna traccia disponibile per la location attiva). `state.audioState` mantiene i suoi tre valori invariati, ma ora si riferisce sempre alla traccia indicata da `activeAudioTrack`.

Cambiare location attiva (`location:set`, `location:create`) non ferma più sempre l'audio: se la nuova location ha una traccia `main`, imposta `activeAudioTrack:'main'`, `audioState:'playing'` (parte da sola); altrimenti `activeAudioTrack:null`, `audioState:'stopped'`. Il riavvio del server (`applyStartupDefault`) resta silenzioso come nella feature originale — l'autoplay scatta solo su un cambio location a sessione già avviata, mai all'accensione del Raspberry Pi.

La traccia `main` è sempre in loop (come l'unica traccia della feature originale); la traccia `special` non lo è mai — è pensata per uno sting/tema che suona una volta e poi cede il posto alla principale. Nuovo evento socket `audio:playSpecial` (nessun payload, agisce sempre sulla location attiva come gli altri comandi audio): imposta `activeAudioTrack:'special'`, `audioState:'playing'` — riparte sempre da capo anche se la speciale era già in corso. Quando la speciale finisce da sola, `/display` lo segnala con un nuovo evento `audio:specialEnded`; il server (solo se `activeAudioTrack` è ancora `'special'` in quel momento, per ignorare un evento arrivato in ritardo dopo che il GM ha già agito diversamente) torna a `activeAudioTrack:'main'` e fa ripartire la principale se presente, altrimenti resta ferma. Lo stesso ritorno alla principale succede se lo Stop viene premuto mentre la speciale sta suonando.

## `/editor`

Il pannello "Audio" attuale si sdoppia in due pannelli identici nello stile (stesso trattamento delle altre sezioni sidebar): **"Traccia principale"** (lavora su `location.map.audio.main`) e **"Traccia speciale"** (lavora su `location.map.audio.special`), indipendenti tra loro — puoi avere solo l'una, solo l'altra, entrambe o nessuna. Ciascuno riusa lo stesso pattern arma-poi-conferma già in uso per l'eliminazione.

Sostituire o eliminare la traccia **principale** mentre sta suonando ferma tutto (`audioState:'stopped'`, `activeAudioTrack` resta `'main'` ma senza file non c'è nulla da suonare) — non c'è nulla a cui tornare. Sostituire o eliminare la traccia **speciale** mentre sta suonando si comporta come se fosse appena finita da sola: si torna alla principale (che riparte se presente, altrimenti silenzio) — la stessa regola già decisa per la fine naturale e per lo Stop, applicata qui per coerenza. In entrambi i casi questo succede solo se la location modificata è quella attiva, come nella feature originale.

## `/control`

Il gruppo Play/Pausa + Stop + volume resta uno solo, ma ora agisce su **qualunque traccia sia attiva in quel momento** (`state.activeAudioTrack`), non più sempre sulla principale — se la speciale sta suonando, Pausa/Stop/volume agiscono su di lei. Un'etichetta accanto ai controlli mostra quale traccia è in corso ("Principale" / "Speciale"), per evitare ambiguità su cosa si sta effettivamente mettendo in pausa o il cui volume si sta cambiando.

Un nuovo pulsante separato, **"Traccia speciale"** (icona distinta da Play/Pausa/Stop), visibile solo se la location attiva ha una traccia speciale caricata — non è un toggle: un click invia sempre `audio:playSpecial` e la fa ripartire da capo, anche se era già in corso (utile per far ripartire lo sting se il boss "ricompare"). Come tutti i comandi audio, agisce sempre sulla location attiva, mai in anteprima.

La sezione Audio resta visibile se la location attiva ha almeno una delle due tracce caricate; il pulsante "Traccia speciale" appare solo se quella specifica traccia esiste. Il gruppo Play/Pausa/Stop/volume invece compare solo quando `activeAudioTrack` non è `null` — cioè quando c'è davvero qualcosa da mettere in pausa o fermare (la principale, partita da sola, oppure la speciale dopo averla avviata). Una location con solo la traccia speciale caricata (nessuna principale) mostra quindi, finché non premi "Traccia speciale", solo quel pulsante — il gruppo Play/Pausa/Stop/volume compare non appena la speciale parte.

## `/display`

L'elemento `<audio>` non cambia struttura, ma sorgente, volume e `loop` seguono ora la traccia indicata da `activeAudioTrack`: `loop` è impostato via JS a ogni render (`true` se `activeAudioTrack === 'main'`, `false` se `'special'`) invece di essere un attributo statico nell'HTML; il file e il volume seguono `location.map.audio[activeAudioTrack]`.

Quando l'elemento genera l'evento nativo `ended` (può scattare solo per la speciale, dato che la principale è sempre in loop), `/display` lo comunica al server con `audio:specialEnded` — non decide mai da solo di tornare alla principale, si limita a riportare il fatto.

## Gestione errori

- Upload: stesso schema della feature originale (`audio/*`, 50MB) per entrambi gli slot, indipendenti l'uno dall'altro.
- `audio:playSpecial`: nessuna location attiva o nessuna traccia speciale assegnata → nessun effetto, nessun errore.
- `audio:specialEnded`: ignorato dal server se nel frattempo `activeAudioTrack` non è più `'special'` (es. il GM ha già premuto Stop o cambiato location prima che l'evento arrivasse) — evita che un evento in ritardo annulli uno stato più recente.
- File mancante/corrotto su `/display`: fallisce silenziosamente, stesso principio già in uso.

## Testing

Nessuna suite automatica (per scelta di progetto). Verifica manuale su server isolato, scenari aggiuntivi rispetto a quelli già coperti dalla feature originale:
- Cambiare location con una traccia principale caricata → parte da sola; una location senza → resta silenziosa.
- Riavviare il server su una location con traccia principale → resta silenzioso (nessun autoplay all'avvio, solo sui cambi location a sessione già avviata).
- Premere "Traccia speciale" da `/control` mentre la principale suona → la principale si ferma, parte la speciale; l'etichetta su `/control` mostra "Speciale".
- Lasciare che la speciale finisca da sola → la principale riparte in automatico, l'etichetta torna a "Principale".
- Premere Stop mentre la speciale suona → si torna alla principale (che riparte se presente).
- Premere "Traccia speciale" di nuovo mentre sta già suonando → riparte da capo.
- Cambiare volume mentre la speciale suona, poi tornare alla principale → il volume della principale resta quello impostato in precedenza (i due volumi sono indipendenti).
- Sostituire/eliminare la speciale mentre sta suonando → si torna alla principale, come una fine naturale.
- Sostituire/eliminare la principale mentre sta suonando → tutto si ferma.
- Location senza nessuna traccia caricata (né principale né speciale) → nessuna sezione Audio su `/control`.
- Location con solo la speciale caricata (nessuna principale) → sezione Audio compare con solo il pulsante "Traccia speciale"; premerlo la fa partire, e alla fine (o con Stop) si torna al silenzio invece che a una principale inesistente.
