import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';

interface Props {
  id?: string;
  value: string;
  onCommit: (value: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}

export function CommitInput({ id, value, onCommit, className, placeholder, disabled }: Props) {
  const [text, setText] = useState(value);
  const focused = useRef(false);
  const dirty = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(value);
  }, [value]);

  return (
    <Input
      id={id}
      className={className}
      placeholder={placeholder}
      disabled={disabled}
      value={text}
      onFocus={() => { focused.current = true; dirty.current = false; }}
      onChange={(e) => { dirty.current = true; setText(e.target.value); }}
      onBlur={() => {
        focused.current = false;
        if (!dirty.current) { setText(value); return; }
        dirty.current = false;
        if (text !== value) onCommit(text);
      }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
    />
  );
}
