const test = require('node:test');
const assert = require('node:assert/strict');
const {
  AOE_METERS_PER_CELL,
  aoePixelsPerMeter,
  aoeShapePointsPx,
  aoeOutlinePoints,
  pointInPolygon,
  aoeAffectedCells,
  cellRectPercent
} = require('./media.js');

test('AOE_METERS_PER_CELL è 1.5', () => {
  assert.equal(AOE_METERS_PER_CELL, 1.5);
});

test('aoePixelsPerMeter converte cellSize in pixel-per-metro', () => {
  assert.equal(aoePixelsPerMeter({ cellSize: 90 }), 60);
});

test('aoePixelsPerMeter usa 100 come cellSize di default se assente', () => {
  assert.equal(aoePixelsPerMeter({}), 100 / 1.5);
});

test('aoeShapePointsPx: cubo produce un quadrato centrato sull\'origine', () => {
  const points = aoeShapePointsPx('cube', 3, undefined, { cellSize: 90 });
  // ppm = 60, size = 180, metà lato = 90
  assert.deepEqual(points, [[-90, -90], [90, -90], [90, 90], [-90, 90]]);
});

test('aoeShapePointsPx: sfera produce un poligono di 32 lati, raggio esatto', () => {
  const points = aoeShapePointsPx('sphere', 3, undefined, { cellSize: 90 });
  // ppm = 60, raggio = 3 * 60 = 180
  assert.equal(points.length, 32);
  // Primo punto (angolo 0) deve puntare "su" (verso -Y) a distanza = raggio.
  assert.ok(Math.abs(points[0][0] - 0) < 1e-9);
  assert.ok(Math.abs(points[0][1] - -180) < 1e-9);
  points.forEach(([x, y]) => {
    const dist = Math.hypot(x, y);
    assert.ok(Math.abs(dist - 180) < 1e-9, `punto a distanza ${dist}, atteso 180`);
  });
});

test('aoeShapePointsPx: cono ha vertice all\'origine e base pari alla lunghezza', () => {
  const points = aoeShapePointsPx('cone', 4.5, undefined, { cellSize: 90 });
  // ppm = 60, lunghezza = 270
  assert.deepEqual(points, [[0, 0], [-135, -270], [135, -270]]);
});

test('aoeShapePointsPx: linea usa la larghezza data, o 1.5m di default', () => {
  const points = aoeShapePointsPx('line', 3, 1.5, { cellSize: 100 });
  // ppm = 100/1.5, lunghezza = 3 * ppm = 200, larghezza = 1.5 * ppm = 100, metà larghezza = 50
  assert.deepEqual(points, [[-50, 0], [50, 0], [50, -200], [-50, -200]]);
});

test('pointInPolygon: quadrato semplice', () => {
  const square = [[0, 0], [10, 0], [10, 10], [0, 10]];
  assert.equal(pointInPolygon([5, 5], square), true);
  assert.equal(pointInPolygon([15, 5], square), false);
  assert.equal(pointInPolygon([-1, 5], square), false);
});

test('aoeOutlinePoints converte in percentuale rispettando assi X/Y separati', () => {
  const aoe = { shape: 'cube', sizeM: 1.5, x: 50, y: 50, rotation: 0 };
  const grid = { cellSize: 100 };
  // ppm = 100/1.5, size = 1.5 * ppm = 100, metà lato = 50
  const points = aoeOutlinePoints(aoe, grid, 1000, 500);
  // (50 - 50, 50 - 50) -> pixel (-50,-50) -> pct (-50/1000*100, -50/500*100) = (-5, -10) sommato a (50,50)
  assert.deepEqual(points, [
    [45, 40],
    [55, 40],
    [55, 60],
    [45, 60]
  ]);
});

test('aoeAffectedCells: sfera colpisce esattamente il blocco 3x3 attorno alla cella di origine', () => {
  const grid = { cellSize: 150, offsetX: 0, offsetY: 0 };
  // Origine = centro esatto della cella (3,3): (3.5*150, 3.5*150)... usiamo (3,3)
  // così il centro è (3+0.5)*150 = 525 su entrambi gli assi.
  const naturalW = 900, naturalH = 900;
  const originPx = 525;
  const aoe = {
    shape: 'sphere',
    sizeM: 2.25, // raggio = 2.25 * (150/1.5) = 225px
    x: (originPx / naturalW) * 100,
    y: (originPx / naturalH) * 100,
    rotation: 0
  };
  const cells = aoeAffectedCells(aoe, grid, naturalW, naturalH);
  const key = (c) => `${c.col},${c.row}`;
  const got = new Set(cells.map(key));
  const expected = new Set();
  for (let col = 2; col <= 4; col++) {
    for (let row = 2; row <= 4; row++) expected.add(`${col},${row}`);
  }
  assert.equal(got.size, 9);
  expected.forEach((k) => assert.ok(got.has(k), `manca la cella ${k}`));
});

test('cellRectPercent converte una cella in un rettangolo percentuale', () => {
  const rect = cellRectPercent(2, 3, { cellSize: 150, offsetX: 0, offsetY: 0 }, 900, 900);
  assert.deepEqual(rect, {
    leftPct: (300 / 900) * 100,
    topPct: (450 / 900) * 100,
    widthPct: (150 / 900) * 100,
    heightPct: (150 / 900) * 100
  });
});
