import { useEffect, useState } from 'react';

export interface TelegramDestination { name: string }

export function sanitizeDestinations(data: unknown): TelegramDestination[] {
  if (!Array.isArray(data)) return [];
  return data.filter(
    (d): d is TelegramDestination => Boolean(d) && typeof d === 'object' && typeof (d as { name?: unknown }).name === 'string' && (d as { name: string }).name !== ''
  );
}

export function useTelegramDestinations(): TelegramDestination[] | null {
  const [list, setList] = useState<TelegramDestination[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/telegram/destinations')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: unknown) => { if (!cancelled) setList(sanitizeDestinations(data)); })
      .catch(() => { if (!cancelled) setList([]); });
    return () => { cancelled = true; };
  }, []);
  return list;
}
