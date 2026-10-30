import {
  Beer, Bell, Bird, Bomb, Bug, Cat, Castle, Church, CloudLightning, CloudRain, Crown, Dog, DoorOpen,
  Droplets, Drum, Eye, Flame, Footprints, Ghost, Guitar, Heart, Laugh, Moon, Mountain, Music, Shield,
  Ship, Skull, Snowflake, Sparkles, Sun, Swords, Tent, TreePine, Utensils, Waves, Wind, Zap,
  type LucideIcon,
} from 'lucide-react';

// Set fisso di icone per le tracce audio: lo slug e salvato sul server (solo la forma e validata).
export const AUDIO_ICONS: { slug: string; label: string; Icon: LucideIcon }[] = [
  { slug: 'music', label: 'Musica', Icon: Music },
  { slug: 'cloud-rain', label: 'Pioggia', Icon: CloudRain },
  { slug: 'cloud-lightning', label: 'Temporale', Icon: CloudLightning },
  { slug: 'wind', label: 'Vento', Icon: Wind },
  { slug: 'flame', label: 'Fuoco', Icon: Flame },
  { slug: 'waves', label: 'Onde', Icon: Waves },
  { slug: 'droplets', label: 'Gocce', Icon: Droplets },
  { slug: 'snowflake', label: 'Neve', Icon: Snowflake },
  { slug: 'trees', label: 'Foresta', Icon: TreePine },
  { slug: 'mountain', label: 'Montagna', Icon: Mountain },
  { slug: 'bird', label: 'Uccello', Icon: Bird },
  { slug: 'cat', label: 'Gatto', Icon: Cat },
  { slug: 'dog', label: 'Cane', Icon: Dog },
  { slug: 'bug', label: 'Insetti', Icon: Bug },
  { slug: 'moon', label: 'Notte', Icon: Moon },
  { slug: 'sun', label: 'Giorno', Icon: Sun },
  { slug: 'castle', label: 'Castello', Icon: Castle },
  { slug: 'church', label: 'Chiesa', Icon: Church },
  { slug: 'tent', label: 'Accampamento', Icon: Tent },
  { slug: 'ship', label: 'Nave', Icon: Ship },
  { slug: 'beer', label: 'Taverna', Icon: Beer },
  { slug: 'utensils', label: 'Cena', Icon: Utensils },
  { slug: 'swords', label: 'Combattimento', Icon: Swords },
  { slug: 'shield', label: 'Scudo', Icon: Shield },
  { slug: 'skull', label: 'Morte', Icon: Skull },
  { slug: 'ghost', label: 'Fantasma', Icon: Ghost },
  { slug: 'crown', label: 'Corona', Icon: Crown },
  { slug: 'bell', label: 'Campana', Icon: Bell },
  { slug: 'drum', label: 'Tamburo', Icon: Drum },
  { slug: 'guitar', label: 'Chitarra', Icon: Guitar },
  { slug: 'zap', label: 'Fulmine', Icon: Zap },
  { slug: 'bomb', label: 'Esplosione', Icon: Bomb },
  { slug: 'footprints', label: 'Passi', Icon: Footprints },
  { slug: 'door-open', label: 'Porta', Icon: DoorOpen },
  { slug: 'sparkles', label: 'Magia', Icon: Sparkles },
  { slug: 'laugh', label: 'Risata', Icon: Laugh },
  { slug: 'heart', label: 'Cuore', Icon: Heart },
  { slug: 'eye', label: 'Occhio', Icon: Eye },
];

export const DEFAULT_AUDIO_ICON = { background: 'music', oneshot: 'zap' } as const;

const BY_SLUG = new Map(AUDIO_ICONS.map((i) => [i.slug, i.Icon]));

// Slug sconosciuto o assente: ripiego su "music".
export function audioIcon(slug: string | undefined): LucideIcon {
  return (slug && BY_SLUG.get(slug)) || Music;
}
