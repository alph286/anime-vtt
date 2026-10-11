import { beforeAll, describe, expect, it } from 'vitest';
import { newPingStrokeId, PING_LIFESPAN_SEC, PING_MIN_POINT_DIST_PCT, PingBuffer } from './ping';

// groupPingPointsByStroke vive in public/shared/shader-effects.js, che il
// loader dei test (test-load-shared.ts) non carica: quel file definisce
// classi WebGL che nel vm di node non hanno senso. Qui una copia fedele
// della funzione originale, installata sul globale come farebbe lo <script>.
beforeAll(() => {
  (globalThis as Record<string, unknown>).groupPingPointsByStroke = (points: PingPoint[]) => {
    const groups = new Map<unknown, PingPoint[]>();
    for (const pt of points) {
      let group = groups.get(pt.strokeId);
      if (!group) {
        group = [];
        groups.set(pt.strokeId, group);
      }
      group.push(pt);
    }
    return Array.from(groups.values());
  };
});

describe('costanti ping', () => {
  it('stessi valori di control.js', () => {
    expect(PING_LIFESPAN_SEC).toBe(1.2);
    expect(PING_MIN_POINT_DIST_PCT).toBe(1.5);
  });
  it('newPingStrokeId: id diversi ad ogni chiamata', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newPingStrokeId()));
    expect(ids.size).toBe(50);
  });
});

describe('PingBuffer', () => {
  it('prune rimuove i punti con eta >= 1.2 s', () => {
    const b = new PingBuffer();
    b.push({ x: 1, y: 1, t: 0, strokeId: 'a' });
    b.push({ x: 2, y: 2, t: 500, strokeId: 'b' });
    expect(b.prune(1199).length).toBe(2);
    expect(b.prune(1200).map((p) => p.strokeId)).toEqual(['b']);
    expect(b.size).toBe(1);
    expect(b.prune(1700).length).toBe(0);
    expect(b.size).toBe(0);
  });

  it('due strokeId diversi restano due gruppi anche se ravvicinati nel tempo', () => {
    const b = new PingBuffer();
    b.push({ x: 10, y: 10, t: 100, strokeId: 'tap1' });
    b.push({ x: 11, y: 11, t: 101, strokeId: 'tap2' });
    const groups = b.toGroups(200);
    expect(groups.length).toBe(2);
    expect(groups.map((g) => g.length)).toEqual([1, 1]);
  });

  it('stessa strokeId -> un solo gruppo, con eta in secondi', () => {
    const b = new PingBuffer();
    b.push({ x: 10, y: 10, t: 0, strokeId: 's' });
    b.push({ x: 20, y: 10, t: 100, strokeId: 's' });
    b.push({ x: 30, y: 10, t: 200, strokeId: 's' });
    const groups = b.toGroups(1000);
    expect(groups.length).toBe(1);
    expect(groups[0].map((p) => p.age)).toEqual([1, 0.9, 0.8]);
    expect(groups[0].map((p) => p.x)).toEqual([10, 20, 30]);
  });

  it('toGroups esclude i punti scaduti', () => {
    const b = new PingBuffer();
    b.push({ x: 1, y: 1, t: 0, strokeId: 'old' });
    b.push({ x: 2, y: 2, t: 1000, strokeId: 'new' });
    const groups = b.toGroups(1500);
    expect(groups.length).toBe(1);
    expect(groups[0][0].strokeId).toBe('new');
  });

  it('clear svuota', () => {
    const b = new PingBuffer();
    b.push({ x: 1, y: 1, t: 0, strokeId: 'a' });
    b.clear();
    expect(b.size).toBe(0);
    expect(b.toGroups(0)).toEqual([]);
  });
});
