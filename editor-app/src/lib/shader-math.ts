import type { Point } from '@/types';
import { clamp } from './numbers';

export const SHADER_MIN_M = 0.5;
export type Corner = 'nw' | 'ne' | 'se' | 'sw';
export const CORNERS: Corner[] = ['nw', 'ne', 'se', 'sw'];
export const OPPOSITE: Record<Corner, Corner> = { nw: 'se', ne: 'sw', se: 'nw', sw: 'ne' };

export interface RectPct { leftPct: number; topPct: number; widthPct: number; heightPct: number }
export interface Placement { x: number; y: number; widthM: number; heightM: number }

export function rectCorners(r: RectPct): Record<Corner, Point> {
  return {
    nw: [r.leftPct, r.topPct],
    ne: [r.leftPct + r.widthPct, r.topPct],
    se: [r.leftPct + r.widthPct, r.topPct + r.heightPct],
    sw: [r.leftPct, r.topPct + r.heightPct],
  };
}

function fromRect(leftPct: number, topPct: number, widthPct: number, heightPct: number, nw: number, nh: number, ppm: number): Placement {
  return {
    x: clamp(leftPct + widthPct / 2, 0, 100),
    y: clamp(topPct + heightPct / 2, 0, 100),
    widthM: Math.max(SHADER_MIN_M, ((widthPct / 100) * nw) / ppm),
    heightM: Math.max(SHADER_MIN_M, ((heightPct / 100) * nh) / ppm),
  };
}

export function placementFromDrag(start: Point, end: Point, nw: number, nh: number, ppm: number): Placement {
  return fromRect(Math.min(start[0], end[0]), Math.min(start[1], end[1]), Math.abs(end[0] - start[0]), Math.abs(end[1] - start[1]), nw, nh, ppm);
}

export function resizeFromFixedCorner(fixed: Point, current: Point, nw: number, nh: number, ppm: number): Placement {
  return placementFromDrag(fixed, current, nw, nh, ppm);
}

export type StepKind = 'w-out' | 'w-in' | 'h-out' | 'h-in';

export function stepSize(deco: { widthM: number; heightM: number }, kind: StepKind): { widthM: number; heightM: number } {
  let { widthM, heightM } = deco;
  if (kind === 'w-out') widthM = Math.max(SHADER_MIN_M, widthM - SHADER_MIN_M);
  if (kind === 'w-in') widthM = widthM + SHADER_MIN_M;
  if (kind === 'h-out') heightM = Math.max(SHADER_MIN_M, heightM - SHADER_MIN_M);
  if (kind === 'h-in') heightM = heightM + SHADER_MIN_M;
  return { widthM, heightM };
}
