import { cn } from '@/lib/utils';
import { AoeNudgePad } from '../control/aoe/AoeNudgePad';
import { AoePanel } from '../control/aoe/AoePanel';
import { selectPreviewLocation, useControlStore } from '../control/store/control-store';
import PartyMap from './PartyMap';
import { PARTY_NUDGE_POS_KEY, usePartySocket } from './use-party-socket';

// Pallino wifi: solo il socket (a /party non interessa se c'è un display).
function WifiDot() {
  const ok = useControlStore((s) => s.socketConnected);
  return (
    <div
      data-testid="wifi-dot"
      title={ok ? 'Connesso' : 'Server non connesso'}
      className={cn(
        'flex size-[30px] shrink-0 items-center justify-center rounded-full transition-[background-color,opacity] duration-300',
        ok ? 'ok bg-transparent opacity-35' : 'bad bg-[var(--danger-bg)] opacity-100 ring-1 ring-[var(--danger-border)]',
      )}
    >
      <svg viewBox="0 0 24 24" className={cn('size-4', ok ? 'fill-muted-foreground' : 'fill-[var(--danger-text)]')}>
        <path d="M12 20a1.6 1.6 0 1 0 0-3.2A1.6 1.6 0 0 0 12 20Zm-6.4-6.2a9 9 0 0 1 12.8 0l-2 2a6.2 6.2 0 0 0-8.8 0l-2-2Zm-3.8-4a14 14 0 0 1 20.4 0l-2 2a11.2 11.2 0 0 0-16.4 0l-2-2Z" />
      </svg>
    </div>
  );
}

export default function PartyApp() {
  usePartySocket();
  const location = useControlStore(selectPreviewLocation);
  return (
    <div className="mx-auto flex h-dvh max-w-[720px] flex-col bg-background text-foreground">
      <header className="flex shrink-0 items-center gap-3 border-b bg-card px-3.5 py-3 pt-[max(12px,env(safe-area-inset-top))]">
        <WifiDot />
        <span className="min-w-0 flex-1 truncate font-semibold">{location?.name ?? ''}</span>
      </header>
      <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3.5 pt-4 pb-[calc(16px+env(safe-area-inset-bottom))]">
        <PartyMap />
        <AoePanel />
      </main>
      <AoeNudgePad storageKey={PARTY_NUDGE_POS_KEY} />
    </div>
  );
}
