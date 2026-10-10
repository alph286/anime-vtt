export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function parseClamped(raw: string, min: number, max: number): number | null {
  if (raw === '') return null;
  const v = Number(raw);
  if (Number.isNaN(v)) return null;
  return clamp(v, min, max);
}
