import { useLayoutEffect, useRef } from 'react';
import { socket } from '@/lib/socket';
import { cn } from '@/lib/utils';
import { nextCycleColor, nudgePayload, resizePayload, rotatePayload } from '../lib/aoe-ops';
import { loadNudgePos, saveNudgePos } from '../lib/prefs';
import { selectPreviewLocation, selectSelectedAoe, useControlStore } from '../store/control-store';
import { MoveIcon } from './icons';

const cell = 'flex size-11 items-center justify-center rounded-lg border border-border bg-card p-0 text-[15px] text-foreground disabled:opacity-40';

// Pad flottante (position:fixed, in basso a destra di default): ruota, sposta,
// cambia colore/taglia/larghezza e lancia l'area selezionata. Compare solo in
// modalita aoe con un'area selezionata. La cella "trascina" lo sposta dove
// serve; la posizione si ricorda su questo dispositivo (localStorage).
export function AoeNudgePad() {
  const mode = useControlStore((s) => s.mode);
  const aoe = useControlStore(selectSelectedAoe);
  const location = useControlStore(selectPreviewLocation);
  const visible = mode === 'aoe' && Boolean(aoe);
  const padRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);
  // Ultima posizione nota (in memoria): il div si smonta quando il pad si
  // nasconde, quindi va riapplicata a ogni comparsa. undefined = non ancora
  // letta da localStorage; null = nessuna posizione (default CSS).
  const lastPos = useRef<{ left: number; top: number } | null | undefined>(undefined);

  // Spostamento imperativo (niente stato React a ogni pointermove): la
  // posizione e sempre clampata nel viewport e diventa esplicita (left/top).
  const place = (left: number, top: number) => {
    const el = padRef.current;
    if (!el) return;
    const w = el.offsetWidth || 160;
    const h = el.offsetHeight || 210;
    const x = Math.min(Math.max(0, window.innerWidth - w), Math.max(0, left));
    const y = Math.min(Math.max(0, window.innerHeight - h), Math.max(0, top));
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    lastPos.current = { left: x, top: y };
  };

  // A ogni comparsa del div si riapplica l'ultima posizione nota (all'inizio
  // quella salvata): mai durante un trascinamento, perche l'effetto scatta
  // solo al cambio di `visible`.
  useLayoutEffect(() => {
    if (!visible) return;
    if (lastPos.current === undefined) lastPos.current = loadNudgePos();
    const p = lastPos.current;
    if (p) place(p.left, p.top);
  }, [visible]);

  if (!visible || !aoe) return null;

  const grid = location?.map.grid;
  const gridEnabled = Boolean(grid && grid.enabled);
  const rotatable = aoe.shape === 'cone' || aoe.shape === 'line';
  const isLine = aoe.shape === 'line';

  // Ogni azione rilegge lo store al momento del click (niente closure obsolete).
  const current = () => {
    const s = useControlStore.getState();
    const a = selectSelectedAoe(s);
    const loc = selectPreviewLocation(s);
    return a && loc ? { s, a, loc } : null;
  };
  const emit = (ev: string, payload: Record<string, unknown>) =>
    socket.emit(ev, { locationId: useControlStore.getState().previewLocationId, ...payload });

  const rotate = (delta: number) => {
    const c = current();
    if (!c) return;
    emit('aoe:rotate', rotatePayload(c.a, delta, c.loc.map.grid, c.s.geometry.naturalW, c.s.geometry.naturalH));
  };
  const nudge = (dx: number, dy: number) => {
    const c = current();
    if (!c) return;
    const p = nudgePayload(c.a, dx, dy, c.loc, c.s.geometry.naturalW, c.s.geometry.naturalH);
    if (p) emit('aoe:move', p);
  };
  const resize = (dSize: number, dWidth: number) => {
    const c = current();
    if (!c) return;
    emit('aoe:resize', resizePayload(c.a, dSize, dWidth, c.loc.map.grid, c.s.geometry.naturalW, c.s.geometry.naturalH));
  };
  const cycleColor = () => {
    const c = current();
    if (c) emit('aoe:setColor', { aoeId: c.a.id, color: nextCycleColor(c.a.color) });
  };
  const toggleCast = () => {
    const c = current();
    if (c) emit('aoe:setCast', { aoeId: c.a.id, cast: !c.a.cast });
  };

  const onDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    const el = padRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    dragRef.current = { pointerId: e.pointerId, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* puntatore non attivo: il drag funziona comunque */ }
    // Anche un semplice tap fissa il pad dov'e ora, invece di lasciarlo
    // agganciato all'angolo in modo invisibile.
    place(rect.left, rect.top);
  };
  const onMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    place(e.clientX - d.offsetX, e.clientY - d.offsetY);
  };
  const onEnd = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    const el = padRef.current;
    if (!d || e.pointerId !== d.pointerId || !el) return;
    dragRef.current = null;
    saveNudgePos({ left: el.offsetLeft, top: el.offsetTop });
  };

  return (
    <div
      ref={padRef}
      id="aoe-nudge-overlay"
      data-testid="aoe-nudge-overlay"
      className="aoe-nudge-overlay fixed right-3 bottom-[calc(76px+env(safe-area-inset-bottom))] z-40 grid grid-cols-[repeat(3,44px)] grid-rows-[repeat(4,44px)_36px] gap-1.5 rounded-xl border border-border bg-[rgba(31,35,43,0.55)] p-2"
    >
      <button type="button" className={cell} title="Ruota in senso antiorario" disabled={!rotatable} onClick={() => rotate(-15)}>↺</button>
      <button type="button" className={cell} title="Sposta su di una cella" disabled={!gridEnabled} onClick={() => nudge(0, -1)}>▲</button>
      <button type="button" className={cell} title="Ruota in senso orario" disabled={!rotatable} onClick={() => rotate(15)}>↻</button>
      <button type="button" className={cell} title="Sposta a sinistra di una cella" disabled={!gridEnabled} onClick={() => nudge(-1, 0)}>◀</button>
      <button
        type="button"
        className={cell}
        title="Cambia colore"
        style={{ background: aoeColorHex(aoe.color) }}
        onClick={cycleColor}
      />
      <button type="button" className={cell} title="Sposta a destra di una cella" disabled={!gridEnabled} onClick={() => nudge(1, 0)}>▶</button>
      <button type="button" className={cell} title="Aumenta taglia" onClick={() => resize(AOE_METERS_PER_CELL, 0)}>+</button>
      <button type="button" className={cell} title="Sposta giù di una cella" disabled={!gridEnabled} onClick={() => nudge(0, 1)}>▼</button>
      <button type="button" className={cell} title="Riduci taglia" onClick={() => resize(-AOE_METERS_PER_CELL, 0)}>−</button>
      <button type="button" className={cell} title="Aumenta larghezza" disabled={!isLine} onClick={() => resize(0, AOE_METERS_PER_CELL)}>+</button>
      <button
        type="button"
        className={cn(cell, 'cursor-grab touch-none border-[var(--vtt-accent)] bg-[var(--vtt-accent)]/15 text-[var(--vtt-accent)] active:cursor-grabbing')}
        title="Trascina per spostare il pannello"
        aria-label="Trascina per spostare il pannello"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onEnd}
        onPointerCancel={onEnd}
      >
        <MoveIcon />
      </button>
      <button type="button" className={cell} title="Riduci larghezza" disabled={!isLine} onClick={() => resize(0, -AOE_METERS_PER_CELL)}>−</button>
      <button
        type="button"
        title={aoe.cast ? 'Interrompi incantesimo' : 'Lancia incantesimo'}
        className={cn(
          'col-span-full h-9 rounded-lg border font-bold tracking-wider',
          aoe.cast
            ? 'active border-border bg-card text-muted-foreground'
            : 'border-[var(--danger)] bg-[var(--danger)] text-white',
        )}
        onClick={toggleCast}
      >
        {aoe.cast ? 'UN-FIRE' : 'FIRE'}
      </button>
    </div>
  );
}
