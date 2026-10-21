import { useState } from 'react';
import { Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Aggiunge un elemento Web ai media della location: un indirizzo (internet, localhost
// o rete locale) che /display mostra a tutto schermo in un iframe.
export function AddWebDialog({ locationId }: { locationId: string }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [proxy, setProxy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/media/web', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationId, url, name, proxy }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'Impossibile aggiungere la pagina');
        return;
      }
      setUrl(''); setName(''); setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" className="w-fit"><Globe /> Aggiungi pagina web</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Aggiungi pagina web</DialogTitle>
        <DialogDescription>Un sito su internet o in locale (es. http://localhost:8080). Sui giocatori compare a tutto schermo, senza interazione.</DialogDescription>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="web-url">Indirizzo</Label>
            <Input id="web-url" placeholder="https://… oppure localhost:8080" value={url} onChange={(e) => setUrl(e.target.value)} autoFocus />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="web-name">Etichetta (facoltativa)</Label>
            <Input id="web-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={proxy} onCheckedChange={(v) => setProxy(v === true)} className="mt-0.5" />
            <span>Aggira i blocchi dei siti (passa dal server). Disattiva se la pagina non funziona così.</span>
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button disabled={busy || !url.trim()} onClick={() => void submit()}>Aggiungi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
