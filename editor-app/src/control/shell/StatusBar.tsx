import { cn } from '@/lib/utils';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useControlStore } from '../store/control-store';

// Pallino wifi: tenue se socket e display sono entrambi connessi, rosso altrimenti.
function WifiDot() {
  const ok = useControlStore((s) => s.socketConnected && s.displayConnected);
  return (
    <div
      data-testid="wifi-dot"
      title={ok ? 'Connesso' : 'Display o server non connesso'}
      className={cn(
        'flex size-[30px] shrink-0 items-center justify-center rounded-full transition-[background-color,opacity] duration-300',
        ok ? 'ok bg-transparent opacity-35' : 'bad bg-[var(--danger-bg)] opacity-100 ring-1 ring-[var(--danger-border)]',
      )}
    >
      <svg
        viewBox="0 0 24 24"
        className={cn('size-4', ok ? 'fill-muted-foreground' : 'fill-[var(--danger-text)]')}
      >
        <path d="M12 20a1.6 1.6 0 1 0 0-3.2A1.6 1.6 0 0 0 12 20Zm-6.4-6.2a9 9 0 0 1 12.8 0l-2 2a6.2 6.2 0 0 0-8.8 0l-2-2Zm-3.8-4a14 14 0 0 1 20.4 0l-2 2a11.2 11.2 0 0 0-16.4 0l-2-2Z" />
      </svg>
    </div>
  );
}

export function StatusBar() {
  const locations = useControlStore((s) => s.server?.locations);
  const previewLocationId = useControlStore((s) => s.previewLocationId);
  const setPreviewLocation = useControlStore((s) => s.setPreviewLocation);
  const visible = (locations ?? []).filter((l) => !l.archived);

  return (
    <header
      className="flex shrink-0 items-center gap-3 border-b bg-card px-3.5 py-3 pt-[max(12px,env(safe-area-inset-top))] min-[700px]:rounded-t-xl min-[700px]:border-b-0"
    >
      <WifiDot />
      <Select value={previewLocationId ?? ''} onValueChange={(id) => id && setPreviewLocation(id)}>
        <SelectTrigger
          aria-label="Location"
          className="h-11 min-w-0 flex-1 font-semibold data-[size=default]:h-11"
        >
          <SelectValue placeholder="— nessuna location —" />
        </SelectTrigger>
        <SelectContent>
          {visible.map((l) => (
            <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </header>
  );
}
