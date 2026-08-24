# Design: tema visivo "Sala controllo" per editor / controllo / display

## Contesto

Dopo il crash causato da un video mappa sovradimensionato (vedi sessione del
2026-08-05 — risolto con validazione pre-upload e via di fuga `/api/map/clear`),
l'utente si è chiesto se riscrivere il progetto da zero o passare a un
framework diverso (React). Discutendone, il problema reale isolato non è
l'architettura ma l'estetica: editor, controllo e display non hanno mai avuto
un design system coerente — sono rimasti allo stile di default del browser
(bordi grigi, sfondo bianco piatto, nessuna gerarchia visiva).

**Decisione presa**: nessuna riscrittura, nessun framework. L'estetica è un
problema di CSS, non di gestione dello stato — un'app React con lo stesso CSS
di default sarebbe identicamente brutta. Passare a React comporterebbe
introdurre un build step (oggi assente), riscrivere da zero editor.js/
control.js/display.js (che oggi gestiscono bene lo stato via socket.io +
rendering diretto), per settimane di lavoro senza alcun guadagno estetico
diretto. Si resta quindi su vanilla JS, zero dipendenze, zero build step —
coerente con il vincolo di partenza del progetto (tutto locale, offline,
nessuna dipendenza esterna).

La direzione visiva "Sala controllo" (scuro, accento ambra, ispirata a
mixer/regia audio) è stata scelta dall'utente confrontando tre mockup
(companion di brainstorming) contro le alternative "Pergamena fantasy" e
"Minimal moderno chiaro".

## Obiettivo

Applicare un design system CSS coerente e scuro a tutte e tre le superfici
dell'app (editor da PC, controllo da smartphone, display TV), senza toccare
nessuna riga di JavaScript, nessuna dipendenza nuova, nessun build step.

## Non-obiettivi (esplicitamente fuori scope)

- Nessun cambio di layout/struttura: la disposizione attuale di toolbar,
  pannello laterale editor, pad pan/zoom, thumbnail — è stata mostrata nei
  mockup e confermata invariata dall'utente ("bene così").
- Nessun toggle chiaro/scuro: è un tema fisso, unico, non derivato da
  `prefers-color-scheme` — l'app è uno strumento personale a singolo
  operatore, non serve adattività.
- Nessun font esterno: si resta su `system-ui` / font di sistema, zero
  richieste di rete, coerente col vincolo "zero CDN".
- Nessuna modifica a `server/index.js`, `server/state.js`, o a qualunque file
  `.js` client — è un restyle puramente CSS.

## Architettura

Nuovo file condiviso `public/shared/theme.css`, contenente le variabili CSS
(custom properties) della palette, linkato da tutte e tre le pagine HTML
(`editor/index.html`, `control/index.html`, `display/index.html`) **prima**
del rispettivo foglio di stile locale, così che `editor.css`/`control.css`/
`display.css` possano consumare i token invece di colori fissi.

Ogni CSS di pagina viene aggiornato per sostituire i valori colore hardcoded
con `var(--token-name)` corrispondenti. Nessuna classe, `id`, o struttura
HTML viene rinominata o spostata — tutti i selettori esistenti restano
validi, quindi tutto il JS che tocca classi (`.active`, `.confirm`,
`.revealed`, `.hidden`, ecc.) continua a funzionare senza modifiche.

## Design token (palette "Sala controllo")

```css
:root {
  --bg-page: #16181d;       /* sfondo pagina/shell */
  --bg-panel: #1f232b;      /* toolbar, pannelli, card */
  --bg-control: #262b34;    /* pulsanti, input, thumbnail */
  --bg-canvas: #0e1014;     /* area mappa/canvas, più scura */
  --border: #2c313b;        /* bordo pannelli */
  --border-control: #333947;/* bordo pulsanti/input */
  --grid-line: #20242c;     /* linee griglia di sfondo nei mockup */
  --text-primary: #cfd6e0;
  --text-secondary: #8a93a3;
  --accent: #c9822c;        /* ambra — stato attivo/selezionato/conferma */
  --accent-text: #1a1a1a;   /* testo sopra sfondo accento */
}
```

Il rosso di conferma-eliminazione già esistente (`.icon-btn.confirm`,
`#a32d2d`) resta invariato — è un colore semantico (pericolo), non parte
della palette neutra, e si distingue bene dall'ambra dell'accento normale.

## Copertura per pagina

**Editor** (`public/editor/`): toolbar e pulsanti icona, gruppi/separatori,
input numerici (`icon-num`), color-swatch griglia, pannelli laterali
(Immagini / Fog of war / Fine tuning griglia), righe elenco poligoni/immagini,
lightbox, banner di avviso upload video bloccato, canvas mappa e overlay
griglia.

**Controllo** (`public/control/`): select location, riquadro anteprima mappa
e fog, pad pan/zoom, slider zoom, griglia thumbnail immagini, elenco
testuale fog, pulsante "torna alla mappa".

**Display** (`public/display/`): sfondo/letterbox attorno alla mappa quando
non riempie tutto lo schermo. Il puntino wifi mantiene il comportamento
opacità ok/bad già esistente (vedi fix della sessione precedente) e il colore
"bad" resta il rosso semantico invariato (`#c62828`, lo stesso registro del
rosso di conferma-eliminazione) — nessun nuovo token per lo stato di errore.

## Cosa NON cambia (garanzie)

- Zero nuove dipendenze npm, zero build step.
- Zero righe di JavaScript modificate in editor.js/control.js/display.js.
- Tutti i comportamenti esistenti restano identici: commit su `change` (non
  su `input`) per i campi numerici, pattern arma-poi-conferma per le
  eliminazioni, validazione pre-upload video, endpoint `/api/map/clear`, ecc.
- Nessuna modifica ai dati salvati in `state.json`.

## Verifica

Restyle puramente visivo → verifica per confronto visivo, non test
automatici: dopo l'implementazione, screenshot dal vivo di ciascuna delle tre
pagine (via browser tool, sullo stesso server locale già in uso in questa
sessione) confrontati con i mockup approvati durante il brainstorming
(`.superpowers/brainstorm/571702-1787591495/content/visual-style.html`,
`editor-full.html`, `control-full.html`). Nessuna regressione funzionale
attesa dato che nessun JS viene toccato, ma vale comunque la pena verificare
a vista: apertura file mappa, disegno poligono, drag griglia, upload
immagine, pan/zoom da controllo — per confermare che nulla si sia rotto per
un selettore CSS scritto in modo troppo ampio.
