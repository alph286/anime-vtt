import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { moveId } from '@/lib/sortable';

export function useSortableList(ids: string[], onCommit: (orderedIds: string[]) => void) {
  const [dragOrder, setDragOrder] = useState<string[] | null>(null);
  const orderRef = useRef<string[] | null>(null);
  const active = useRef<{ pointerId: number; id: string } | null>(null);
  const rows = useRef(new Map<string, HTMLElement>());
  const idsRef = useRef(ids);
  idsRef.current = ids;
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;
  const teardown = useRef<(() => void) | null>(null);

  const rowRef = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      if (el) rows.current.set(id, el);
      else rows.current.delete(id);
    },
    []
  );

  // Gli ascoltatori stanno su window, non sulla maniglia: riordinando il DOM React sposta
  // il nodo trascinato e il browser rilascia la pointer capture, perdendo il pointerup.
  useEffect(() => () => teardown.current?.(), []);

  const handleProps = (id: string) => ({
    style: { touchAction: 'none' as const },
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (active.current) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const pointerId = e.pointerId;
      active.current = { pointerId, id };
      orderRef.current = idsRef.current;
      setDragOrder(idsRef.current);

      const onMove = (ev: PointerEvent) => {
        const a = active.current;
        if (!a || ev.pointerId !== a.pointerId) return;
        const current = orderRef.current ?? idsRef.current;
        const over = current.find((other) => {
          if (other === a.id) return false;
          const r = rows.current.get(other)?.getBoundingClientRect();
          return Boolean(r && ev.clientY >= r.top && ev.clientY <= r.bottom);
        });
        if (!over) return;
        const r = rows.current.get(over)!.getBoundingClientRect();
        const next = moveId(current, a.id, over, ev.clientY < r.top + r.height / 2);
        orderRef.current = next;
        setDragOrder(next);
      };
      const cleanup = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onEnd);
        window.removeEventListener('pointercancel', onEnd);
        teardown.current = null;
      };
      const onEnd = (ev: PointerEvent) => {
        const a = active.current;
        if (!a || ev.pointerId !== a.pointerId) return;
        const finalOrder = orderRef.current ?? idsRef.current;
        active.current = null;
        orderRef.current = null;
        cleanup();
        setDragOrder(null);
        commitRef.current(finalOrder);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onEnd);
      window.addEventListener('pointercancel', onEnd);
      teardown.current = () => {
        active.current = null;
        cleanup();
      };
    },
  });

  return { order: dragOrder ?? ids, isDragging: dragOrder !== null, rowRef, handleProps };
}
