/** Placeholder until the real diagram is implemented (Phase 1, agent C). */
export default function StubDiagram({ variant }: { variant?: string }) {
  return (
    <div className="grid h-40 place-items-center text-sm text-muted">
      Diagram coming soon{variant ? ` (variant: ${variant})` : ''}
    </div>
  );
}
