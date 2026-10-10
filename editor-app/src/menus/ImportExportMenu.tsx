import { useRef, useState } from 'react';
import { Download, MoreHorizontal, Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Menubar, MenubarContent, MenubarItem, MenubarMenu, MenubarTrigger } from '@/components/ui/menubar';
import { selectActiveLocation, useEditorStore } from '@/store/editor-store';

interface Pending { token: string; kind: 'location' | 'backup'; text: string; yesLabel: string }

const formatDate = (iso: string) => {
  try { return new Date(iso).toLocaleDateString('it-IT'); } catch { return iso; }
};

const cancelImport = (token: string) =>
  fetch('/api/import/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });

export function ImportExportMenu() {
  const location = useEditorStore(selectActiveLocation);
  const locationCount = useEditorStore((s) => s.server?.locations.length ?? 0);
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (pending) { void cancelImport(pending.token); setPending(null); }
    setError(null);
    setBusy(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/import/inspect', { method: 'POST', body: formData });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Importazione fallita');
      if (body.kind === 'location') {
        setPending({
          token: body.token, kind: 'location', yesLabel: 'Importa',
          text: `Importare la location «${body.summary.locationName}», esportata il ${formatDate(body.summary.exportedAt)}?`,
        });
      } else {
        setPending({
          token: body.token, kind: 'backup', yesLabel: 'Sostituisci tutto',
          text: `Questo SOSTITUIRÀ tutte le ${locationCount} location attuali con le ${body.summary.locationCount} contenute nel backup, esportato il ${formatDate(body.summary.exportedAt)}. Una copia di sicurezza dei dati attuali verrà salvata automaticamente prima.`,
        });
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!pending) return;
    const { token } = pending;
    setPending(null);
    try {
      const res = await fetch('/api/import/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Importazione fallita');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const dismiss = () => {
    if (pending) void cancelImport(pending.token);
    setPending(null);
  };

  return (
    <>
      <input ref={fileInput} type="file" accept=".vttlocation,.vttbackup" hidden onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
      <Menubar className="h-10 border-0 bg-transparent p-0 shadow-none">
        <MenubarMenu>
          <MenubarTrigger className="gap-1.5"><MoreHorizontal className="size-4" /> Esporta/Importa</MenubarTrigger>
          <MenubarContent>
            <MenubarItem disabled={!location} onSelect={() => { window.location.href = `/api/export/location/${location!.id}`; }}>
              <Download /> Esporta «{location?.name ?? '—'}»
            </MenubarItem>
            <MenubarItem onSelect={() => { window.location.href = '/api/export/backup'; }}>
              <Download /> Esporta backup completo
            </MenubarItem>
            <MenubarItem disabled={busy} onSelect={() => fileInput.current?.click()}>
              <Upload /> {busy ? 'Analisi in corso...' : 'Importa...'}
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>
      {error && <p className="px-6 py-2 text-sm text-amber-400" role="alert">{error}</p>}
      <Dialog open={pending !== null} onOpenChange={(open) => { if (!open) dismiss(); }}>
        <DialogContent>
          <DialogTitle>{pending?.kind === 'backup' ? 'Sostituire tutti i dati?' : 'Importare la location?'}</DialogTitle>
          <DialogDescription>{pending?.text}</DialogDescription>
          <DialogFooter>
            <Button variant="ghost" onClick={dismiss}>Annulla</Button>
            <Button variant={pending?.kind === 'backup' ? 'destructive' : 'default'} onClick={() => void apply()}>{pending?.yesLabel}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
