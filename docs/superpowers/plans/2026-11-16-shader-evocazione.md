# Piano: shader «cerchio d'evocazione» (16 nov 2026)

Fase 7 del piano generale. Branch `shader-evocazione`, sopra `perf-ping-display`.

## Cosa c'è nel repo sorgente

In `github.com/alph286/shaders/shaders/` ci sono tre file:

- `summoning-circle.html`: anello di rune che ruota. Un solo pass. Il fluido
  dell'originale Shadertoy è stato tolto perché senza webcam restava fermo.
- `summoning-circle-static.html`: uguale, ma l'anello non ruota. Le rune
  cambiano da sole nel tempo (termine `MORPH`).
- `summoning-circle-trail.html`: l'unico multi-pass. Quattro pass: rune,
  fluido (ping-pong RGBA16F), colore della scia (ping-pong), composizione.
  Dove le rune sono accese il fluido riceve una spinta e si aggiunge colore
  rosso, che poi scorre e si spegne piano.

Le prime due sono funzioni pure di posizione e tempo: entrano in
`AOE_SHADER_EFFECTS` come gli altri shader a un pass. Serve una pipeline
nuova solo per la terza.

## Come si sceglie

Come aree d'effetto, voci nuove del menu «···» del pannello AOE (`AoePanel`,
lo usano sia /control sia /party). Il commento accanto ad
`AOE_SHADER_OVERRIDE_IDS` in `media.js` le aspettava già lì. Le decorazioni
non vanno bene: si piazzano solo da /editor e `ShaderLayer` usa ancora il
canvas grande quanto la mappa.

Slug: `summoning_circle`, `summoning_circle_static`, `summoning_circle_trail`.
Vanno aggiunti a `AOE_SHADER_OVERRIDE_IDS` e
`AOE_SHADER_OVERRIDE_DEFAULT_COLOR` (`white`) in `media.js`. Il server e la
migrazione dello stato li accettano da lì senza modifiche. In
`editor-app/src/control/aoe/constants.ts` vanno in `AOE_SHADER_MENU`, con
un'icona in `icons.tsx`.

Sono cerchi: rendono bene su Sfera e Cubo. Su Cono e Linea il ritaglio della
sagoma taglia l'anello. Va bene così, si sceglie dal menu.

## Pipeline multi-pass accanto ad `AoeShaderLayer`

- Il registro dice `multipass: 'summoningTrail'` e `fillScale: false`. Come la
  ragnatela, l'anello va lasciato alla sua scala, sennò esce dalla sagoma.
  `fragmentSrc` resta il programma di composizione: stesso wrapper
  `aoeEffectFragmentSrc` (ritaglio sulla sagoma, `u_viewportOrigin`), in più
  `u_dye` e `u_hasDye`.
- Lo stato della simulazione (texture e framebuffer) è per area, in una mappa
  `aoe.id -> sim` dentro `AoeShaderLayer`. Si crea quando l'area compare.
  Quando l'area sparisce, o la lista si svuota, texture e framebuffer vengono
  cancellati: niente lavoro e niente memoria se lo shader non è in scena.
- Prima della composizione, per ogni area multi-pass si fa un passo di
  simulazione nei suoi framebuffer, a risoluzione ridotta: lato lungo al
  massimo `EVOCATION_SIM_MAX_PX` (128 px), mai più grande del riquadro. Poi si
  torna al framebuffer del canvas e la composizione disegna nel riquadro
  dell'area. Le rune nitide si calcolano lì, a piena risoluzione, come negli
  altri shader. La scia viene dalla texture piccola, ingrandita col filtro
  lineare.
- Frame rate: un passo di simulazione per ogni disegno del layer. Il layer è
  già limitato ad `AOE_SHADER_MAX_FPS` (30). Il passo usa il tempo davvero
  passato (`evocationStepParams(dtMs)`: spostamento, decadimento e colore
  aggiunto riscalati, con un limite), così la scia ha la stessa durata a 60,
  30 o 11 fps. A 11 fps non si recupera con più passi, che costerebbero.
- Gli shader esistenti non cambiano: nessuna riga del wrapper comune e nessun
  uniform nuovo nei loro programmi. Le aree senza `multipass` seguono la
  strada di sempre. Lo stato GL che la composizione cambia (texture unit 0 e
  1) non è usato dagli altri programmi AOE.
- Senza render target float (`EXT_color_buffer_float`, o framebuffer
  incompleto), la variante con scia si disegna senza scia (`u_hasDye = 0`),
  con un solo avviso in console.
- Dissolvenza d'entrata: le tre varianti compaiono in 2 s da quando l'area
  viene lanciata, come nell'originale. `u_age` è il tempo da quando
  `AoeShaderLayer` ha visto l'area la prima volta. Gli altri programmi non
  hanno questo uniform, quindi `getUniformLocation` dà null e la chiamata non
  fa niente.

## Costo sul Raspberry Pi 4

Il V3D è già al limite: 11-12 fps con mappa video e 3 aree. Quindi:

- simulazione a 128 px di lato al massimo: con tre pass sono circa 16k pixel
  per pass, poco rispetto alla composizione;
- composizione a 4 letture della scia invece delle 25 dell'originale (sfocatura
  5x5): l'ingrandimento lineare sfoca già;
- disegno solo nel riquadro dell'area (SubCanvas e `gl.viewport`), al massimo
  a 30 fps;
- se la variante con scia non è in scena, non c'è nessun passo, nessuna
  texture e nessun framebuffer.

Rischi da segnalare: il costo delle rune a piena risoluzione (rand, 9 vicini,
molti rami) è simile a quello dei fuochi già portati, ma non è misurato sul
Pi. Il supporto di `EXT_color_buffer_float` su V3D + Chromium non è
verificato. Per questo c'è la strada di ripiego.

## Passi (un commit ciascuno)

1. Questo piano.
2. Rune in GLSL condiviso + `summoning_circle` e `summoning_circle_static` in
   `AOE_SHADER_EFFECTS` (un pass).
3. Pipeline multi-pass: funzioni pure (`evocationSimSize`,
   `evocationStepParams`, `staleSimIds`) con test, programmi di simulazione,
   gestione dello stato per area in `AoeShaderLayer`, `summoning_circle_trail`.
4. Esposizione: slug in `media.js`, menu e icona in `editor-app`,
   `npm run build:all`, commit di `public/`.
5. Verifiche (compilazione e link, `gl.readPixels` dentro e fuori dal cerchio,
   `compare-visual.mjs` contro `perf-ping-display` per gli shader esistenti) e
   cronaca in `docs/storia/2026-11-16-shader-evocazione.md`.
