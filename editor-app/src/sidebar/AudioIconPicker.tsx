import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AUDIO_ICONS, audioIcon } from '@/lib/audio-icons';

export function AudioIconPicker({ value, onPick }: { value: string; onPick: (slug: string) => void }) {
  const [open, setOpen] = useState(false);
  const Icon = audioIcon(value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="icon" title="Scegli icona"><Icon /></Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2">
        <div className="grid grid-cols-6 gap-1">
          {AUDIO_ICONS.map(({ slug, label, Icon: I }) => (
            <Button
              key={slug}
              size="icon"
              variant={slug === value ? 'default' : 'ghost'}
              title={label}
              onClick={() => { onPick(slug); setOpen(false); }}
            >
              <I />
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
