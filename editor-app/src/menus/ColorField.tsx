import { useEffect, useRef } from 'react';

interface Props { value: string; disabled?: boolean; onLive: (v: string) => void; onCommit: (v: string) => void }

export function ColorField({ value, disabled, onLive, onCommit }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = () => commitRef.current(el.value);
    el.addEventListener('change', handler);
    return () => el.removeEventListener('change', handler);
  }, []);

  return (
    <input
      ref={ref}
      type="color"
      aria-label="Colore griglia"
      className="h-8 w-12 cursor-pointer rounded border border-input bg-secondary p-0.5"
      disabled={disabled}
      value={value}
      onChange={(e) => onLive(e.target.value)}
    />
  );
}
