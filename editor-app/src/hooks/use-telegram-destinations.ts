import { useEffect, useState } from 'react';

export interface TelegramDestination { name: string }

export function useTelegramDestinations(): TelegramDestination[] | null {
  const [list, setList] = useState<TelegramDestination[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/telegram/destinations')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: TelegramDestination[]) => { if (!cancelled) setList(data); })
      .catch(() => { if (!cancelled) setList([]); });
    return () => { cancelled = true; };
  }, []);
  return list;
}
