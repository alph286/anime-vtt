import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { MediaPreview } from '@/components/MediaPreview';
import { useEditorStore } from '@/store/editor-store';
import type { Location } from '@/types';
import { HandoutLibraryDialog, type HandoutTarget } from './HandoutLibraryDialog';

// In testa alla scheda Media: il default di /handout per questa location e
// quello globale (vale per le location senza un default proprio).
export function HandoutDefaultBox({ location }: { location: Location }) {
  const library = useEditorStore((s) => s.server?.handoutLibrary);
  const globalId = useEditorStore((s) => s.server?.handout?.defaultId ?? null);
  const [target, setTarget] = useState<HandoutTarget | null>(null);
  const find = (id: string | null | undefined) => (id ? library?.find((i) => i.id === id) ?? null : null);

  const rows: { title: string; hint?: string; id: string | null | undefined; target: HandoutTarget }[] = [
    { title: 'Questa location', hint: 'Se vuoto vale il globale', id: location.handoutDefaultId, target: { locationId: location.id, label: location.name } },
    { title: 'Globale', id: globalId, target: { locationId: null, label: 'tutte le location senza default' } },
  ];

  return (
    <div className="flex flex-col gap-2 rounded-md border p-2">
      <span className="text-sm font-medium">Handout di default</span>
      {rows.map((row) => {
        const item = find(row.id);
        return (
          <div key={row.title} className="flex items-center gap-2">
            {item
              ? <MediaPreview dir="handout" file={item.file} name={item.name} className="size-10 shrink-0 rounded object-cover" />
              : <span className="size-10 shrink-0 rounded bg-muted" />}
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-xs text-muted-foreground">{row.title}</span>
              <span className="truncate text-sm">{item ? item.name || 'senza nome' : 'Nessuno'}</span>
              {row.hint && !item && <span className="text-xs text-muted-foreground">{row.hint}</span>}
            </div>
            <Button size="sm" variant="secondary" onClick={() => setTarget(row.target)}>Scegli…</Button>
          </div>
        );
      })}
      {target && <HandoutLibraryDialog open onOpenChange={(o) => { if (!o) setTarget(null); }} target={target} />}
    </div>
  );
}
