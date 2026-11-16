# Cerchio d'evocazione (16 nov 2026)

Branch: `shader-evocazione`, sopra `perf-ping-display`. Piano:
`docs/superpowers/plans/2026-11-16-shader-evocazione.md`.

## Cosa c'è

Tre shader nuovi per le aree d'effetto, presi dalle tre varianti
`summoning-circle*.html` di `github.com/alph286/shaders`:

| Slug | Voce del menu | Pass |
|---|---|---|
| `summoning_circle` | Cerchio d'evocazione | 1 |
| `summoning_circle_static` | Cerchio d'evocazione (fermo) | 1 |
| `summoning_circle_trail` | Cerchio d'evocazione (scia) | 3 di simulazione + 1 di composizione |

Solo la variante con la scia è davvero multi-pass. Nelle altre due il
fluido dell'originale era già stato tolto nel repo sorgente.

- `summoningRuneGlsl(spin)` in `public/shared/shader-effects.js`: anello di
  rune (Buffer A), lo stesso per le tre varianti. Unica modifica:
  `iDate.w` diventa `u_time`.
- `EvocationSim`: texture e framebuffer di una sola area. Ci sono le rune
  (RGBA8), il fluido e il colore in ping-pong (RGBA16F). Il lato lungo è al
  massimo `EVOCATION_SIM_MAX_PX` (128 px).
- `AoeShaderLayer` tiene una mappa `aoe.id -> EvocationSim`. Prima di
  comporre un'area `multipass` fa un passo di simulazione, poi la compone nel
  suo riquadro. La simulazione viene buttata quando l'area sparisce, cambia
  shader o la lista si svuota.
- Il passo usa il tempo davvero passato (`evocationStepParams`), con un limite
  di 4 frame da 60 fps. Così la scia dura lo stesso a 60, 30 o 15 fps. Sotto i
  15 fps rallenta.
- La dissolvenza d'entrata (2 s) parte quando il layer vede l'area lanciata
  (`u_age`), non al caricamento della pagina. Vale per tutte e tre le varianti.
- Senza `EXT_color_buffer_float`, o con framebuffer incompleti, la variante
  con la scia si disegna senza scia, con un avviso in console.

## Come si usa

Da /control (o /party), modalità aree: pulsante «···» (Altri shader), poi
una delle tre voci «Cerchio d'evocazione». Il colore delle celle diventa
bianco. Poi si piazza l'area e si lancia come le altre. Rende bene su Sfera e
Cubo. Su Cono e Linea il ritaglio della sagoma taglia l'anello.

## Deviazioni dall'originale

- La sfocatura della scia usa 4 letture invece di 25 (5x5). L'ingrandimento
  dalla texture a 128 px sfoca già.
- Il colore della scia è in RGBA16F, non in RGBA8. In 8 bit il decadimento
  0.9981 per frame si arrotonda a zero e la scia non si spegnerebbe mai.
  Il commento dell'autore dice invece che si spegne piano.
- La spinta del fluido è riportata alla risoluzione della simulazione
  (`u_force = altezza/1080`). Così la scia si muove sullo schermo alla stessa
  velocità relativa dell'originale a tutto schermo.
- Nella variante con scia anche la scia ha la dissolvenza d'entrata
  (nell'originale no).
- Le rune nitide si calcolano nella composizione, a piena risoluzione.
  Quelle a 128 px servono solo a spingere il fluido e a dare il colore.

## Verificato (RTX 3060, ANGLE gl-egl, headless, 1280x720)

- Compilano e linkano tutti i programmi: 10 AOE, 6 decorazioni, 3 di
  simulazione. Nessun errore GL.
- `gl.readPixels` nello stesso frame, tre sfere affiancate:
  - subito dopo il lancio: 0 pixel accesi, per la dissolvenza;
  - dopo 3 s: pixel accesi dentro i cerchi in tutte e tre le varianti
    (rotante 5297 e fermo 5293 su 54180 pixel del disco; con scia 35034, di
    cui 25382 rossi, cioè la scia);
  - fuori da tutti i cerchi: 0 pixel accesi.
- Un frame con scia fa 4 draw call (3 di simulazione + 1). Una variante a un
  pass ne fa 1.
- Senza render target float (estensione nascosta per la prova): 1 draw call,
  rune accese, 0 pixel rossi.
- La lista vuota butta le simulazioni (0 rimaste) e nasconde il canvas.
  Un'area che passa da scia a fuoco butta la sua.
- Gli shader esistenti non cambiano:
  - `tools/perf-ping/compare-visual.mjs --ref=b836bf9` (main prima di
    perf-ping): «nessuna differenza» su /display e /control (ping e 4 aree).
    Con `--ref=main` ora si hanno falsi positivi, perché main contiene già i
    canvas ridotti;
  - confronto diretto con `AoeShaderLayer` di `perf-ping-display` per tutti e
    7 gli shader AOE di prima × 4 forme: 0 byte diversi, stesso riquadro.
  - Nota: `compare-visual.mjs --ref=perf-ping-display` dà falsi «DIFFERENZE».
    Lo strumento suppone che il riferimento usi il canvas pieno, quindi va
    usato solo contro `b836bf9`.
- /display su un server di prova (porta 3102, dati finti): un'area con scia e
  un fuoco lanciati, il layer disegna a 28,6 fps (limite 30), 1 simulazione
  attiva, nessun errore GL.
- Il server accetta `summoning_circle_trail` in `aoe:setShaderOverride`
  (test nuovo). Le tre voci sono nelle build di /control e /party.
- `npm test` verde.

## Correzioni dopo la revisione

- a. `EvocationSim`: `gl.clear` solo se il framebuffer è completo (prima dava
  INVALID_FRAMEBUFFER_OPERATION).
- b. Se manca `EXT_color_buffer_float` si prova `EXT_color_buffer_half_float`;
  resta il controllo con `checkFramebufferStatus`.
- c. Le `getUniformLocation` sono in cache per programma
  (`cachedUniformLocation`, WeakMap). Vale anche per gli altri punti del file
  che prima le chiamavano a ogni frame; cosa si disegna non cambia.

## NON verificato

- La resa visiva delle tre varianti, la scia compresa: la giudica Alph dal
  vivo.
- Fps sul Raspberry Pi 4. Il layer era già al limite (11-12 fps con mappa
  video e 3 aree). La composizione delle rune a piena risoluzione costa
  quanto un fuoco. La simulazione aggiunge 3 pass da ~16k pixel e un cambio
  di framebuffer per area.
- Che il V3D + Chromium del Pi esponga `EXT_color_buffer_float` e accetti
  framebuffer RGBA16F. Se no, la scia non c'è e resta l'anello (ripiego
  provato solo simulandolo sulla RTX).
- Il tocco vero su telefono del menu «···».
- Le icone del menu viste a schermo (stella a cinque punte in un doppio anello).

## Limiti noti

- Se l'area cambia misura (taglia, zoom, ridimensionamento della finestra) la
  simulazione riparte da zero e la scia si perde.
- Le tre voci hanno la stessa icona.
- Il colore della scia è fisso (rosso, `EVOCATION_TRAIL_RGB`) e non segue il
  colore dell'area.
- `u_time` è `performance.now()`: su un kiosk acceso per giorni la rotazione
  perde precisione, come gli altri shader.
