export type Point = [number, number];
export interface Rect { left: number; top: number; width: number; height: number }

export interface Grid {
  enabled: boolean; cellSize: number; baseCellSize: number; divisions: number;
  offsetX: number; offsetY: number; color: string; lineWidth: number; opacity: number;
}
export interface Compass { visible: boolean; x: number; y: number; rotation: number }
export interface Polygon { id: string; name: string; points: Point[]; revealed: boolean }
export interface ShaderDeco { id: string; shaderId: string; x: number; y: number; widthM: number; heightM: number }
export interface AudioLibraryItem { id: string; name: string; icon: string; file: string }
export interface BackgroundTrack { id: string; audioId: string; name: string; file: string; icon: string; volume: number; handout: boolean; restartOnStop: boolean; on: boolean }
export interface OneshotTrack { id: string; audioId: string; name: string; file: string; icon: string; volume: number; handout: boolean }
export interface LocationAudio { background: BackgroundTrack[]; oneshot: OneshotTrack[] }
export type AudioKind = 'background' | 'oneshot';
export interface MapData {
  file: string | null; type: string; scale: number; flip180: boolean; rotate90: boolean;
  grid: Grid; compass?: Compass;
  audio: LocationAudio;
  polygons: Polygon[]; shaders: ShaderDeco[];
}
export interface ImageItem { id: string; name: string; file: string | null; url?: string; proxy?: boolean; caption?: string; telegramDestination?: string | null }
export interface Location {
  id: string; name: string; map: MapData; images: ImageItem[]; archived: boolean; isDefault?: boolean;
  handoutDefaultId?: string | null;
}
export interface HandoutLibraryItem { id: string; name: string; file: string }
export interface VttState {
  locations: Location[]; activeLocationId: string | null;
  handout?: { defaultId: string | null };
  handoutLibrary?: HandoutLibraryItem[];
  audioLibrary?: AudioLibraryItem[];
}
