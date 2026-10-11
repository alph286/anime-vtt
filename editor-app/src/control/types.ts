import type { Location, MapData, VttState } from '../types';

export type AoeShape = 'cone' | 'cube' | 'sphere' | 'line';

export interface Aoe {
  id: string;
  shape: AoeShape;
  color: string;
  x: number; // percentuale della larghezza naturale della mappa
  y: number; // percentuale dell'altezza naturale della mappa
  sizeM: number;
  widthM?: number;
  rotation: number;
  cast?: boolean;
  shaderOverride: string | null;
  shapeVisible?: boolean;
}

export interface LiveView { scale: number; offsetX: number; offsetY: number }
export interface DisplayViewport { width: number; height: number }

export interface ControlMapData extends MapData {
  liveView?: LiveView;
  aoes: Aoe[];
}
export interface ControlLocation extends Omit<Location, 'map'> { map: ControlMapData }

// Valori impostati da server/index.js e server/state.js.
export type AudioPlayState = 'playing' | 'paused' | 'stopped';

export interface ControlState extends Omit<VttState, 'locations'> {
  locations: ControlLocation[];
  activeImageId: string | null;
  activeAudioTrack: 'main' | 'special' | null;
  audioState: AudioPlayState | null;
  displayViewport: DisplayViewport | null;
}
