import { useEffect } from 'react';
import { PING_LIFESPAN_SEC, pingBuffer } from '../lib/ping';
import { mapRefs } from '../map/map-refs';
import { selectPreviewLocation, selectShowingImage, useControlStore } from '../store/control-store';

// Loop di rendering condiviso dei tre canvas WebGL dell'anteprima: Portale
// (ShaderLayer), shader AOE lanciati (AoeShaderLayer) e ping (PingLayer).
// Porting di stepShaderLayer/kickShaderLoop di public/control/control.js:
// un solo requestAnimationFrame, che gira SOLO finche c'e qualcosa da
// disegnare (decorazioni shader, AOE con `cast`, ping vivi) -- su target
// come il Raspberry Pi 4 un clear+composite a 60fps a vuoto e spreco puro.

interface Layers {
  shader: ShaderLayer | null;
  aoe: AoeShaderLayer | null;
  ping: PingLayer | null;
}

// Stato di modulo: un solo pannello montato alla volta. `kick` e `layers`
// valgono null quando MapPreview non e montato (kickShaderLoop/clearPing
// diventano no-op).
let layers: Layers | null = null;
let kick: (() => void) | null = null;

// Riavvia il loop se si era fermato e c'e di nuovo qualcosa da disegnare
// (es. arriva un ping dall'eco del server).
export function kickShaderLoop(): void {
  kick?.();
}

// Un ping punta a una mappa precisa: al cambio di location in anteprima o
// quando compare un'immagine al posto della mappa non ha piu senso a
// schermo (control.js, render()).
export function clearPing(): void {
  if (!pingBuffer.size) return;
  pingBuffer.clear();
  const s = useControlStore.getState();
  layers?.ping?.render([], PING_LIFESPAN_SEC, s.localZoom.scale);
}

// Costruzione difensiva: senza WebGL2 i layer hanno `available` false e
// render() e un no-op, ma in ambienti senza shader-effects.js (test) la
// classe stessa non esiste, e un costruttore che lancia non deve rompere
// il pannello.
function makeLayer<T extends { available?: boolean }>(make: () => T): T | null {
  try {
    const layer = make();
    return layer.available === false ? null : layer;
  } catch {
    return null;
  }
}

// render() esce senza pulire se non c'e una mappa con dimensioni valide:
// senza questo il canvas terrebbe i pixel dell'ultima location (stesso bug
// dei "pixel fantasma" gia risolto nel loop dell'editor).
function clearCanvas(canvas: HTMLCanvasElement | null) {
  const gl = canvas?.getContext('webgl2');
  if (gl) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }
}

type ControlStoreState = ReturnType<typeof useControlStore.getState>;

function drawableContent(s: ControlStoreState) {
  const loc = selectPreviewLocation(s);
  const hasMap = Boolean(loc?.map.file) && s.geometry.naturalW > 0 && s.geometry.naturalH > 0;
  const shaders = hasMap ? (loc!.map.shaders ?? []) : [];
  const castAoes = hasMap ? ((loc!.map.aoes ?? []) as AoeLike[]).filter((a) => a.cast) : [];
  return { loc, shaders, castAoes };
}

export function useShaderLoop(): void {
  useEffect(() => {
    const fit = mapRefs.fitBox;
    if (!fit) return;
    const shaderCanvas = fit.querySelector<HTMLCanvasElement>('#map-shader-canvas');
    const aoeCanvas = fit.querySelector<HTMLCanvasElement>('#map-aoe-shader-canvas');
    const pingCanvas = fit.querySelector<HTMLCanvasElement>('#map-ping-canvas');
    const mine: Layers = {
      shader: shaderCanvas && typeof ShaderLayer !== 'undefined' ? makeLayer(() => new ShaderLayer(shaderCanvas)) : null,
      aoe: aoeCanvas && typeof AoeShaderLayer !== 'undefined' ? makeLayer(() => new AoeShaderLayer(aoeCanvas)) : null,
      ping: pingCanvas && typeof PingLayer !== 'undefined' ? makeLayer(() => new PingLayer(pingCanvas)) : null,
    };
    layers = mine;

    let raf = 0;
    let running = false;

    const step = () => {
      const s = useControlStore.getState();
      const { loc, shaders, castAoes } = drawableContent(s);
      const { naturalW: nw, naturalH: nh } = s.geometry;

      if (mine.shader) {
        if (shaders.length && loc) mine.shader.render(shaders, loc.map.grid, nw, nh);
        else clearCanvas(shaderCanvas);
      }
      if (mine.aoe) {
        if (castAoes.length && loc) {
          mine.aoe.render(castAoes.map((a) => ({ ...a, shaderId: resolveAoeShaderId(a) })), loc.map.grid, nw, nh);
        } else {
          clearCanvas(aoeCanvas);
        }
      }
      // localZoom.scale: stesso transform CSS che avvolge il canvas del
      // ping -- senza compensarlo, lo zoom locale cambierebbe la taglia del
      // ping. Con zero gruppi render() pulisce soltanto il canvas.
      const groups = pingBuffer.toGroups(performance.now());
      mine.ping?.render(groups, PING_LIFESPAN_SEC, s.localZoom.scale);

      if (!shaders.length && !castAoes.length && !pingBuffer.size) {
        running = false;
        return;
      }
      raf = requestAnimationFrame(step);
    };

    const start = () => {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(step);
    };

    const myKick = () => {
      if (running) return;
      const { shaders, castAoes } = drawableContent(useControlStore.getState());
      if (shaders.length || castAoes.length || pingBuffer.size) start();
    };
    kick = myKick;

    // Un primo frame sempre: pulisce/disegna lo stato iniziale, poi il loop
    // si ferma da solo se non c'e nulla.
    start();

    let lastPingLocationId = selectPreviewLocation(useControlStore.getState())?.id ?? null;
    const unsubscribe = useControlStore.subscribe((s) => {
      const pingLocationId = selectPreviewLocation(s)?.id ?? null;
      if (selectShowingImage(s) || pingLocationId !== lastPingLocationId) clearPing();
      lastPingLocationId = pingLocationId;
      myKick();
    });

    return () => {
      cancelAnimationFrame(raf);
      running = false;
      unsubscribe();
      if (layers === mine) layers = null;
      if (kick === myKick) kick = null;
    };
  }, []);
}
