import { describe, expect, it } from 'vitest';
import { computeViewportScreenRect, localToScreen, panDeltaForDrag, screenToLocal, type ViewArgs } from './view-math';
import type { ControlLocation } from '../types';

function loc(over: Partial<ControlLocation['map']> = {}): ControlLocation {
  return {
    id: 'l', name: 'L', archived: false, images: [],
    map: {
      file: 'm.png', type: 'image', scale: 1, flip180: false, rotate90: false,
      grid: { enabled: true, cellSize: 50, baseCellSize: 50, divisions: 1, offsetX: 0, offsetY: 0, color: '#fff', lineWidth: 1, opacity: 1 },
      audio: { main: { name: '', file: null, volume: 1 }, special: { name: '', file: null, volume: 1 } },
      polygons: [], shaders: [], aoes: [], ...over,
    },
  } as ControlLocation;
}
function args(over: Partial<ViewArgs> = {}): ViewArgs {
  return {
    location: loc(), displayViewport: { width: 1000, height: 500 },
    naturalW: 2000, naturalH: 1000, imageRect: { left: 0, top: 0, width: 400, height: 200 },
    previewW: 400, previewH: 200, ...over,
  };
}

describe('localToScreen / screenToLocal', () => {
  it('sono una inversa esatta per ogni rotazione', () => {
    for (const rot of [0, 90, 180, 270]) {
      const [sx, sy] = localToScreen(120, 70, 300, 200, 300, 200, rot, 1.7, 13, -9);
      const [lx, ly] = screenToLocal(sx, sy, 300, 200, 300, 200, rot, 1.7, 13, -9);
      expect(lx).toBeCloseTo(120);
      expect(ly).toBeCloseTo(70);
    }
  });
  it('rotazione 0, S=1: il centro locale e il centro schermo', () => {
    expect(localToScreen(150, 100, 300, 200, 300, 200, 0, 1, 0, 0)).toEqual([150, 100]);
  });
});

describe('computeViewportScreenRect', () => {
  it('vista intera: il rettangolo copre tutta l\'anteprima', () => {
    const r = computeViewportScreenRect(args())!;
    expect(r.left).toBeCloseTo(0); expect(r.top).toBeCloseTo(0);
    expect(r.width).toBeCloseTo(400); expect(r.height).toBeCloseTo(200);
  });
  it('liveView.scale=2: meta larghezza/altezza, centrato (calcolo a mano: 100,50,200,100)', () => {
    const l = loc({ liveView: { scale: 2, offsetX: 0, offsetY: 0 } });
    const r = computeViewportScreenRect(args({ location: l }))!;
    expect(r.left).toBeCloseTo(100); expect(r.top).toBeCloseTo(50);
    expect(r.width).toBeCloseTo(200); expect(r.height).toBeCloseTo(100);
  });
  it('offsetX positivo (contenuto spostato a destra) sposta il riquadro a sinistra', () => {
    // scale 2, offsetX 100: x0 = 500 + (0-100-500)/2 = 200 -> frac .1 -> left 40... (in px anteprima)
    const l = loc({ liveView: { scale: 2, offsetX: 100, offsetY: 0 } });
    const r = computeViewportScreenRect(args({ location: l }))!;
    expect(r.left).toBeCloseTo(((500 + (0 - 100 - 500) / 2) / 1000) * 400); // 80
    expect(r.left).toBeCloseTo(80);
  });
  it('senza displayViewport o con naturalW 0 -> null', () => {
    expect(computeViewportScreenRect(args({ displayViewport: null }))).toBeNull();
    expect(computeViewportScreenRect(args({ naturalW: 0 }))).toBeNull();
    expect(computeViewportScreenRect(args({ imageRect: null }))).toBeNull();
  });
});

describe('panDeltaForDrag', () => {
  it('rotazione 0, S=1: dx = -(10/400)*1000 = -25', () => {
    const d = panDeltaForDrag(args(), 10, 0)!;
    expect(d.dx).toBeCloseTo(-25);
    expect(d.dy).toBeCloseTo(0);
  });
  it('S scala il delta (S=2 -> -50)', () => {
    const l = loc({ liveView: { scale: 2, offsetX: 0, offsetY: 0 } });
    expect(panDeltaForDrag(args({ location: l }), 10, 0)!.dx).toBeCloseTo(-50);
  });
  it('rotazione 180: il delta e nello spazio schermo ruotato, quindi la catena -rot/+rot si annulla (stesso -25)', () => {
    const l = loc({ flip180: true });
    const d = panDeltaForDrag(args({ location: l }), 10, 0)!;
    expect(d.dx).toBeCloseTo(-25);
    expect(d.dy).toBeCloseTo(0);
  });
  it('senza displayViewport o imageRect -> null', () => {
    expect(panDeltaForDrag(args({ displayViewport: null }), 1, 1)).toBeNull();
    expect(panDeltaForDrag(args({ imageRect: null }), 1, 1)).toBeNull();
  });
});

// Caso ruotato di 90° derivato a mano da control.js (computeViewportScreenRect
// e il pointermove del pan). Mappa 2000×1000 (rotazione automatica 0) con
// rotate90 -> rotation 90. TV 1000×500 -> spazio effettivo 500×1000,
// tvFit = fitRect(500,1000,2000,1000) = {left 0, top 375, w 500, h 250}.
// Anteprima 400×200 -> spazio effettivo 200×400, imageRect =
// fitRect(200,400,2000,1000) = {left 0, top 150, w 200, h 100}.
// rotate(-90): (x,y) -> (y,-x); rotate(+90): (x,y) -> (-y,x).
describe('rotazione 90 (calcolo a mano)', () => {
  const rot90 = (live: { scale: number; offsetX: number; offsetY: number }) =>
    args({
      location: loc({ rotate90: true, liveView: live }),
      imageRect: { left: 0, top: 150, width: 200, height: 100 },
    });

  it('computeViewportScreenRect, S=2 offsetX=100 -> {80,50,200,100}', () => {
    // screenToLocal(0,0): d=((0-100-500)/2, -250/2)=(-300,-125) -> (-125,300) -> (125,800)
    // screenToLocal(1000,500): d=(200,125) -> (125,-200) -> (375,300)
    // vista: left 125 top 300 w 250 h 500 -> frazioni .25, -.3, .5, 2
    // locale: left 50 top 120 right 150 bottom 320
    // localToScreen(50,120): (-50,-80) -> (80,-50) -> (280,50)
    // localToScreen(150,320): (50,120) -> (-120,50) -> (80,150)
    const r = computeViewportScreenRect(rot90({ scale: 2, offsetX: 100, offsetY: 0 }))!;
    expect(r.left).toBeCloseTo(80);
    expect(r.top).toBeCloseTo(50);
    expect(r.width).toBeCloseTo(200);
    expect(r.height).toBeCloseTo(100);
  });

  it('panDeltaForDrag, S=1, trascinamento (10,4) -> (-25,-10)', () => {
    // rotate(-90)(10,4) = (4,-10); dViewLeft = 4/200*500 = 10;
    // dViewTop = -10/100*250 = -25; rotate(+90)(10,-25) = (25,10); emesso -S*(25,10)
    const d = panDeltaForDrag(rot90({ scale: 1, offsetX: 0, offsetY: 0 }), 10, 4)!;
    expect(d.dx).toBeCloseTo(-25);
    expect(d.dy).toBeCloseTo(-10);
  });
});
