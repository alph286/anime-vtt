import { useEffect } from 'react';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { useControlSocket } from './hooks/use-control-socket';
import { selectIsPreviewing, useControlStore, type TabId } from './store/control-store';
import { Banners } from './shell/Banners';
import { StatusBar } from './shell/StatusBar';
import { TabBar } from './shell/TabBar';
import { AoeNudgePad } from './aoe/AoeNudgePad';
import MapTab from './map/MapTab';
import FogTab from './tabs/FogTab';
import ImagesTab from './tabs/ImagesTab';

// Pannello: colonna a tutta altezza. Sotto 700px una scheda alla volta; da
// 700px in su la Mappa resta sempre visibile e accanto compare Fog (di
// default) oppure Immagini, come nel pannello originale.
const panel = 'flex-col gap-4 data-[state=inactive]:hidden data-[state=active]:flex';

export default function ControlApp() {
  useControlSocket();
  const tab = useControlStore((s) => s.tab);
  const setTab = useControlStore((s) => s.setTab);
  const previewing = useControlStore(selectIsPreviewing);

  // In anteprima la scheda Immagini e disabilitata: se era aperta, torna alla Mappa.
  useEffect(() => {
    if (previewing && tab === 'immagini') setTab('mappa');
  }, [previewing, tab, setTab]);

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => setTab(v as TabId)}
      data-tab={tab}
      className="group/shell mx-auto h-dvh max-w-[1100px] gap-0 bg-background text-foreground min-[700px]:h-auto min-[700px]:min-h-dvh min-[700px]:p-5"
    >
      <StatusBar />
      <Banners />
      <div
        className="min-h-0 flex-1 overflow-y-auto px-3.5 pt-4 pb-[calc(16px+env(safe-area-inset-bottom))] min-[700px]:mt-4 min-[700px]:grid min-[700px]:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)] min-[700px]:items-start min-[700px]:gap-5 min-[700px]:overflow-visible min-[700px]:p-0"
      >
        <TabsContent forceMount value="mappa" className={`${panel} min-[700px]:data-[state=inactive]:flex`}>
          <MapTab />
        </TabsContent>
        <TabsContent
          forceMount
          value="fog"
          className={`${panel} min-[700px]:group-data-[tab=mappa]/shell:data-[state=inactive]:flex`}
        >
          <FogTab />
        </TabsContent>
        <TabsContent forceMount value="immagini" className={panel}>
          <ImagesTab />
        </TabsContent>
      </div>
      <TabBar />
      <AoeNudgePad />
    </Tabs>
  );
}
