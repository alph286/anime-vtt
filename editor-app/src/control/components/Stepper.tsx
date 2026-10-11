import { Button } from '@/components/ui/button';

interface StepperProps {
  label?: string;
  value: string;
  onDec: () => void;
  onInc: () => void;
  decTitle: string;
  incTitle: string;
}

// Controllo `[−] valore [+]` (le `.zoom` di index.html); con `label` diventa
// una riga `.opacity-row` (etichetta a sinistra, stepper a destra).
export function Stepper({ label, value, onDec, onInc, decTitle, incTitle }: StepperProps) {
  const control = (
    <div className="flex items-center gap-1.5">
      <Button type="button" variant="outline" size="icon" className="size-10" title={decTitle} aria-label={decTitle} onClick={onDec}>−</Button>
      <span className="min-w-12 text-center text-sm tabular-nums">{value}</span>
      <Button type="button" variant="outline" size="icon" className="size-10" title={incTitle} aria-label={incTitle} onClick={onInc}>+</Button>
    </div>
  );
  if (!label) return control;
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm">{label}</span>
      {control}
    </div>
  );
}
