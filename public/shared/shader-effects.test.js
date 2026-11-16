const test = require('node:test');
const assert = require('node:assert');
const {
  snapRectPx,
  pingGroupsBoundsPx,
  unionRectsPx,
  frameDue,
  idsNotIn,
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
