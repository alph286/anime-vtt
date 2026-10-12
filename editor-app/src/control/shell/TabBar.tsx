import { CloudFog, Image, Map } from 'lucide-react';
import type { ComponentType } from 'react';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { selectIsPreviewing, useControlStore, type TabId } from '../store/control-store';

const TABS: { id: TabId; label: string; Icon: ComponentType<{ className?: string }> }[] = [
  { id: 'mappa', label: 'Mappa', Icon: Map },
  { id: 'fog', label: 'Fog', Icon: CloudFog },
  { id: 'immagini', label: 'Immagini', Icon: Image },
];

export function TabBar() {
  const previewing = useControlStore(selectIsPreviewing);
  return (
    <TabsList
      variant="line"
      aria-label="Sezioni"
      className="h-auto w-full shrink-0 gap-0 rounded-none border-t bg-card p-0 pb-[env(safe-area-inset-bottom)] min-[700px]:justify-center min-[700px]:gap-2 min-[700px]:rounded-b-xl"
    >
      {TABS.map(({ id, label, Icon }) => (
        <TabsTrigger
          key={id}
          value={id}
          // Le immagini si mostrano solo sulla location attiva.
          disabled={id === 'immagini' && previewing}
          className={
            // Su schermi larghi le schede non si stirano ai due estremi: restano vicine, centrate.
            'h-auto min-h-[60px] flex-col gap-1 rounded-none px-1 pt-2 pb-1.5 min-[700px]:w-32 min-[700px]:flex-none text-[11px] font-semibold tracking-[0.02em] text-muted-foreground ' +
            // dark:...text-primary serve: il trigger shadcn ha
            // dark:data-[state=active]:text-foreground, piu specifico.
            // L'originale non ha la sottolineatura della variante "line".
            'after:hidden data-[state=active]:text-primary dark:data-[state=active]:text-primary data-[state=active]:bg-transparent dark:data-[state=active]:bg-transparent dark:data-[state=active]:border-transparent ' +
            'active:bg-[var(--accent-bg-subtle)] disabled:opacity-35 ' +
            // Su schermi larghi la Mappa e sempre visibile: niente scheda.
            (id === 'mappa' ? 'min-[700px]:hidden' : '')
          }
        >
          <Icon className="size-5" />
          <span>{label}</span>
        </TabsTrigger>
      ))}
    </TabsList>
  );
}
