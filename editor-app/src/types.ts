export type Point = [number, number];
export interface Rect { left: number; top: number; width: number; height: number }

export interface Grid {
  enabled: boolean; cellSize: number; baseCellSize: number; divisions: number;
  offsetX: number; offsetY: number; color: string; lineWidth: number; opacity: number;
}
export interface Compass { visible: boolean; x: number; y: number; rotation: number }
export interface Polygon { id: string; name: string; points: Point[]; revealed: boolean }
export interface ShaderDeco { id: string; shaderId: string; x: number; y: number; widthM: number; heightM: number }
export interface AudioTrack { name: string; file: string | null; volume: number }
export interface MapData {
  file: string | null; type: string; scale: number; flip180: boolean; rotate90: boolean;
  grid: Grid; compass?: Compass;
  audio: { main: AudioTrack; special: AudioTrack };
  polygons: Polygon[]; shaders: ShaderDeco[];
}
export interface ImageItem { id: string; name: string; file: string | null; url?: string; proxy?: boolean; caption?: string; telegramDestination?: string | null }
export interface Location {
  id: string; name: string; map: MapData; images: ImageItem[]; archived: boolean; isDefault?: boolean;
}
export interface VttState { locations: Location[]; activeLocationId: string | null }
