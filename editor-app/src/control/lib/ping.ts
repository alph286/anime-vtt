// Ping del DM (modalita "ping", tap o trascinamento): porting della logica
// di accumulo/sfumatura di public/control/control.js. I punti arrivano
// SOLO dall'eco `ping:show` del server (anche quelli propri), vivono
// PING_LIFESPAN_SEC e vengono raggruppati per gesto prima di andare allo
// shader (PingLayer in shared/shader-effects.js).

export const PING_LIFESPAN_SEC = 1.2;

// Distanza minima (in % dello spazio base della mappa) tra due punti emessi
// durante un trascinamento: sotto questa soglia non si emette, per non
// floodare il socket.
export const PING_MIN_POINT_DIST_PCT = 1.5;

export interface BufferedPingPoint {
  x: number;
  y: number;
  t: number; // performance.now() all'arrivo
  strokeId?: string;
}

// Un id per gesto, non per punto: lo stesso per tutti i punti di un singolo
// pointerdown→pointerup/cancel, diverso dal gesto successivo. Il server lo
// rilancia senza toccarlo; senza, due tap ravvicinati verrebbero disegnati
// come un solo trascinamento che li collega.
export function newPingStrokeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export class PingBuffer {
  private points: BufferedPingPoint[] = [];

  push(pt: BufferedPingPoint): void {
    this.points.push(pt);
  }

  // Scarta i punti con eta >= PING_LIFESPAN_SEC e restituisce i vivi.
  prune(nowMs: number): BufferedPingPoint[] {
    this.points = this.points.filter((pt) => (nowMs - pt.t) / 1000 < PING_LIFESPAN_SEC);
    return this.points;
  }

  clear(): void {
    this.points = [];
  }

  get size(): number {
    return this.points.length;
  }

  // Punti vivi raggruppati per strokeId (groupPingPointsByStroke, globale di
  // shader-effects.js), con l'eta in secondi che si aspetta PingLayer.render.
  toGroups(nowMs: number): PingPoint[][] {
    const live = this.prune(nowMs);
    if (!live.length) return [];
    return groupPingPointsByStroke(
      live.map((pt) => ({ x: pt.x, y: pt.y, t: pt.t, age: (nowMs - pt.t) / 1000, strokeId: pt.strokeId })),
    );
  }
}

// Unico buffer del pannello: lo riempie il listener socket, lo consuma il
// loop di rendering.
export const pingBuffer = new PingBuffer();
