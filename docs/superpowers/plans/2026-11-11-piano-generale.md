# Piano generale: cosa fare, in che ordine, con quale modello

Scritto l'11 nov 2026. È una mappa, non un piano esecutivo: ogni fase che non ha
ancora un piano dettagliato lo riceve quando arriva il suo turno (colonna «Piano»).

## Criterio per scegliere il modello

| Modello | Quando |
|---|---|
| **Sonnet** | il piano dettagliato esiste già, oppure l'esito si vede subito (UI, correzione con riproduzione nota) |
| **Opus** | c'è da decidere cosa fare (piani dettagliati, progetto di una funzione), l'errore resterebbe nascosto (sicurezza, migrazioni), bug intermittenti, lavoro lungo che tiene insieme molto codice, revisione dei branch |
| **Alph** | tutto ciò che va visto, toccato o ascoltato dal vivo; Raspberry, push, merge |

Le assegnazioni sono stime dal tipo di lavoro, non misure.

**Revisione:** chi rivede è sempre una sessione nuova, mai quella che ha eseguito:
parte senza il contesto dell'esecuzione e legge solo il piano e il branch.

**Se una fase va storta due volte** (test che non diventano verdi, revisione che
trova di nuovo gli stessi problemi, esito diverso dall'atteso): il modello si ferma,
non tenta una terza volta né cambia approccio, e avvisa Alph con cosa ha provato,
cosa è successo e dove si è fermato. Decide Alph come proseguire.

## Stato al 16 nov 2026

- Fase 0, 2, 4 e 6: fatte, riviste da Opus, unite in `main`.
- Fuori piano, unite in `main`: crash con payload socket non oggetto
  (`protectSocketHandlers`), ping e aree lanciate più leggeri su /display
  (`docs/storia/2026-11-16-ping-veloci-display.md`), BUG noti 2-12 dei payload
  (`docs/storia/2026-11-16-bug-payload.md`).
- Fase 7: unita in `main` (`docs/storia/2026-11-16-shader-evocazione.md`),
  da giudicare dal vivo; fps sul Raspberry non misurati.
- Ping sul Raspberry misurati: 12,3 → 36,6 fps senza ping, 4,3 → 9,4 con
  tap e scia (tabella in `docs/storia/2026-11-16-ping-veloci-display.md`).
- Branch `ping-scia-buffer` (buffer del ping che cresce e non si restringe),
  rivisto da una sessione nuova, misurato sul Pi, NON unito
  (`docs/storia/2026-11-16-ping-scia-buffer.md`). L'ipotesi dei resize regge
  (ogni resize costa 140-250 ms di CPU sul Pi) e il tempo CPU del ping scende
  da 28,5 a 17,6 ms (scia) e da 58 a 15 ms (misto) per frame, ma gli fps quasi
  non cambiano: 12,0 → 12,6 con la scia, 9,3 → 10,9 col misto.
- **Prossimo passo, lo decide Alph**: unire il branch così com'è (guadagno
  piccolo, nessuna differenza visiva) e/o cercare dove va il resto del frame
  con la scia sul Pi, e perché un resize costi 150-250 ms.
- Poi: fase 1 (serata di prova, giudicare anche i cerchi d'evocazione e i loro
  fps), fase 5. Fase 3 sospesa (PIN spento). `main` non è ancora su GitHub.

## Fasi

| # | Fase | Chi esegue | Chi rivede | Piano | Dipende da |
|---|---|---|---|---|---|
| 0 | PIN del DM, `npm test` unico, controllo build, `CLAUDE.md` corto | Sonnet | Opus | `2026-11-11-manutenzione-pin-dm.md` (pronto) | niente |
| 1 | Serata di prova dal vivo | Alph | | elenco in fondo al nuovo `CLAUDE.md` | niente (il PIN resta spento) |
| 2 | Test di caratterizzazione dei 62 eventi socket | Opus | Opus | da scrivere (Opus) | 0 |
| 3 | Fog e dati del DM nascosti ai giocatori (sospesa: serve il PIN acceso) | Opus | Opus | da scrivere (Opus) | 0 e 2, PIN acceso |
| 4 | Spezzare `server/index.js` in moduli | Sonnet | Opus | da scrivere (Opus) | 2 |
| 5 | Bug emersi nella fase 1 | vedi sotto | | uno per bug | 1 |
| 6 | Minori già noti | Sonnet | | non serve | niente |
| 7 | Shader «cerchio d'evocazione» multi-pass | Opus | Alph a occhio | da scrivere (Opus) | niente, facoltativa |

Le fasi 1, 6 e 7 non bloccano le altre e si possono fare in parallelo.

### Fase 0: manutenzione (Sonnet, revisione Opus)

**Decisione di Alph (15 nov 2026)**: il PIN si predispone ma resta spento
(`DM_PIN` vuoto, anche sul Raspberry): si gioca solo tra amici.

Piano già completo. Dopo l'esecuzione, a Opus:

```text
Rivedi il branch manutenzione-pin-dm contro docs/superpowers/plans/2026-11-11-manutenzione-pin-dm.md. Cerca soprattutto: percorsi o eventi socket raggiungibili senza PIN che non sono nell'elenco del piano, modifiche a server/index.js oltre le quattro previste, differenze di comportamento quando DM_PIN non è impostato. Non correggere: elenca.
```

Fatto quando: `npm test` verde, revisione senza punti aperti, Alph unisce in `main`.

### Fase 1: serata di prova (Alph)

Con il Raspberry, la TV e almeno due telefoni. Segna per ogni voce dell'elenco
«Mai verificato dal vivo» del nuovo `CLAUDE.md`: funziona / non funziona / da
ritoccare. Per l'audio annota i valori che cambieresti (`AUDIO_FADE`,
`AUDIO_DUCK_LEVEL`). Il risultato è un file `docs/storia/2026-..-prova-dal-vivo.md`
che alimenta la fase 5.

### Fase 2: test di caratterizzazione dei socket (Opus)

Scopo: fissare il comportamento di oggi di ogni evento di `server/index.js`, così
le fasi 3 e 4 hanno una rete sotto.

Vincoli già decisi:
- un file `server/socket-events.test.js` che avvia il server vero (`node server/index.js`
  come processo figlio, porta libera, `DATA_DIR` e `STORAGE_DIR` temporanei) e gli parla
  con `socket.io-client`, da aggiungere come `devDependency` della radice;
- per ogni evento almeno: il caso valido (stato dopo l'evento) e un caso rifiutato
  (id sconosciuto o valore fuori limite: lo stato non cambia);
- copre anche: `state` dopo il ripristino di un backup, azzeramento degli one-shot al
  cambio location e all'arrivo di un display, il throttle dei trascinamenti (l'ultima
  posizione arriva sempre);
- nessuna modifica a `server/index.js` in questa fase. Se un test rivela un bug, si
  annota e si fissa il comportamento attuale con un commento `// BUG noto:`.

Fatto quando: ogni `socket.on(` di `index.js` ha almeno due test, `npm test` verde,
e la revisione ha controllato che i test falliscano davvero se si rompe un handler:
prova a campione su 5 handler, rompendoli uno alla volta in una copia di lavoro e
ripristinando subito con `git checkout server/index.js`.

### Fase 3: stato filtrato per i giocatori (piano ed esecuzione Opus)

**Sospesa** finché il PIN resta spento: senza PIN chiunque può aprire `/control`
e vedere tutto, quindi filtrare `/party` non nasconde niente. Si riprende solo se
Alph accende `DM_PIN`.

Problema: `state:update` manda a ogni client lo stato intero. Un giocatore su
`/party` legge dalla console le zone di fog non rivelate, i media non ancora
mostrati, le location non attive, l'archivio audio.

Da decidere nel piano (sono le domande aperte, non risposte). Opus scrive il piano
e lo fa leggere ad Alph PRIMA di eseguirlo: sono scelte su cosa vedono i giocatori.
- cosa serve davvero a `/party`, `/display` e `/handout` (elenco dei campi letti,
  ricavato dal codice, non a memoria);
- se le zone di fog non rivelate vanno tolte o mandate senza i vertici (il display
  deve comunque disegnare il nero);
- come trattare `/display`, che non ha il PIN ma deve mostrare tutto ciò che è in onda;
- che lo store condiviso `control-store` regga uno stato parziale senza rompere `/control`.

Fatto quando: un client senza cookie non riceve mai un dato non in onda (test nella
suite della fase 2), `/party` e `/display` funzionano come prima, una sessione
Opus nuova ha rivisto il branch cercando campi nascosti che arrivano ancora.

### Fase 4: spezzare `server/index.js` (piano Opus, esecuzione Sonnet)

Un gruppo di eventi per commit (location, fog, immagini e handout, vista, poligoni,
griglia e bussola, aoe, shader, audio), stesso schema di `registerTelegramRoutes`.
Regole: i moduli ricevono un contesto con `getState()` e mai `state` direttamente
(viene riassegnato dal ripristino backup); i test della fase 2 restano verdi a ogni
commit e non vengono modificati.

Fatto quando: `server/index.js` contiene solo avvio, cablaggio e stato condiviso;
`git diff` dei test della fase 2 vuoto.

### Fase 5: bug della serata di prova

| Tipo di bug | Chi |
|---|---|
| si riproduce a comando e si vede (resa, testo, pulsante) | Sonnet |
| valori da tarare (fade, ducking, taglie) | Sonnet, con i numeri annotati da Alph |
| capita ogni tanto, o solo sul Raspberry, o solo con più dispositivi | Opus: prima una riproduzione che fallisce a comando, poi la correzione. Senza riproduzione niente correzione: avvisa Alph |

### Fase 6: minori già noti (Sonnet)

- `use-control-socket.ts`: stesso rischio di stato iniziale perso già corretto in
  `use-party-socket.ts`; applicare la stessa correzione e lo stesso test.
- `vite.shared.ts`: manca il proxy di `/control/shared/*` e `/editor/shared/*` in dev
  (già risolto per `/party` in `vite.party.config.ts`).
- Caricare due volte lo stesso file audio crea due voci nell'archivio: riusare
  `audioContentKey` anche all'upload.

Ognuno è piccolo e ha già un modello da copiare nel codice: non serve un piano.

### Fase 7: shader multi-pass (facoltativa, Opus)

Le tre varianti «cerchio d'evocazione» di `alph286/shaders` (fluid sim su più
framebuffer). Serve una pipeline nuova accanto ad `AoeShaderLayer`. Si giudica solo
dal vivo: nessuno screenshot, controllo di compilazione e pixel con `gl.readPixels`.

## Cosa resta fuori

- Portare `/display` su React: funziona, è piccolo, gira sul Raspberry.
- Raggruppare i salvataggi su disco: i trascinamenti sono già limitati a uno ogni 60 ms.
