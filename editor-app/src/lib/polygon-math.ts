import type { Point } from '@/types';
import { clamp } from './numbers';

export function translatePolygon(original: Point[], dx: number, dy: number): Point[] {
  return original.map(([x, y]) => [clamp(x + dx, 0, 100), clamp(y + dy, 0, 100)] as Point);
}

export function removeVertex(points: Point[], index: number): Point[] | null {
  if (points.length <= 3) return null;
  return points.filter((_, i) => i !== index).map((p) => [...p] as Point);
}

export function polygonMoved(a: Point[], b: Point[]): boolean {
  return a.some(([x, y], i) => x !== b[i][0] || y !== b[i][1]);
}

export function sortPolygonIdsByName(polys: { id: string; name: string }[]): string[] {
  return [...polys]
    .sort((a, b) => a.name.localeCompare(b.name, 'it', { numeric: true, sensitivity: 'base' }))
    .map((p) => p.id);
}
