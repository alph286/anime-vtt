import { useEffect, useRef, useState } from 'react';
import { clamp } from '@/lib/numbers';
import { socket } from '@/lib/socket';
import { selectActiveLocation, useEditorStore } from '@/store/editor-store';
import { cn } from '@/lib/utils';
import { stageRefs } from './stage-refs';
import type { Point } from '@/types';

export function CompassHandle() {
  const location = useEditorStore(selectActiveLocation);
  const compass = location?.map.compass;
  const [dragPos, setDragPos] = useState<Point | null>(null);
  const latest = useRef<Point | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanupRef.current?.(), []);
  if (!location || !compass) return null;

  const x = dragPos?.[0] ?? compass.x;
  const y = dragPos?.[1] ?? compass.y;

  const toPercent = (clientX: number, clientY: number): Point => {
    const rect = stageRefs.wrap!.getBoundingClientRect();
    return [
      clamp(((clientX - rect.left) / rect.width) * 100, 0, 100),
      clamp(((clientY - rect.top) / rect.height) * 100, 0, 100),
    ];
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    cleanupRef.current?.();
    const locationId = location.id;
    const move = (ev: PointerEvent) => {
      const p = toPercent(ev.clientX, ev.clientY);
      latest.current = p;
      setDragPos(p);
    };
    const cleanup = () => {
      cleanupRef.current = null;
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', cancel);
    };
    const up = () => {
      cleanup();
      if (latest.current) socket.emit('compass:update', { locationId, x: latest.current[0], y: latest.current[1] });
      latest.current = null;
      setDragPos(null);
    };
    const cancel = () => { cleanup(); latest.current = null; setDragPos(null); };
    cleanupRef.current = cleanup;
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', cancel);
  };

  return (
    <button
      type="button"
      className={cn('compass-drag', !compass.visible && 'off')}
      title="Trascina per posizionare la rosa dei venti"
      style={{ left: `${x}%`, top: `${y}%`, transform: `translate(-50%, -50%) rotate(${compass.rotation}deg)` }}
      onPointerDown={onPointerDown}
    >
      <svg viewBox="0 0 120 120">
        <path className="compass-drag-star" d="M60,12 L74,46 L108,60 L74,74 L60,108 L46,74 L12,60 L46,46 Z" />
        <circle className="compass-drag-hub" cx="60" cy="60" r="7" />
        <text x="60" y="10" textAnchor="middle">N</text>
        <text x="60" y="118" textAnchor="middle">S</text>
        <text x="114" y="64" textAnchor="middle">E</text>
        <text x="6" y="64" textAnchor="middle">O</text>
      </svg>
    </button>
  );
}
