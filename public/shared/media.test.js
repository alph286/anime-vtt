const test = require('node:test');
const assert = require('node:assert/strict');
const {
  AOE_METERS_PER_CELL,
  AOE_COLORS,
  aoeColorHex,
  aoePixelsPerMeter,
  aoeShapePointsPx,
  snapAoeOrigin,
  aoeOutlinePoints,
  pointInPolygon,
  rectIntersectsPolygon,
  aoeAffectedCells,
  cellRectPercent
} = require('./media.js');

test('AOE_METERS_PER_CELL è 1.5', () => {
  assert.equal(AOE_METERS_PER_CELL, 1.5);
});

test('aoeColorHex risolve un colore noto della palette', () => {
  assert.equal(aoeColorHex('blue'), AOE_COLORS.blue);
});

test('aoeColorHex usa il rosso come fallback per un nome sconosciuto o mancante', () => {
  assert.equal(aoeColorHex('mai-esistito'), AOE_COLORS.red);
  assert.equal(aoeColorHex(undefined), AOE_COLORS.red);
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

test('rectIntersectsPolygon: un vertice del poligono dentro il rettangolo', () => {
  const rect = [0, 0, 10, 10];
  const triangle = [[5, 5], [50, 5], [50, 50]];
  assert.equal(rectIntersectsPolygon(...rect, triangle), true);
});

test('rectIntersectsPolygon: un angolo del rettangolo dentro il poligono (poligono molto più grande)', () => {
  const rect = [0, 0, 10, 10];
  const bigSquare = [[-5, -5], [100, -5], [100, 100], [-5, 100]];
  assert.equal(rectIntersectsPolygon(...rect, bigSquare), true);
});

test('rectIntersectsPolygon: solo un lato attraversa, nessun vertice dentro l\'altra forma', () => {
  const rect = [0, 0, 10, 10];
  // Triangolo largo e sottile che passa in orizzontale attraverso il
  // rettangolo: nessun suo vertice cade dentro il rettangolo (sono tutti a
  // x=-5 o x=15) e nessun angolo del rettangolo cade dentro il triangolo
  // (i suoi angoli sono tutti a y=0 o y=10, il triangolo passa per y=4..6).
  const thinTriangle = [[-5, 5], [15, 4], [15, 6]];
  assert.equal(rectIntersectsPolygon(...rect, thinTriangle), true);
});

test('rectIntersectsPolygon: nessuna sovrapposizione', () => {
  const rect = [0, 0, 10, 10];
  const farAway = [[100, 100], [110, 100], [110, 110], [100, 110]];
  assert.equal(rectIntersectsPolygon(...rect, farAway), false);
});

test('rectIntersectsPolygon: un lato del poligono esattamente sul bordo del rettangolo non conta (tocco di area zero)', () => {
  // Caso reale dopo l'aggancio alla griglia: il quadrato è adiacente al
  // rettangolo, bordo condiviso a x=10, nessuna area in comune -- non deve
  // contare come sovrapposizione (altrimenti un cubo agganciato alla
  // griglia includerebbe anche la colonna di celle subito accanto).
  const rect = [0, 0, 10, 10];
  const adjacentSquare = [[10, 0], [20, 0], [20, 10], [10, 10]];
  assert.equal(rectIntersectsPolygon(...rect, adjacentSquare), false);
});

test('rectIntersectsPolygon: poligono e rettangolo identici si sovrappongono per intero', () => {
  const rect = [0, 0, 10, 10];
  const sameSquare = [[0, 0], [10, 0], [10, 10], [0, 10]];
  assert.equal(rectIntersectsPolygon(...rect, sameSquare), true);
});

test('aoeAffectedCells (regola Xanathar): un cubo il cui bordo taglia 4 celle le include tutte, non solo quella del centro', () => {
  const grid = { enabled: true, cellSize: 100, offsetX: 0, offsetY: 0 };
  const naturalW = 1000, naturalH = 1000;
  const aoe = {
    shape: 'cube',
    sizeM: AOE_METERS_PER_CELL, // lato = 1 cella = 100px con cellSize 100
    // Origine a pixel (130,130): il quadrato 100x100 copre [80,180]x[80,180],
    // a cavallo delle celle (0,0)-(1,1). Sotto la vecchia regola (centro
    // cella) solo (1,1) sarebbe incluso -- il suo centro (150,150) è l'unico
    // dentro il quadrato.
    x: 13,
    y: 13,
    rotation: 0
  };
  const cells = aoeAffectedCells(aoe, grid, naturalW, naturalH);
  const key = (c) => `${c.col},${c.row}`;
  const got = new Set(cells.map(key));
  assert.equal(got.size, 4);
  ['0,0', '1,0', '0,1', '1,1'].forEach((k) => assert.ok(got.has(k), `manca la cella ${k}`));
});

test('snapAoeOrigin: cubo con lato pari (N=4) si aggancia all\'incrocio più vicino', () => {
  const grid = { enabled: true, cellSize: 100, offsetX: 0, offsetY: 0 };
  const [x, y] = snapAoeOrigin('cube', 4 * AOE_METERS_PER_CELL, undefined, 0, grid, 32, 28, 1000, 1000);
  assert.equal(x, 30); // 320px -> incrocio più vicino 300px
  assert.equal(y, 30); // 280px -> incrocio più vicino 300px
});

test('snapAoeOrigin: cubo con lato dispari (N=3) si aggancia al centro-cella più vicino', () => {
  const grid = { enabled: true, cellSize: 100, offsetX: 0, offsetY: 0 };
  const [x, y] = snapAoeOrigin('cube', 3 * AOE_METERS_PER_CELL, undefined, 0, grid, 32, 28, 1000, 1000);
  assert.equal(x, 35); // 320px -> centro-cella più vicino 350px
  assert.equal(y, 25); // 280px -> centro-cella più vicino 250px
});

test('snapAoeOrigin: linea a 0°, larghezza dispari -- larghezza al centro-cella, lunghezza all\'incrocio', () => {
  const grid = { enabled: true, cellSize: 100, offsetX: 0, offsetY: 0 };
  const [x, y] = snapAoeOrigin('line', 3 * AOE_METERS_PER_CELL, 3 * AOE_METERS_PER_CELL, 0, grid, 32, 28, 1000, 1000);
  assert.equal(x, 35); // larghezza (asse X): centro-cella più vicino
  assert.equal(y, 30); // lunghezza (asse Y): incrocio più vicino
});

test('snapAoeOrigin: linea a 90°, gli assi larghezza/lunghezza si scambiano', () => {
  const grid = { enabled: true, cellSize: 100, offsetX: 0, offsetY: 0 };
  const [x, y] = snapAoeOrigin('line', 3 * AOE_METERS_PER_CELL, 3 * AOE_METERS_PER_CELL, 90, grid, 32, 28, 1000, 1000);
  assert.equal(x, 30); // lunghezza (asse X ora): incrocio più vicino
  assert.equal(y, 25); // larghezza (asse Y ora): centro-cella più vicino
});

test('snapAoeOrigin: linea fuori dagli assi cardinali resta libera', () => {
  const grid = { enabled: true, cellSize: 100, offsetX: 0, offsetY: 0 };
  const [x, y] = snapAoeOrigin('line', 3 * AOE_METERS_PER_CELL, 3 * AOE_METERS_PER_CELL, 45, grid, 32.4, 28.1, 1000, 1000);
  assert.equal(x, 32.4);
  assert.equal(y, 28.1);
});

test('snapAoeOrigin: cono e sfera restano sempre a posizionamento libero', () => {
  const grid = { enabled: true, cellSize: 100, offsetX: 0, offsetY: 0 };
  assert.deepEqual(snapAoeOrigin('cone', 6, undefined, 0, grid, 32.4, 28.1, 1000, 1000), [32.4, 28.1]);
  assert.deepEqual(snapAoeOrigin('sphere', 6, undefined, 0, grid, 32.4, 28.1, 1000, 1000), [32.4, 28.1]);
});

test('snapAoeOrigin: griglia disattivata non aggancia nulla', () => {
  const grid = { enabled: false, cellSize: 100, offsetX: 0, offsetY: 0 };
  assert.deepEqual(snapAoeOrigin('cube', 4 * AOE_METERS_PER_CELL, undefined, 0, grid, 32, 28, 1000, 1000), [32, 28]);
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
