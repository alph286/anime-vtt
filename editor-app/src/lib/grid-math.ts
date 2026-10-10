import type { Grid, Point } from '@/types';

export function constrainSquare(widthPct: number, heightPct: number, nw: number, nh: number): { width: number; height: number } {
  const sidePx = Math.max((widthPct / 100) * nw, (heightPct / 100) * nh);
  return { width: (sidePx / nw) * 100, height: (sidePx / nh) * 100 };
}

export interface AlignResult { baseCellSize: number; divisions: number; offsetX: number; offsetY: number }

export function gridFromAlignDrag(
  start: Point, end: Point, nw: number, nh: number, square: boolean, divisions: number
): AlignResult | null {
  const leftPct = Math.min(start[0], end[0]);
  const topPct = Math.min(start[1], end[1]);
  const widthPct = Math.abs(end[0] - start[0]);
  const heightPct = Math.abs(end[1] - start[1]);
  if (widthPct < 0.5 || heightPct < 0.5) return null;

  let cellW = (widthPct / 100) * nw;
  let cellH = (heightPct / 100) * nh;
  if (square) {
    const side = Math.max(cellW, cellH);
    cellW = side;
    cellH = side;
  }
  const div = Math.max(1, Math.round(divisions) || 1);
  const baseCellSize = Math.max(4, Math.round((cellW + cellH) / 2));
  const cellSize = Math.max(4, Math.round(baseCellSize / div));
  const originX = Math.round((leftPct / 100) * nw);
  const originY = Math.round((topPct / 100) * nh);
  return {
    baseCellSize,
    divisions: div,
    offsetX: ((originX % cellSize) + cellSize) % cellSize,
    offsetY: ((originY % cellSize) + cellSize) % cellSize,
  };
}

export function gridHistoryAfter(before: Grid, patch: Partial<Grid>): Grid {
  const after = { ...before, ...patch };
  if (patch.baseCellSize !== undefined || patch.divisions !== undefined) {
    after.cellSize = Math.max(4, Math.round(after.baseCellSize / after.divisions));
  }
  return after;
}

export function nudgeOffsets(grid: Pick<Grid, 'cellSize' | 'offsetX' | 'offsetY'>, dx: number, dy: number): { offsetX: number; offsetY: number } {
  const cellSize = grid.cellSize || 100;
  const step = Math.max(1, Math.round(cellSize * 0.1));
  return { offsetX: (grid.offsetX || 0) + dx * step, offsetY: (grid.offsetY || 0) + dy * step };
}
