import type { ReactNode } from 'react';

interface Props {
  kind: 'Simulator' | 'Diagram';
  title: string;
  subtitle?: string;
  caption?: string;
  children: ReactNode;
}

/** Shared chrome for every simulator and diagram so they look like one system. */
export default function InteractiveFrame({ kind, title, subtitle, caption, children }: Props) {
  return (
    <figure className="not-prose my-8 overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border bg-surface-2 px-4 py-2.5">
        <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-accent">{kind}</span>
        <span className="font-semibold">{title}</span>
        {subtitle && <span className="text-sm text-muted">{subtitle}</span>}
      </header>
      <div className="p-4">{children}</div>
      {caption && <figcaption className="border-t border-border px-4 py-2.5 text-sm text-muted">{caption}</figcaption>}
    </figure>
  );
}
