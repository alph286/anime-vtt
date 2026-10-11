type Pt = [number, number];

declare function fitRect(containerW: number, containerH: number, naturalW: number, naturalH: number): import('./types').Rect;
declare function positionFitBox(el: HTMLElement, rect: import('./types').Rect): void;
declare function isVideoFile(filename: string): boolean;
declare function mediaW(el: HTMLImageElement | HTMLVideoElement): number;
declare function mediaH(el: HTMLImageElement | HTMLVideoElement): number;
declare function loadMapMedia(
  imgEl: HTMLImageElement, videoEl: HTMLVideoElement, filename: string, src: string, onReady: () => void
): HTMLImageElement | HTMLVideoElement;
declare function computeTotalRotation(naturalW: number, naturalH: number, flip180: boolean, rotate90: boolean): number;
declare function rotatePointToBase(p: Pt, rotation: number): Pt;
declare function layoutMapWrap(container: HTMLElement, wrapEl: HTMLElement, rotation: number): { width: number; height: number };
declare function renderGridSvg(svgEl: SVGElement, grid: import('./types').Grid, naturalW: number, naturalH: number): void;
declare function pointInPolygon(p: Pt, polygon: Pt[]): boolean;
declare function aoePixelsPerMeter(grid: import('./types').Grid): number;
declare function shaderDecorationRectPercent(
  deco: import('./types').ShaderDeco, grid: import('./types').Grid, naturalW: number, naturalH: number
): { leftPct: number; topPct: number; widthPct: number; heightPct: number };
declare const SHADER_EFFECTS: Record<string, { label: string }>;
declare class ShaderLayer {
  constructor(canvas: HTMLCanvasElement);
  readonly available: boolean;
  render(decorations: import('./types').ShaderDeco[], grid: import('./types').Grid, naturalW: number, naturalH: number): void;
}

// --- Globali usati da /control (public/shared/media.js e shader-effects.js) ---
declare function rotateVector(x: number, y: number, angleDeg: number): Pt;
declare function rotateDirectionToBase(d: Pt, rotation: number): Pt;
declare function snapAoeOrigin(
  shape: string, sizeM: number, widthM: number, rotation: number, grid: import('./types').Grid,
  xPct: number, yPct: number, naturalW: number, naturalH: number
): Pt;
// Le AoE non hanno ancora un tipo condiviso in types.ts: forma volutamente larga.
type AoeLike = Record<string, any>;
declare function aoeOutlinePoints(aoe: AoeLike, grid: import('./types').Grid, naturalW: number, naturalH: number): Pt[];
declare function aoeAffectedCells(aoe: AoeLike, grid: import('./types').Grid, naturalW: number, naturalH: number): Array<{ col: number; row: number }>;
declare function cellRectPercent(
  col: number, row: number, grid: import('./types').Grid, naturalW: number, naturalH: number
): { leftPct: number; topPct: number; widthPct: number; heightPct: number };
declare function appendAoeOriginMarker(
  svgEl: SVGElement, aoe: AoeLike, strokeColor: string, strokeWidth: number, naturalW: number, naturalH: number
): void;
declare function aoeColorHex(name: string): string;
declare function aoeColorDarkHex(name: string): string;
declare function polygonClipPath(points: Pt[]): string;
declare function resolveAoeShaderId(aoe: AoeLike): string | null;
interface PingPoint { x: number; y: number; t: number; strokeId?: string; [k: string]: unknown }
declare function groupPingPointsByStroke(points: PingPoint[]): PingPoint[][];
declare const AOE_METERS_PER_CELL: number;
declare const AOE_COLOR_CYCLE_NAMES: string[];
declare const AOE_SHADER_OVERRIDE_DEFAULT_COLOR: Record<string, string>;
declare class PingLayer {
  constructor(canvas: HTMLCanvasElement);
  readonly available: boolean;
  render(groups: PingPoint[][], lifespanSec: number, zoomScale: number): void;
}
declare class AoeShaderLayer {
  constructor(canvas: HTMLCanvasElement);
  readonly available: boolean;
  render(aoes: AoeLike[], grid: import('./types').Grid, naturalW: number, naturalH: number): void;
}
