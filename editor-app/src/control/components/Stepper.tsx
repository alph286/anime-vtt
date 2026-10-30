import { Button } from '@/components/ui/button';

interface StepperProps {
  label?: string;
  value: string;
  onDec: () => void;
  onInc: () => void;
  decTitle: string;
  incTitle: string;
  vertical?: boolean; // colonna stretta: + / valore / −
}

// Controllo `[−] valore [+]` (le `.zoom` di index.html); con `label` diventa
// una riga `.opacity-row` (etichetta a sinistra, stepper a destra).
export function Stepper({ label, value, onDec, onInc, decTitle, incTitle, vertical }: StepperProps) {
  const size = vertical ? 'size-8' : 'size-10';
  const decBtn = <Button type="button" variant="outline" size="icon" className={size} title={decTitle} aria-label={decTitle} onClick={onDec}>−</Button>;
  const incBtn = <Button type="button" variant="outline" size="icon" className={size} title={incTitle} aria-label={incTitle} onClick={onInc}>+</Button>;
  const control = (
    <div className={vertical ? 'flex flex-col items-center gap-1' : 'flex items-center gap-1.5'}>
      {vertical ? incBtn : decBtn}
      <span className={vertical ? 'text-center text-xs tabular-nums' : 'min-w-12 text-center text-sm tabular-nums'}>{value}</span>
      {vertical ? decBtn : incBtn}
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
