# Export/Import Location e Backup Completo — Design

**Goal:** dall'`/editor`, poter esportare una singola location (mappa, immagini con didascalie, fog of war, inquadratura live) o un backup completo di tutta la campagna (tutte le location, ordine nel menu, predefinita, preset griglia globale, nome campagna) come un unico file scaricabile — e poterli reimportare, sia su questa installazione sia su un'altra.

**Architecture:** i file (mappe, immagini) e i metadati (location, griglia, fog, didascalie) vengono impacchettati in un **tar** letto/scritto in streaming (libreria `tar-stream`), mai tutto in memoria insieme — necessario perché alcune mappe pesano già oggi anche 40MB, e un backup con più location può arrivare a centinaia di MB. Un `manifest.json` (primo elemento dell'archivio) porta tutti i metadati; i file veri e propri seguono, referenziati dal manifest per nome. Un solo formato per entrambi i casi, distinto da un campo `"kind"` nel manifest (`"location"` o `"backup"`) — l'importazione riconosce da sola di che tipo di file si tratta, invece di richiedere due pulsanti diversi da ricordare.

## Formato del file

Estensioni: **`.vttlocation`** (export di una location) e **`.vttbackup`** (backup completo) — entrambi tar validi, l'estensione è solo una convenzione per l'utente, non viene mai usata dal server per decidere il comportamento (che si basa sempre e solo sul `"kind"` letto dal manifest reale).

Struttura dell'archivio:
1. `manifest.json` — i metadati (vedi sotto).
2. Un file per ogni mappa e ogni immagine referenziata, con un nome interno stabile (es. `files/<nome-stabile>`) che il manifest usa per collegare ogni voce ai propri dati binari.

Il manifest per `"kind": "location"`:
```json
{
  "kind": "location",
  "exportedAt": "2026-09-07T18:00:00.000Z",
  "location": {
    "name": "Taverna",
    "map": {
      "file": "files/<nome-stabile-mappa>",
      "type": "image",
      "scale": 1,
      "flip180": false,
      "rotate90": false,
      "liveView": { "scale": 1.4, "offsetX": 12, "offsetY": -8 },
      "grid": { "enabled": true, "cellSize": 100, "offsetX": 0, "offsetY": 0, "color": "#ffffff", "lineWidth": 0.3, "opacity": 1 },
      "polygons": [{ "id": "stanza-1", "name": "Stanza 1", "points": [[5,10],[40,8],[42,45],[8,48]], "revealed": false }]
    },
    "images": [{ "name": "Locandiere", "file": "files/<nome-stabile-immagine>", "caption": "Bramo, il locandiere", "telegramDestination": "Anime Salve — Generale" }]
  }
}
```

Il manifest per `"kind": "backup"` ha la stessa forma ma con `"locations": [...]` (array, stesso schema di ciascuna location sopra, con l'aggiunta di `"archived"` e `"isDefault"` per ciascuna, nell'ordine esatto del menu), più `"campaign": { "name": "..." }` e `"gridPreset": { ... }` a livello di backup.

Né `id` (delle location, delle immagini, dei poligoni) né i nomi dei file di storage vengono presi alla lettera in importazione: `id` dei poligoni sono opachi e possono essere riusati come sono (servono solo a distinguere le voci all'interno della stessa location), ma **location, immagini e nomi dei file ottengono sempre identificatori nuovi in importazione** — mai riferimenti dell'installazione di origine, per evitare qualunque collisione.

## Cosa contiene ogni export

**Location singola**: mappa (file + scala/flip/rotazione/griglia), poligoni fog of war, immagini con didascalie e destinazione Telegram assegnata (inclusa così com'è — se l'installazione di destino ha destinazioni diverse o assenti, all'invio comparirà il normale errore "destinazione non più configurata", già previsto, nessun danno), inquadratura live (zoom/posizione) di quella location.

**Backup completo**: tutte le location comprese quelle archiviate, ciascuna con tutti i dati sopra, più l'ordine esatto nel menu, chi è la predefinita, il preset griglia globale e il nome della campagna. Pensato per un ripristino fedele, non per spostare singole location.

## Comportamento dell'importazione

Un solo file-picker in `/editor`. Il file caricato viene prima **ispezionato** (il server legge il manifest, non applica ancora nulla) e il risultato determina cosa mostrare:

- **`kind: "location"`** → banner di conferma leggero ("Importare la location «Taverna», esportata il 7/9/2026?"), Conferma/Annulla. Non distruttivo (aggiunge soltanto una nuova location, mai sovrascrive), ma richiede comunque un click esplicito per evitare import accidentali.
- **`kind: "backup"`** → banner in stile pericolo, esplicito su cosa sta per succedere ("Questo SOSTITUIRÀ tutte le N location attuali con quelle del backup, esportato il 7/9/2026. Una copia di sicurezza dei dati attuali verrà salvata automaticamente prima."), Conferma/Annulla come due pulsanti distinti — nessun pattern arma-poi-conferma a tempo, viste le conseguenze.

Solo alla conferma esplicita il server applica la modifica; annullando, il file caricato viene scartato senza alcun effetto. Import di una location: sempre una **nuova** location (mai sovrascrive per nome/id), non archiviata, non predefinita, pronta all'uso. Import di un backup: sostituisce integralmente location, ordine, predefinita, preset griglia e nome campagna — cosa sia "attivo" (la location e l'eventuale immagine mostrate ai giocatori) non viene presa dal backup, ma ricalcolata subito dopo con la stessa logica già usata all'avvio del server (`applyStartupDefault`: la location predefinita del backup, nessuna immagine in mostra) — un ripristino non deve mai far comparire di scatto ai giocatori un'immagine che era in mostra al momento dell'esportazione.

## Sicurezza del ripristino

Il ripristino di un backup completo procede in un ordine pensato per restare sempre recuperabile in caso di errore a metà strada:

1. Si salva **prima** una copia di sicurezza dello stato attuale (sul disco del server, silenziosa — se questo fallisce, il ripristino si ferma subito senza toccare nulla).
2. Si estraggono tutti i nuovi file (mappe/immagini) con nomi nuovi, **senza cancellare ancora nulla** del vecchio.
3. Si scrive il nuovo `state.json` con lo stesso meccanismo atomico (scrivi-su-file-temporaneo-poi-rinomina) già usato oggi per ogni salvataggio di stato.
4. Solo a scrittura confermata, si cancellano i vecchi file di storage ormai sostituiti.

Se qualcosa fallisce prima del passo 4, i dati precedenti restano intatti e utilizzabili — l'unico effetto collaterale possibile è qualche file nuovo rimasto orfano, già ripulibile con la funzione "pulisci file orfani" esistente. `/control` e `/display` eventualmente connessi ricevono il nuovo stato come qualunque altra modifica, via la trasmissione già esistente — nessuna gestione speciale.

## Interfaccia in `/editor`

Un pulsante "⋮" nella barra in alto, accanto al selettore location, apre un piccolo menu a tendina (si chiude cliccando altrove) con tre voci:
- **Esporta «nome location corrente»** — scarica subito il `.vttlocation` (disabilitata se non c'è nessuna location attiva).
- **Esporta backup completo** — scarica subito il `.vttbackup`.
- **Importa...** — apre il file-picker e avvia il flusso di ispezione/conferma sopra descritto.

## Gestione errori

- File non valido (non è un tar, primo elemento non è un `manifest.json` leggibile, `"kind"` sconosciuto): errore chiaro in fase di ispezione, nessun effetto, file temporaneo ripulito.
- Archivio incompleto (manifest referenzia un file assente): rifiutato prima di toccare qualunque cosa — si valida che tutti i file dichiarati siano presenti prima di scrivere su disco.
- Import di una location, scrittura fallita a metà (disco pieno, permessi): i file già estratti per quella location vengono ripuliti, nessuna location parziale entra nello stato.
- Ripristino backup: vedi "Sicurezza del ripristino" sopra — mai un rischio di perdita dati, nel peggiore dei casi qualche file orfano recuperabile con la pulizia già esistente.

## Testing

Nessuna suite automatica (per scelta di progetto). Verifica manuale su server isolato:
- Esportare una location, ispezionare il `.vttlocation` con `tar -tf` per confermare manifest + file presenti.
- Importarla e verificare: nuova location con mappa/immagini/didascalie/fog/zoom corretti, non archiviata, non predefinita, id e nomi file nuovi (nessuna collisione con quelli esistenti).
- Esportare un backup con più location (inclusa una archiviata), verificare che il manifest contenga tutto con l'ordine giusto.
- Ripristinarlo su un'installazione con dati diversi: copia di sicurezza pre-ripristino presente sul server, dati vecchi completamente sostituiti, tutto (ordine, predefinita, archiviate, preset griglia, nome campagna) corrispondente al backup.
- Provare con un file mappa grande (50-100MB) osservando l'uso di memoria del processo durante export/import, per confermare che lo streaming funziona davvero (nessun picco vicino alla dimensione del file).
- File corrotto/non valido → errore chiaro, nessun cambiamento, nessun file temporaneo residuo.
- Annullare un'importazione al banner di conferma (entrambi i tipi) → nessun effetto, file temporaneo ripulito.
- Simulare un fallimento a metà ripristino (es. cartella storage temporaneamente in sola lettura) → dati vecchi intatti, nessun crash.
