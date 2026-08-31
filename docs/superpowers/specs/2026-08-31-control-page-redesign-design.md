# Design: redesign della pagina di controllo per telefono e tablet

## Contesto

La pagina `/control` è usata dal DM durante la sessione dal vivo, tenuta in mano o appoggiata, per rivelare/nascondere il fog of war, muovere la vista live sulla TV, e mostrare immagini ai giocatori. Oggi è pensata solo per telefono in verticale: colonna singola, larghezza tappata a 480px, nessuna media query, nessun ricalcolo al cambio di orientamento. L'utente vuole poterla usare comodamente anche da tablet, in entrambi gli orientamenti.

Prima di disegnare, è stata condotta una revisione UX mirata (subagent simulato, poi verificata a mano dall'assistente su due punti specifici) sui tre file della pagina. Ha confermato due bug reali pre-esistenti oltre a una lunga lista di problemi di usabilità touch. Le decisioni sotto derivano direttamente da quella revisione, discussa e approvata a sezioni con l'utente.

## Bug pre-esistenti confermati (da correggere comunque, indipendentemente dal redesign)

- **`#fow-list` è visibile nonostante l'attributo `hidden`**: `.list { display: flex }` in `control.css` è una regola d'autore che vince sulla regola nativa `[hidden] { display: none }` (stessa specificità, l'autore vince sempre sullo user-agent). Stesso identico bug già trovato e corretto in `editor.css` in una sessione precedente (`[hidden] { display: none !important; }`), mai portato in `control.css`.
- **Nessun ricalcolo del layout al resize/rotazione**: `control.js` non ha alcun `window.addEventListener('resize', ...)`, a differenza di `display.js` ed `editor.js` che ce l'hanno entrambi. Ruotando un tablet, mappa e overlay fog restano alle misure precedenti finché non arriva un `state:update` qualsiasi.

## Obiettivo

Ridisegnare `/control` perché sia comodamente utilizzabile da telefono e tablet, in verticale e in orizzontale, risolvendo in un colpo solo i tre nodi di usabilità individuati dalla revisione:
1. La mappa non ha lo spazio che le serve.
2. Le zone fog non hanno una dimensione minima di tocco garantita.
3. Il ciclo di feedback verso il DM è aperto (non sa cosa vede la TV, né se i suoi tocchi arrivano).

## Decisioni chiave (dal brainstorming)

- **Un solo breakpoint di larghezza (700px), non quattro casi per dispositivo/orientamento.** Sotto: colonna singola. Sopra: due colonne. Un telefono in orizzontale supera quasi sempre i 700px di larghezza utile, quindi eredita automaticamente la disposizione pensata per il tablet, invece di restare compresso con tutto sotto lo scroll.
- **Niente espansione geometrica dei bersagli fog.** Scartata l'idea di allargare l'area di tap di ogni poligono oltre la sua forma reale (complessità reale per forme concave, rischio di sovrapposizione tra zone adiacenti). Al suo posto, l'elenco testuale delle zone diventa un elemento permanente e ben visibile della UI (non più un ripiego nascosto dietro un link), con bersagli ampi e regolari indipendenti dalla geometria sulla mappa.
- **Nessun cambio alla palette colori** (`shared/theme.css`) — vincolo esplicito, riconfermato.
- **Nessuna nuova dipendenza, nessun framework, nessun build step** — vincolo di progetto pre-esistente, riconfermato.
- **Mai `window.prompt()`/`window.alert()`** — le azioni rischiose (cambio location, rivela-tutto) usano varianti del pattern arma-poi-conferma già stabilito nell'app, adattate dove serve al fatto che qui l'elemento è un `<select>` nativo, non un pulsante.

## 1. Layout responsive

**Sotto 700px di larghezza viewport** (telefono verticale): colonna singola, in quest'ordine dall'alto:
1. Riga header: `<select>` location (compatto) + indicatore di connessione (vedi sezione 3).
2. Anteprima mappa — ora a larghezza piena (rimosso il tappo a 480px), rapporto d'aspetto dinamico che segue le dimensioni reali della mappa caricata invece di un 4:3 fisso, con il rettangolo di inquadratura live sovrapposto (sezione 3).
3. Barra "stai mostrando: [nome] ai giocatori" — visibile solo quando un'immagine è a schermo sulla TV.
4. Pan/zoom — visibile solo quando NON si sta mostrando un'immagine (comportamento già esistente, mantenuto).
5. Elenco zone fog, ora sezione permanente e prominente (non più collassata dietro un link) — vedi sezione 2.
6. Galleria immagini (con etichette visibili) + pulsante "torna alla mappa".
7. Slider opacità fog locale, in fondo — è il controllo meno usato e più facilmente frainteso, va nella posizione meno prominente.

**Da 700px in su** (telefono orizzontale, tablet verticale e orizzontale): due colonne.
- Colonna sinistra (~60-65% larghezza): mappa, grande quanto lo spazio verticale disponibile lo consente, con lo stesso rettangolo di inquadratura live e la stessa barra "stai mostrando" sovrapposti.
- Colonna destra (~35-40%, scorrevole indipendentemente se il contenuto eccede l'altezza): header, pan/zoom, elenco fog, galleria immagini + torna alla mappa, opacità — stesso ordine della colonna singola, semplicemente affiancato invece che impilato sotto. Nulla finisce mai sotto lo scroll della pagina intera.

Va aggiunto il listener di resize/orientamento mancante (bug pre-esistente sopra) perché il layout — e soprattutto l'allineamento degli overlay fog sulla mappa — si ricalcoli davvero a ogni cambio di dimensione/orientamento del viewport, non solo al prossimo aggiornamento di stato.

## 2. Elenco fog come elemento permanente, con azioni di massa

- L'elenco (`#fow-list` oggi) smette di essere collassabile dietro "mostra elenco testuale": diventa sempre visibile, con righe di dimensione touch-friendly (minimo 44-48px di altezza) che mostrano nome zona e stato rivelata/nascosta con un contrasto netto (vedi sezione 3 per il rinforzo visivo dello stato).
- In cima all'elenco, due azioni di massa con un trattamento asimmetrico deliberato:
  - **"Nascondi tutto"**: istantaneo, nessuna conferma. Nascondere non è mai dannoso (non rivela nulla ai giocatori), ed è esattamente l'azione di emergenza per rimediare in fretta a un tocco sbagliato — aggiungere attrito qui andrebbe contro il suo stesso scopo.
  - **"Rivela tutto"**: usa il pattern arma-poi-conferma standard dell'app (primo tocco arma per ~2.5s con stato visivo `.confirm`, secondo tocco entro la finestra conferma) — è un'azione a rischio spoiler su tutte le zone in un colpo solo, merita lo stesso attrito minimo già usato altrove per le azioni distruttive.
- Lato server, una singola nuova azione di massa invece di N chiamate individuali: evento socket `fow:setAll` con payload `{ locationId, revealed }` (booleano), che imposta `revealed` su tutti i poligoni della location in un'unica mutazione di stato + un solo salvataggio + una sola trasmissione — non un ciclo di N eventi `fow:toggle` esistenti.

## 3. Chiudere il ciclo di feedback

- **Rettangolo di inquadratura live**: un riquadro sovrapposto all'anteprima mappa mostra quale porzione della mappa sta effettivamente inquadrando la TV in questo momento, calcolato da `location.map.scale`, `state.liveView.{scale,offsetX,offsetY}` e le dimensioni reali del viewport della TV.

  Questo richiede che il server sappia quali sono le dimensioni del viewport della TV — oggi non le conosce affatto. Si aggiunge quindi un nuovo campo di stato **non persistito** (vive solo in memoria, non va in `data/state.json`, si ri-popola da sé alla riconnessione): `state.displayViewport = { width, height }` in pixel, riportato da `display.js` al server (nuovo evento socket, es. `display:viewport`) sia alla connessione sia a ogni resize (riusando lo stesso listener di resize che `display.js` ha già). Se `display.js` non si è ancora mai connesso, `displayViewport` è assente e il rettangolo semplicemente non si disegna (stesso principio di degradazione controllata già usato altrove nell'app per i dati mancanti).

  Il calcolo in `control.js` riusa le funzioni condivise già esistenti (`fitRect`/`layoutMapWrap` di `shared/media.js`), applicate alle dimensioni del viewport della TV invece che al contenitore locale di `control.js`, per determinare dove la mappa si posiziona sulla TV — poi si applica la stessa trasformazione (`translate`/`scale`) che `display.js` applica già, per derivare quale sotto-rettangolo è visibile, e lo si converte in un riquadro posizionato sopra l'anteprima locale.

- **Feedback di pressione**: stato `:active` esplicito su ogni pulsante, zona fog e miniatura, dentro la palette esistente (nessun colore nuovo — solo variazioni di sfondo/scala già derivabili dai token attuali). `touch-action: manipulation` su tutti gli elementi interattivi per eliminare il ritardo di tocco e lo zoom accidentale del browser sui tap ripetuti (es. sul pad di pan).
- **Distinzione rivelata/nascosta rinforzata**: le zone rivelate ottengono un riempimento leggero in colore accento oltre al contorno, non solo un tratteggio da 1.5px — più leggibile con un'occhiata rapida al buio.
- **Indicatore di connessione**: stesso pattern del puntino wifi già esistente in `display.js` (invisibile quando tutto va bene, rosso e visibile solo in caso di problema), portato anche in `control.js`. Per essere accurato in entrambe le direzioni, il server inizia a tracciare anche le connessioni "display" (nuovo `Set` `displaySockets`, speculare all'esistente `controlSockets`, con un nuovo evento broadcast `display:status`) — così l'indicatore in `control.js` riflette sia la propria connessione sia il fatto che la TV sia effettivamente collegata in questo momento.
- **Barra "stai mostrando ai giocatori"**: sostituisce il segnale implicito attuale (la sola sparizione della sezione pan/zoom) con un'indicazione esplicita e visibile del nome dell'immagine attualmente mostrata sulla TV.

## 4. Altre correzioni incluse (a basso costo, legate direttamente ai tre nodi)

- **Passo di pan proporzionale allo zoom**: invece del passo fisso attuale (`dx * 20`), il passo diventa `dx * (20 / Math.max(liveView.scale, 0.01))` — stesso principio già applicato al passo di spostamento griglia nell'editor in una sessione precedente (lì proporzionale alla cella, qui proporzionale inversamente allo zoom). A `scale=1` il comportamento è identico a oggi (passo 20); a `scale=4` il passo si riduce a 5, che dopo la trasformazione di scala sulla TV produce lo stesso spostamento visivo apparente di 20px — un tap sposta sempre una quantità visivamente coerente sullo schermo, indipendentemente dal livello di zoom corrente.
- **Pulsante di reset pan spostato fuori dal pad direzionale**: oggi è nella cella centrale della griglia 3x3, circondato dalle quattro frecce — un tocco leggermente impreciso mentre si insegue un'inquadratura la azzera per errore. Diventa un pulsante separato accanto al pad, non più al centro geometrico dei controlli più ripetuti.
- **Conferma leggera sul cambio location**: dato che è un `<select>` nativo, non si può applicare il pattern arma-poi-conferma a due click. Alla `change`, la selezione visibile torna momentaneamente al valore attivo corrente e appare una piccola riga inline "Passare a '<nome>'? [Conferma] [Annulla]" (nessun dialogo nativo bloccante); solo il tocco su "Conferma" emette `location:set` e aggiorna davvero il `<select>`. Selezionare un'altra opzione prima di confermare aggiorna il bersaglio in attesa; "Annulla" o la scadenza di un breve timeout (4s) annulla senza effetto.
- **Etichette visibili sulle miniature immagini**: il nome, oggi solo in `alt` (mai visibile), diventa testo visibile sotto/sopra ogni miniatura — con più spazio disponibile (sezione 1) non serve più comprimere tutto in 64px ciechi.
- **Bersagli minimi 44-48px** su tutti i controlli interattivi (pulsanti, `<select>`, celle del pad, righe dell'elenco fog, miniature).
- **Blocco di selezione testo e menu contestuale** (`user-select: none`, gestione di `-webkit-tap-highlight-color`) su tutti gli elementi interattivi della pagina, non solo sull'immagine mappa come oggi.
- **Lo slider zoom non "tira indietro" il dito durante il trascinamento**: `render()` oggi riscrive `zoomRange.value` a ogni `state:update`, anche mentre l'utente lo sta trascinando. Si aggiunge una guardia che salta l'aggiornamento programmatico del valore mentre l'elemento ha il focus/è sotto trascinamento attivo.

## Fuori scope (esplicitamente)

- Gestione delle safe-area per notch/isole dinamiche (`env(safe-area-inset-*)`).
- Riscrittura generale del rendering per eliminare ogni sfarfallio durante gli aggiornamenti di stato (diffing delle liste, preservazione del focus) — oltre al caso specifico dello slider zoom sopra, che è l'unico con un impatto reale rilevato.
- Espansione geometrica dell'area di tap dei singoli poligoni fog — scartata a favore della promozione dell'elenco (sezione 2).
- Qualunque cambio alla palette colori (`shared/theme.css`).
- Disambiguazione al tocco tra zone fog vicine/sovrapposte (pattern più complesso, non necessario una volta promosso l'elenco a bersaglio affidabile).
- Trascinamento diretto sull'anteprima mappa per il pan (resta su tap ripetuti sul pad, ora con passo proporzionale allo zoom).

## Verifica

Nessuna suite di test automatica nel progetto (scelta di progetto pre-esistente, coerente con tutto il resto dell'app) — verifica tramite browser dal vivo, emulando le quattro combinazioni (telefono verticale/orizzontale, tablet verticale/orizzontale) attorno al breakpoint di 700px, su un server isolato con dati di prova (mai sui dati reali della campagna). In particolare: conferma che nulla finisca sotto lo scroll in nessuna delle quattro combinazioni, che il rettangolo di inquadratura corrisponda davvero a quanto mostrato su `/display` aperto in parallelo, che l'indicatore di connessione reagisca alla disconnessione/riconnessione di entrambe le pagine, e che ruotare l'orientamento a runtime ricalcoli subito il layout e l'allineamento degli overlay fog senza attendere un `state:update`.
