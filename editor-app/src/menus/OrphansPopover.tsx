import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useArmConfirm } from '@/hooks/use-arm-confirm';

interface Orphan { file: string; kind: string; size: number }

const formatBytes = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : `${Math.round(bytes / 1024)}KB`;

export function OrphansPopover() {
  const [orphans, setOrphans] = useState<Orphan[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const arm = useArmConfirm();

  const scan = async () => {
    const res = await fetch('/api/storage/orphans/scan', { method: 'POST' });
    const data = await res.json();
    setOrphans(data.orphans || []);
    setMessage(null);
    arm.disarm();
  };

  const purge = async () => {
    const res = await fetch('/api/storage/orphans/purge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: (orphans ?? []).map(({ file, kind }) => ({ file, kind })) }),
    });
    const data = await res.json();
    setOrphans(null);
    setMessage(`cancellati ${data.deleted.length} file.`);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" title="Pulisci file orfani"><Trash2 /> File orfani</Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80" onInteractOutside={(e) => e.preventDefault()}>
        <Button variant="secondary" size="sm" onClick={() => void scan()}>Cerca file orfani</Button>
        <div className="mt-3 max-h-60 overflow-y-auto text-xs text-muted-foreground">
          {orphans !== null && orphans.length === 0 && 'nessun file orfano trovato.'}
          {orphans?.map((o) => (
            <div key={o.file}>{o.file} ({o.kind}, {formatBytes(o.size)})</div>
          ))}
          {message}
        </div>
        {orphans && orphans.length > 0 && (
          <Button
            className="mt-3"
            size="sm"
            variant={arm.isArmed('purge') ? 'destructive' : 'secondary'}
            onClick={() => arm.press('purge', () => void purge())}
          >
            {arm.isArmed('purge') ? 'click di nuovo per confermare' : 'conferma cancellazione'}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
