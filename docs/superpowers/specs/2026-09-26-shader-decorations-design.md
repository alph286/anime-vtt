# Decorazioni Shader (Scenografia Mappa) — Design

## Contesto e obiettivo

Il DM vuole poter piazzare, da `/editor` durante la preparazione di una mappa,
elementi decorativi renderizzati con shader GLSL (es. "Portale", in futuro
"Luci", "Area d'effetto" ecc.) — non incantesimi live gestiti durante la
sessione (quello è il sistema AoE già esistente), ma scenografia persistente
legata alla location, analoga a bussola e griglia.

Il primo shader da implementare è **"Portale"**: uno shader Shadertoy
("Noise animation - Electric" di nimitz, stormoid.com; modificato "to look
like a portal" da Pleh; tweak fbm di foxes) fornito dall'utente, che produce
un effetto di rumore elettrico/anelli concentrici animato.

Fattibilità già verificata dall'utente stesso su Raspberry Pi 4 (hardware di
produzione): gli shader WebGL2 girano.

## Modello dati

Nuovo array su ogni location:

```js
location.map.shaders = [
  {
    id: 'nanoid',
    shaderId: 'portal',   // chiave nel registro shader, vedi sotto
    x: 50,                // centro, percentuale (0-100) come bussola/AoE
    y: 50,
    widthM: 3,            // larghezza in metri (stessa scala AoE: 1 cella = 1.5m)
    heightM: 4.5          // altezza in metri, indipendente dalla larghezza
  }
]
```

`server/state.js`: aggiungere `shaders: []` al seed `DEFAULT_STATE` e la
migrazione `if (!Array.isArray(location.map.shaders)) location.map.shaders = [];`
nel loop di `migrate()`, stesso punto dove già avviene per `aoes`.

Il registro `shaderId → definizione shader` vive lato client (vedi modulo
condiviso sotto); il server valida solo che `shaderId` sia una stringa nota
a una whitelist server-side (`['portal']`, da estendere man mano che si
aggiungono shader).

## Eventi socket (server/index.js)

Stesso pattern find-location→valida→muta→`saveState`→`broadcastState` già
usato da `compass:update` / `polygon:create` / AoE:

- `shader:place` `{ locationId, shaderId, x, y, widthM, heightM }` — valida
  `shaderId` contro la whitelist, `x`/`y` finiti, `widthM`/`heightM` finiti
  positivi, con un minimo di `0.5` (evita una decorazione di area nulla se
  il trascinamento iniziale è un click senza movimento) e un tetto di
  sicurezza (riusa `MAX_AOE_SIZE_M` come limite, stesso ordine di grandezza
  delle AoE). Genera `id` via `nanoid()`.
- `shader:move` `{ locationId, id, x, y }`
- `shader:resize` `{ locationId, id, widthM, heightM }`
- `shader:remove` `{ locationId, id }`

Nessun evento di rotazione: le decorazioni non ruotano (fuori scope, non
richiesto).

## Modulo condiviso: `public/shared/shader-effects.js`

Nuovo file, caricato da `/editor`, `/control` e `/display` (stesso pattern
di `public/shared/media.js`).

**Registro shader:**

```js
const SHADER_EFFECTS = {
  portal: {
    label: 'Portale',
    usesNoiseTexture: true,
    fragmentSrc: `#version 300 es
precision highp float;
uniform float u_time;
uniform vec2 u_resolution;
uniform sampler2D u_noise;
out vec4 fragColor;
// ... corpo portato dallo shader Shadertoy fornito, iTime->u_time,
// iResolution->u_resolution, iChannel0->u_noise, mainImage() +
// wrapper main() secondo le regole WebGL2 di shader-dev ...
`
  }
};
```

**Classe `ShaderLayer`** (gestisce un singolo `<canvas>` + contesto
WebGL2, riusata dalle tre pagine):

- `constructor(canvasEl)` — ottiene il contesto `webgl2`; se la creazione
  fallisce, la classe passa in uno stato "disabilitato" e `render()` diventa
  un no-op silenzioso (nessun crash su un ambiente senza WebGL2 — non ci
  aspettiamo che capiti sull'hardware reale, ma niente pagina bianca se
  succede).
- Compila i programmi al volo, uno per `shaderId` effettivamente usato, li
  mette in cache (mai ricompilare per lo stesso `shaderId`).
- Genera una volta una texture di rumore procedurale condivisa (256×256,
  canale singolo, `Math.random()` per texel, `gl.REPEAT`, `gl.LINEAR`) per
  ogni shader con `usesNoiseTexture: true` — niente asset immagine da
  spedire, coerente con "nessuna dipendenza esterna, deve girare offline".
- `render(shaders, grid, naturalW, naturalH)` — per ciascuna decorazione:
  converte `x/y/widthM/heightM` in un rettangolo pixel reali (stessa
  `aoePixelsPerMeter(grid)` già usata dalle AoE, per coerenza di scala in
  tutto il progetto), imposta `gl.viewport` su quel rettangolo (in
  coordinate canvas), usa il programma di quel `shaderId` e disegna un
  quad a schermo intero DENTRO quel viewport. Un viewport per decorazione
  invece di una singola passata fullscreen: niente maschera/ritaglio da
  calcolare, e larghezza/altezza indipendenti deformano naturalmente
  l'effetto (lo shader riceve `u_resolution` pari alle dimensioni reali del
  suo rettangolo).
- Il chiamante gestisce il proprio loop `requestAnimationFrame`, fermandolo
  quando l'array `shaders` è vuoto (nessun ciclo sprecato quando non c'è
  nulla da disegnare).

## Ordine dei livelli (`/control`, `/display`, `/editor`)

Il canvas shader va inserito **tra l'immagine/video della mappa e il layer
fog**, non sopra griglia/AoE:

```
media-img/video  (fondo)
map-shader-canvas   <-- nuovo
fog-layer
grid-svg
aoe-svg
(ping-marker su /display)
```

Questo è l'unico requisito che serve per "le decorazioni devono essere
coperte dal fog": nessuna logica di intersezione/maschera da scrivere, è
puro ordine di disegno. Il fog non rivelato (nero pieno su `/display`,
semi-trasparente su `/control` per riferimento del DM) copre il canvas
esattamente come coprirebbe l'immagine della mappa sottostante — la stessa
asimmetria di opacità fog già esistente tra le due pagine si applica gratis
anche alle decorazioni, senza bisogno di trattarle diversamente.

## `/editor`: piazzamento e modifica

**Piazzamento** — nuovo pulsante in barra strumenti (`#tool-shader`, icona
dedicata), stesso identico gesto di trascinamento già usato per
"Allinea alla griglia" (`grid-align`): pointerdown-drag-pointerup definisce
un rettangolo (`div` di anteprima, stesso approccio di `.grid-align-box`);
al rilascio il rettangolo diventa direttamente `widthM`/`heightM` iniziali
(conversione percentuale→metri via `aoePixelsPerMeter`), si invia
`shader:place` con `shaderId: 'portal'` (unico valore possibile per ora),
si torna in modalità selezione — identico a come `grid-align` si
autodisattiva dopo l'uso.

**Selezione e modifica** — dentro la modalità `select` già esistente,
oltre all'hit-test sui poligoni fog si aggiunge un hit-test sulle
decorazioni shader (rettangolo assi-allineati, riusa `pointInPolygon` con i
4 angoli come poligono). Selezione poligono e selezione decorazione shader
sono mutualmente esclusive (selezionarne una deseleziona l'altra), stesso
principio già in vigore tra poligoni e AoE. Decorazione selezionata:
- Trascinare il corpo la sposta (stesso pattern di `draggingPolygon`),
  `shader:move` inviato al pointerup.
- Un contorno tratteggiato (semplice `div` posizionato, come
  `.grid-align-box`) marca visivamente quale decorazione è selezionata.
- Nella sidebar, nuova scheda "Shader" (icona dedicata) con: lista delle
  decorazioni della location corrente (stesso stile della lista Fog), e per
  quella selezionata due stepper +/- (larghezza, altezza — stesso pattern a
  pulsanti già usato per le AoE su `/control`, per coerenza esplicitamente
  richiesta) più un pulsante elimina.

**Anteprima live**: l'editor monta il proprio `ShaderLayer` sul canvas della
sua mappa e lo tiene sincronizzato con `location.map.shaders` — il DM vede
l'effetto animato vero mentre lo posiziona, non un segnaposto statico.

## `/control` e `/display`

Nessun controllo aggiuntivo in UI: montano lo stesso `ShaderLayer` condiviso
e lo tengono sincronizzato con le decorazioni della location attiva (o in
anteprima, su `/control`) a ogni `state:update` — sono scenografia della
mappa, non stato di sessione da pilotare durante il gioco.

## Fuori scope (esplicitamente)

- Rotazione delle decorazioni.
- Colore/tinta personalizzabile (lo shader ha la sua palette).
- Selettore di stile multiplo in UI (un solo `shaderId` possibile per ora;
  l'aggiunta di un secondo shader in futuro richiederà solo una nuova voce
  nel registro + un dropdown nella sidebar, nessuna modifica strutturale).
- Il vecchio piano "pulsante di test AoE-shader su /control" — abbandonato,
  sostituito da questa feature.
