const test = require('node:test');
const assert = require('node:assert');
const {
  snapRectPx,
  pingGroupsBoundsPx,
  unionRectsPx,
  frameDue,
  idsNotIn,
  evocationSimSize,
  evocationStepParams,
  EVOCATION_SIM_MAX_PX,
  EVOCATION_MAX_STEP_SCALE,
  EVOCATION_SIM_PROGRAMS,
  AOE_SHADER_EFFECTS,
  PING_SONAR_REACH,
  PING_TRAIL_REACH,
  AOE_SHADER_MAX_FPS,
  PING_FRAGMENT_SRC
} = require('./shader-effects.js');

test('snapRectPx: arrotonda verso l\'esterno ai multipli del passo', () => {
  assert.deepStrictEqual(snapRectPx(10, 40, 70, 90, 1280, 720, 32), { x: 0, y: 32, w: 96, h: 64 });
});

test('snapRectPx: ritaglia al canvas pieno, anche quando il passo sborda', () => {
  assert.deepStrictEqual(snapRectPx(-50, -50, 1300, 709, 1270, 710, 32), { x: 0, y: 0, w: 1270, h: 710 });
});

test('snapRectPx: null se tutto fuori o vuoto', () => {
  assert.strictEqual(snapRectPx(-100, 10, -1, 50, 1280, 720, 32), null);
  assert.strictEqual(snapRectPx(1300, 10, 1400, 50, 1280, 720, 32), null);
  assert.strictEqual(snapRectPx(10, 10, 10, 50, 1280, 720, 32), null);
});

test('pingGroupsBoundsPx: un sonar copre il cerchio di raggio REACH*fadeDistance (+2 px)', () => {
  const fd = 100;
  const r = pingGroupsBoundsPx([[[500, 300]]], fd, 13, 1280, 720, 1);
  const reach = PING_SONAR_REACH * fd + 2;
  assert.deepStrictEqual(r, {
    x: Math.floor(500 - reach),
    y: Math.floor(300 - reach),
    w: Math.ceil(500 + reach) - Math.floor(500 - reach),
    h: Math.ceil(300 + reach) - Math.floor(300 - reach)
  });
});

test('pingGroupsBoundsPx: una scia copre i suoi punti più REACH*lineWidth, non fadeDistance', () => {
  const lw = 13;
  const r = pingGroupsBoundsPx([[[100, 100], [200, 150], [300, 120]]], 1000, lw, 1280, 720, 1);
  const reach = PING_TRAIL_REACH * lw + 2;
  assert.deepStrictEqual(r, {
    x: Math.floor(100 - reach),
    y: Math.floor(100 - reach),
    w: Math.ceil(300 + reach) - Math.floor(100 - reach),
    h: Math.ceil(150 + reach) - Math.floor(100 - reach)
  });
});

test('pingGroupsBoundsPx: unione di più gruppi, ritagliata al canvas', () => {
  const r = pingGroupsBoundsPx([[[10, 10]], [[1200, 700], [1270, 715]]], 50, 13, 1280, 720, 32);
  assert.deepStrictEqual(r, { x: 0, y: 0, w: 1280, h: 720 });
});

test('pingGroupsBoundsPx: null senza gruppi, con gruppi vuoti o tutti fuori', () => {
  assert.strictEqual(pingGroupsBoundsPx([], 50, 13, 1280, 720), null);
  assert.strictEqual(pingGroupsBoundsPx([[]], 50, 13, 1280, 720), null);
  assert.strictEqual(pingGroupsBoundsPx([[[-500, -500]]], 50, 13, 1280, 720), null);
});

test('pingGroupsBoundsPx: i margini coincidono con quelli dello shader', () => {
  assert.match(PING_FRAGMENT_SRC, new RegExp(`const float SONAR_REACH = ${PING_SONAR_REACH};`));
  assert.match(PING_FRAGMENT_SRC, new RegExp(`const float TRAIL_REACH = ${PING_TRAIL_REACH};`));
});

test('unionRectsPx: unione dei rettangoli delle aree', () => {
  const r = unionRectsPx([{ x: 100, y: 100, w: 50, h: 50 }, { x: 300, y: 40, w: 20, h: 300 }], 1280, 720, 32);
  assert.deepStrictEqual(r, { x: 96, y: 32, w: 224, h: 320 });
  assert.strictEqual(unionRectsPx([], 1280, 720), null);
});

test('frameDue: a 60 Hz con limite 30 fps disegna un frame sì e uno no', () => {
  assert.strictEqual(AOE_SHADER_MAX_FPS, 30);
  let last = null;
  let drawn = 0;
  for (let i = 0; i < 60; i++) {
    const now = i * (1000 / 60) + (i % 3 === 0 ? 0.6 : -0.6); // un po' di jitter
    if (frameDue(now, last, 30)) {
      drawn++;
      last = now;
    }
  }
  assert.strictEqual(drawn, 30);
});

test('frameDue: sotto il limite disegna sempre; primo frame sempre', () => {
  assert.strictEqual(frameDue(0, null, 30), true);
  assert.strictEqual(frameDue(1000, 960, 30), true);
  assert.strictEqual(frameDue(1000, 990, 30), false);
});

test('idsNotIn: le chiavi senza area corrispondente', () => {
  const m = new Map([['a', 1], ['b', 2], ['c', 3]]);
  assert.deepStrictEqual(idsNotIn(m.keys(), ['b', 'x']), ['a', 'c']);
  assert.deepStrictEqual(idsNotIn([], ['a']), []);
});

test('cerchi d\'evocazione a un pass: registrati, fillScale spento, u_age, niente macro né nomi Shadertoy', () => {
  for (const id of ['summoning_circle', 'summoning_circle_static']) {
    const def = AOE_SHADER_EFFECTS[id];
    assert.ok(def, id);
    assert.strictEqual(def.fillScale, false);
    assert.match(def.fragmentSrc, /uniform float u_age;/);
    assert.match(def.fragmentSrc, /#undef PX/);
    assert.doesNotMatch(def.fragmentSrc, /iDate|iTime|iResolution/);
  }
  assert.match(AOE_SHADER_EFFECTS.summoning_circle.fragmentSrc, /u_time \* 2\.0/);
  assert.match(AOE_SHADER_EFFECTS.summoning_circle_static.fragmentSrc, /u_time \* 0\.0/);
});

test('evocationSimSize: lato lungo al massimo EVOCATION_SIM_MAX_PX, stesse proporzioni', () => {
  assert.deepStrictEqual(evocationSimSize(700, 300), { w: EVOCATION_SIM_MAX_PX, h: 55 });
  assert.deepStrictEqual(evocationSimSize(300, 700), { w: 55, h: EVOCATION_SIM_MAX_PX });
  assert.deepStrictEqual(evocationSimSize(512, 512, 128), { w: 128, h: 128 });
});

test('evocationSimSize: mai più grande del riquadro, mai sotto 1 px', () => {
  assert.deepStrictEqual(evocationSimSize(90, 40), { w: 90, h: 40 });
  assert.deepStrictEqual(evocationSimSize(0, 0), { w: 1, h: 1 });
  assert.deepStrictEqual(evocationSimSize(10000, 3), { w: 128, h: 1 });
});

test('evocationStepParams: un frame a 60 fps è il passo dell\'originale', () => {
  const p = evocationStepParams(1000 / 60);
  assert.ok(Math.abs(p.stepScale - 1) < 1e-9);
  assert.ok(Math.abs(p.decay - 0.9981) < 1e-9);
  assert.ok(Math.abs(p.inject - 0.07) < 1e-9);
  assert.deepStrictEqual(evocationStepParams(null), evocationStepParams(1000 / 60));
  assert.deepStrictEqual(evocationStepParams(-5), evocationStepParams(1000 / 60));
});

test('evocationStepParams: a 30 fps due frame per passo, stesso decadimento al secondo', () => {
  const p = evocationStepParams(1000 / 30);
  assert.ok(Math.abs(p.stepScale - 2) < 1e-9);
  assert.ok(Math.abs(Math.pow(p.decay, 30) - Math.pow(0.9981, 60)) < 1e-9);
});

test('evocationStepParams: passo limitato sopra e sotto', () => {
  assert.strictEqual(evocationStepParams(1000).stepScale, EVOCATION_MAX_STEP_SCALE);
  assert.strictEqual(evocationStepParams(1).stepScale, 0.25);
});

test('cerchio d\'evocazione con scia: multi-pass, composizione con u_dye, tre pass di simulazione', () => {
  const def = AOE_SHADER_EFFECTS.summoning_circle_trail;
  assert.strictEqual(def.multipass, 'summoningTrail');
  assert.strictEqual(def.fillScale, false);
  assert.match(def.fragmentSrc, /uniform sampler2D u_dye;/);
  assert.match(def.fragmentSrc, /uniform int u_hasDye;/);
  assert.deepStrictEqual(Object.keys(EVOCATION_SIM_PROGRAMS), ['rune', 'fluid', 'dye']);
  for (const src of Object.values(EVOCATION_SIM_PROGRAMS)) {
    assert.match(src, /^#version 300 es/);
    assert.doesNotMatch(src, /iDate|iTime|iResolution|uFluid|uRune|uDye/);
  }
  // Ogni voce del menu «···» ha uno shader e un colore di default.
  const { AOE_SHADER_OVERRIDE_IDS, AOE_SHADER_OVERRIDE_DEFAULT_COLOR } = require('./media.js');
  for (const id of ['summoning_circle', 'summoning_circle_static', 'summoning_circle_trail']) {
    assert.ok(AOE_SHADER_OVERRIDE_IDS.includes(id), id);
  }
  for (const id of AOE_SHADER_OVERRIDE_IDS) {
    assert.ok(AOE_SHADER_EFFECTS[id], id);
    assert.ok(AOE_SHADER_OVERRIDE_DEFAULT_COLOR[id], id);
  }
  // Nessun altro shader AOE è multi-pass.
  const multi = Object.entries(AOE_SHADER_EFFECTS).filter(([, d]) => d.multipass).map(([id]) => id);
  assert.deepStrictEqual(multi, ['summoning_circle_trail']);
});
