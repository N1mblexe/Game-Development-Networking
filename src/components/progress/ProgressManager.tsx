export interface ProgressManagerProps {
  /** For the summary table: every module and its lesson keys. */
  modules: { id: string; title: string; lessonKeys: string[] }[];
}

/** Phase 0 stub. Agent A implements: summary, export (download JSON), import (file), reset (confirm). */
export default function ProgressManager({ modules }: ProgressManagerProps) {
  return (
    <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted">
      Progress manager coming soon ({modules.length} modules).
    </div>
  );
}
