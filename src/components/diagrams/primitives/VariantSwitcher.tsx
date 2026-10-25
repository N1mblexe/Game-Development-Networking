import { useState, type ReactNode } from 'react';
import ActorIcon, { type ActorKind } from './ActorIcon';

/**
 * When a lesson pins a variant (<Diagram variant="relay" />) that variant is shown alone.
 * Without one, the diagram shows a segmented switcher so readers can compare variants.
 */
export function useVariant<V extends string>(variants: readonly V[], requested?: string) {
  const pinned = variants.includes(requested as V) ? (requested as V) : undefined;
  const [current, setCurrent] = useState<V>(pinned ?? variants[0]);
  const value = pinned ?? current;
  return { value, pinned: Boolean(pinned), set: setCurrent };
}

export function VariantSwitcher<V extends string>({
  variants,
  value,
  onChange,
  labels,
  label = 'Variant',
}: {
  variants: readonly V[];
  value: V;
  onChange: (v: V) => void;
  labels: Record<V, string>;
  label?: string;
}) {
  return (
    <div role="group" aria-label={label} className="mb-4 flex flex-wrap gap-1.5" data-variant-switcher>
      {variants.map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={v === value}
          onClick={() => onChange(v)}
          className={[
            'rounded-full border px-3 py-1 text-sm font-medium transition-colors',
            v === value ? 'border-accent bg-accent-soft text-accent' : 'border-border bg-surface text-muted hover:text-text',
          ].join(' ')}
        >
          {labels[v]}
        </button>
      ))}
    </div>
  );
}

/** A small "runs on" summary: which machines execute something. */
export function RunsOn({ title, items }: { title: string; items: Array<{ label: string; kind: ActorKind; yes: boolean }> }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-semibold">{title}</span>
      {items.map((it) => (
        <span
          key={it.label}
          className={`dg-kind-${it.kind} inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium`}
          style={
            it.yes
              ? { borderColor: 'var(--kind)', color: 'var(--kind)', background: 'color-mix(in srgb, var(--kind) 10%, transparent)' }
              : { borderColor: 'var(--border)', color: 'var(--muted)', textDecoration: 'line-through' }
          }
        >
          <ActorIcon kind={it.kind} className="h-3.5 w-3.5" />
          {it.label}
          <span className="sr-only">{it.yes ? '(runs)' : '(does not run)'}</span>
        </span>
      ))}
    </div>
  );
}

/** A compact inline callout used under diagrams. */
export function DiagramNote({ tone = 'note', children }: { tone?: 'note' | 'warn' | 'ok'; children: ReactNode }) {
  const cls =
    tone === 'warn'
      ? 'border-warn bg-warn-soft'
      : tone === 'ok'
        ? 'border-ok bg-ok-soft'
        : 'border-accent bg-accent-soft';
  return <div className={`rounded-lg border-l-4 px-3 py-2 text-sm ${cls}`}>{children}</div>;
}
