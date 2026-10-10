import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { parseClamped } from '@/lib/numbers';

interface Props {
  value: number;
  min: number;
  max: number;
  step?: number;
  live?: boolean;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
  onCommit: (value: number) => void;
}

export function NumberField({ value, min, max, step, live, disabled, className, onCommit, ...rest }: Props) {
  const [text, setText] = useState(String(value));
  const focused = useRef(false);
  const dirty = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(String(value));
  }, [value]);

  return (
    <Input
      type="number"
      className={className}
      aria-label={rest['aria-label']}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      value={text}
      onFocus={() => { focused.current = true; dirty.current = false; }}
      onChange={(e) => {
        setText(e.target.value);
        dirty.current = true;
        if (live) {
          const v = parseClamped(e.target.value, min, max);
          if (v !== null) onCommit(v);
        }
      }}
      onBlur={() => {
        focused.current = false;
        if (!dirty.current) return;
        dirty.current = false;
        const v = parseClamped(text, min, max);
        if (v === null) { setText(String(value)); return; }
        setText(String(v));
        onCommit(v);
      }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
    />
  );
}
