import type { SequenceActor } from '../types';

export type ActorKind = NonNullable<SequenceActor['kind']>;

export const KIND_LABEL: Record<ActorKind, string> = {
  client: 'Client',
  server: 'Server',
  host: 'Host',
  steam: 'Steam',
  relay: 'Relay',
  service: 'Service',
};

const paths: Record<ActorKind, React.ReactNode> = {
  client: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </>
  ),
  server: (
    <>
      <rect x="4" y="3" width="16" height="7" rx="1.5" />
      <rect x="4" y="14" width="16" height="7" rx="1.5" />
      <path d="M8 6.5h.01M8 17.5h.01" strokeWidth={3} />
    </>
  ),
  host: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
      <path d="m12 6.6 1.1 2.2 2.4.3-1.8 1.6.5 2.4-2.2-1.2-2.2 1.2.5-2.4-1.8-1.6 2.4-.3z" fill="currentColor" strokeWidth={1} />
    </>
  ),
  steam: <path d="M7 18a4 4 0 0 1-.6-7.96A6 6 0 0 1 17.8 9 4.5 4.5 0 0 1 17.5 18z" />,
  relay: (
    <>
      <path d="M4 9h13l-3-3" />
      <path d="M20 15H7l3 3" />
    </>
  ),
  service: (
    <>
      <path d="M12 3 4 7.5v9L12 21l8-4.5v-9z" />
      <path d="M4 7.5 12 12l8-4.5M12 12v9" />
    </>
  ),
};

/** Small stroke icon for an actor kind. Inherits currentColor. */
export default function ActorIcon({ kind = 'client', className = 'h-5 w-5' }: { kind?: ActorKind; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[kind]}
    </svg>
  );
}

/** SVG-native variant (for use inside an <svg>): draws the icon centred on (x, y). */
export function ActorGlyph({ kind = 'client', x, y, size = 22 }: { kind?: ActorKind; x: number; y: number; size?: number }) {
  const s = size / 24;
  return (
    <g transform={`translate(${x - size / 2} ${y - size / 2}) scale(${s})`} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      {paths[kind]}
    </g>
  );
}
