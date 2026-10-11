import { Grid3x3, Image as ImageIcon, MapPin, Sparkles, Volume2, CloudFog } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useEditorStore, type SidebarTab } from '@/store/editor-store';

const TABS: { value: SidebarTab; label: string; icon: React.ReactNode }[] = [
  { value: 'location', label: 'Location', icon: <MapPin /> },
  { value: 'immagini', label: 'Immagini', icon: <ImageIcon /> },
  { value: 'fog', label: 'Fog of war', icon: <CloudFog /> },
  { value: 'shader', label: 'Shader', icon: <Sparkles /> },
  { value: 'audio', label: 'Audio', icon: <Volume2 /> },
  { value: 'grid', label: 'Fine tuning griglia', icon: <Grid3x3 /> },
];

export function Sidebar({ panels }: { panels: Partial<Record<SidebarTab, React.ReactNode>> }) {
  const tab = useEditorStore((s) => s.sidebarTab);
  const setSidebarTab = useEditorStore((s) => s.setSidebarTab);
  return (
    <aside className="flex min-h-0 w-[380px] shrink-0 flex-col border-l bg-card">
      <Tabs value={tab} onValueChange={(v) => setSidebarTab(v as SidebarTab)} className="min-h-0 flex-1">
        <TabsList className="m-3 grid grid-cols-6">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} title={t.label} aria-label={t.label}>{t.icon}</TabsTrigger>
          ))}
        </TabsList>
        {TABS.map((t) => (
          <TabsContent key={t.value} value={t.value} forceMount className="min-h-0 overflow-y-auto px-3 pb-3 data-[state=inactive]:hidden">
            <h2 className="mb-3 text-base font-semibold">{t.label}</h2>
            {panels[t.value] ?? <p className="text-sm text-muted-foreground">In arrivo.</p>}
          </TabsContent>
        ))}
      </Tabs>
    </aside>
  );
}
