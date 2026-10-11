import type { ReactNode } from 'react';

// Contenitore comune dei box sotto la mappa (.control-section).
export function Box({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export const round1 = (x: number) => Math.round(x * 10) / 10;
export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
