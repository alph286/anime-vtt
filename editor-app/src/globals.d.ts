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
