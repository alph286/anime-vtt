# Ping e aree più leggeri su /display (16 nov 2026)

Branch: `perf-ping-display`. Commit principale: `146077e`.

## Problema

Sul Raspberry Pi 4, con la mappa video Tarrasque 5 (webm 1421x1080) e 3 aree
lanciate:

| Caso | fps |
|---|---|
| senza ping | 11-12 |
| con tap | 8,3 |
| con scia | 4,7 |
| misto | 4,2 |

Altri riferimenti: senza shader AOE 29 fps; video in pausa e senza AOE 34 fps.

Mezza risoluzione aiutava poco (misto: 7,1 → 8,9). Quindi il peso non è il
calcolo dello shader. Pesa la composizione di un canvas WebGL grande quanto la
mappa sopra il video.

## Cosa è cambiato

- `SubCanvas`: il canvas di ping e aree copre solo un riquadro, arrotondato a
  32 px, e viene posizionato con il CSS sopra la mappa.
- I canvas vuoti sono nascosti, non ripuliti e ripresentati a ogni frame.
- Lo shader del ping esce subito sui pixel lontani da ogni gruppo.
- Le aree lanciate si ridisegnano al massimo a 30 fps (`AOE_SHADER_MAX_FPS`),
  subito se cambiano.
- `ShaderLayer` è nascosto quando la lista è vuota.
- `display.js` nasconde le aree quando non c'è una mappa.

Le API restano le stesse: /control e /party non cambiano.

## Verificato

- Confronto pixel con `main` tramite `gl.readPixels`: 0 pixel diversi su
  /display e /control. Casi: ping, scia, misto, bordo, zoom 1.7, sfera, cono,
  cubo, linea.
- Misure locali su RTX 3060: megapixel a schermo nel caso peggiore 2,76 → 0,88.
- `npm test` verde dopo il merge con `minori-noti`.

## Non verificato

- Gli fps sul Pi: il Pi era spento.
- Scatti durante scie lunghe, per le riallocazioni del buffer a passi di 32 px.
- Il giudizio visivo di Alph dal vivo.

## Limiti noti

- Su /control e /party `use-shader-loop.ts` ripulisce a mano invece di
  chiamare `render([])`. Lì i canvas vuoti restano visibili. Riguarda solo le
  prestazioni del telefono.
- L'uscita anticipata nello shader del ping fa letture di texture in flusso non
  uniforme. Va bene finché la texture del rumore non ha mipmap.
- A 75 Hz il limite AOE dà 25 fps.
- `ShaderLayer` (decorazioni) usa ancora il canvas a tutta mappa.
- `tools/perf-ping/compare-visual.mjs` richiede una GPU NVIDIA. Non copre dpr
  diverso da 1, aree fuori mappa, `ShaderLayer` e la composizione.
- `tools/perf-ping/pi-measure.mjs` non funziona (restituisce «pingLayer non
  definito»). Cause sospette, non verificate: manca `Runtime.enable` prima di
  `Runtime.evaluate`, oppure la pagina agganciata non è quella giusta.
- `bench-ping.js` riporta la risoluzione del contenitore, non quella del buffer
  ridotto.
