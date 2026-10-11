import type { ReactNode } from 'react';

// Icone portate dai <symbol> di public/control/index.html (viewBox 24, tratto
// currentColor, nessun riempimento, come la classe .icon del pannello vanilla).
function Icon({ children, fill = false }: { children: ReactNode; fill?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-[18px] shrink-0"
      fill={fill ? 'currentColor' : 'none'}
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

export const ShapeConeIcon = () => <Icon><path d="M12 3 21 20H3Z" /></Icon>;
export const ShapeCubeIcon = () => <Icon><rect x="4" y="4" width="16" height="16" /></Icon>;
export const ShapeSphereIcon = () => <Icon><circle cx="12" cy="12" r="9" /></Icon>;
export const ShapeLineIcon = () => <Icon><path d="M4 20 20 4" /></Icon>;
export const MoreIcon = () => (
  <Icon fill>
    <circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" />
  </Icon>
);
export const WebIcon = () => (
  <Icon><path d="M12 2v20M3 8l18 8M21 8 3 16M4.5 4.5l15 15M19.5 4.5l-15 15" /><circle cx="12" cy="12" r="9" /></Icon>
);
export const SmokeIcon = () => (
  <Icon><path d="M8 20c-2 0-3-1.3-3-3s1.3-3 3-2.4c-.5-1.6.6-3.6 2.6-3.6 1.4 0 2.6.9 3 2.1.5-.4 1.1-.6 1.9-.6 2 0 3.5 1.5 3.5 3.5S17.5 19 15.5 19" /></Icon>
);
export const WizardHatIcon = () => (
  <Icon><path d="M12 2 7 17h10L12 2Z" /><path d="M3 19c3 2 15 2 18 0" /><path d="M17 5v2.4M15.8 6.2h2.4" /></Icon>
);
export const BoltIcon = () => <Icon><path d="M13 2 4 14h6l-1 8 9-12h-6z" /></Icon>;
export const MoveIcon = () => <Icon><path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" /></Icon>;
export const PlayIcon = () => <Icon><path d="M7 4l13 8-13 8z" /></Icon>;
export const PauseIcon = () => <Icon><path d="M8 4v16M16 4v16" /></Icon>;
export const StopIcon = () => <Icon><rect x="6" y="6" width="12" height="12" /></Icon>;
