import { Label } from '@/components/ui/label';

export function MenuField({ label, title, children }: { label: string; title?: string; children: React.ReactNode }) {
  return (
    <div
      className="flex items-center justify-between gap-4 px-2 py-1.5 text-sm"
      title={title}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <Label className="font-normal text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-1">{children}</div>
    </div>
  );
}
