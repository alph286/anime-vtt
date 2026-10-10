import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';

interface Props {
  value: string;
  onCommit: (value: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}

export function CommitInput({ value, onCommit, className, placeholder, disabled }: Props) {
  const [text, setText] = useState(value);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(value);
  }, [value]);

  return (
    <Input
      className={className}
      placeholder={placeholder}
      disabled={disabled}
      value={text}
      onFocus={() => { focused.current = true; }}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        focused.current = false;
        if (text !== value) onCommit(text);
      }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
    />
  );
}
