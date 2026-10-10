import { useCallback, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { moveId } from '@/lib/sortable';

export function useSortableList(ids: string[], onCommit: (orderedIds: string[]) => void) {
  const [dragOrder, setDragOrder] = useState<string[] | null>(null);
  const orderRef = useRef<string[] | null>(null);
  const active = useRef<{ pointerId: number; id: string } | null>(null);
  const rows = useRef(new Map<string, HTMLElement>());

  const rowRef = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      if (el) rows.current.set(id, el);
      else rows.current.delete(id);
    },
    []
  );

  const end = (e: ReactPointerEvent<HTMLElement>) => {
    const a = active.current;
    if (!a || e.pointerId !== a.pointerId) return;
    const finalOrder = orderRef.current ?? ids;
    active.current = null;
    orderRef.current = null;
    setDragOrder(null);
    onCommit(finalOrder);
  };

  const handleProps = (id: string) => ({
    style: { touchAction: 'none' as const },
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (active.current) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      active.current = { pointerId: e.pointerId, id };
      orderRef.current = ids;
      setDragOrder(ids);
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      const a = active.current;
      if (!a || e.pointerId !== a.pointerId) return;
      const current = orderRef.current ?? ids;
      const over = current.find((other) => {
        if (other === a.id) return false;
        const r = rows.current.get(other)?.getBoundingClientRect();
        return Boolean(r && e.clientY >= r.top && e.clientY <= r.bottom);
      });
      if (!over) return;
      const r = rows.current.get(over)!.getBoundingClientRect();
      const next = moveId(current, a.id, over, e.clientY < r.top + r.height / 2);
      orderRef.current = next;
      setDragOrder(next);
    },
    onPointerUp: end,
    onPointerCancel: end,
  });

  return { order: dragOrder ?? ids, isDragging: dragOrder !== null, rowRef, handleProps };
}
