import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  selectAoeAvailable, selectPingAvailable, useControlStore, type Mode,
} from '../store/control-store';

// Icone copiate dai <symbol> di public/control/index.html (i-move, i-fog,
// i-ping, i-zoom, i-aoe): stessi tracciati, stesso stile a linea dell'.icon
// originale, cosi il pannello resta riconoscibile per chi lo usa gia.
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

type ModeId = Exclude<Mode, null>;

const BUTTONS: { mode: ModeId; id: string; title: string; icon: ReactNode }[] = [
  {
    mode: 'pan', id: 'pan-mode-toggle', title: 'Sposta inquadratura trascinando',
    icon: <path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" />,
  },
  {
    mode: 'fog', id: 'fog-mode-toggle', title: 'Rivela/nascondi fog toccando la mappa',
    icon: <path d="M3 8h13M3 12h18M3 16h13" />,
  },
  {
    mode: 'ping', id: 'ping-mode-toggle', title: 'Indica un punto ai giocatori toccando la mappa',
    icon: (
      <>
        <path d="M12 21s7-7.58 7-12A7 7 0 0 0 5 9c0 4.42 7 12 7 12Z" />
        <circle cx="12" cy="9" r="2.4" />
      </>
    ),
  },
  {
    mode: 'zoom', id: 'zoom-mode-toggle', title: 'Zoom locale (solo per te, non visibile ai giocatori)',
    icon: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="M20 20l-5-5M8 10.5h5M10.5 8v5" />
      </>
    ),
  },
  {
    mode: 'aoe', id: 'aoe-mode-toggle', title: "Area d'effetto",
    icon: (
      <>
        <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
  },
];

// Le cinque modalita sono mutuamente esclusive (un tap sulla mappa ha un
// solo significato alla volta); riattivare quella gia attiva la spegne.
// Riga FUORI dalla mappa, sopra di essa: la mappa resta tutta visibile anche
// su schermi piccoli. Ping e AOE si disabilitano quando non raggiungerebbero
// i giocatori (anteprima di un'altra location, immagine mostrata).
export function ModeToggles() {
  const mode = useControlStore((s) => s.mode);
  const setMode = useControlStore((s) => s.setMode);
  const pingAvailable = useControlStore(selectPingAvailable);
  const aoeAvailable = useControlStore(selectAoeAvailable);

  return (
    <div id="map-mode-toggles" className="flex gap-2">
      {BUTTONS.map(({ mode: m, id, title, icon }) => {
        const active = mode === m;
        const disabled = (m === 'ping' && !pingAvailable) || (m === 'aoe' && !aoeAvailable);
        return (
          <Button
            key={m}
            id={id}
            type="button"
            variant="outline"
            title={title}
            aria-label={title}
            aria-pressed={active}
            disabled={disabled}
            onClick={() => setMode(m)}
            className={cn(
              'map-mode-btn h-11 flex-1 rounded-lg px-0 disabled:opacity-40',
              active && 'border-primary bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground dark:bg-primary dark:hover:bg-primary/90',
            )}
          >
            <Icon>{icon}</Icon>
          </Button>
        );
      })}
    </div>
  );
}
