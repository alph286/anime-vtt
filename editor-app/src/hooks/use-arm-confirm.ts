import { useCallback, useEffect, useRef, useState } from 'react';

export function useArmConfirm(timeoutMs = 2500) {
  const [armedKey, setArmedKey] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const disarm = useCallback(() => {
    clearTimeout(timer.current);
    setArmedKey(null);
  }, []);

  const press = useCallback(
    (key: string, onConfirm: () => void) => {
      if (armedKey !== key) {
        setArmedKey(key);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setArmedKey(null), timeoutMs);
        return;
      }
      disarm();
      onConfirm();
    },
    [armedKey, timeoutMs, disarm]
  );

  useEffect(() => () => clearTimeout(timer.current), []);

  return { armedKey, isArmed: (key: string) => armedKey === key, press, disarm };
}
