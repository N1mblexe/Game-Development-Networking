export interface CertificateProps {
  moduleId: string;
  moduleTitle: string;
  moduleColor: string;
  lessonKeys: string[];
  examUrl: string;
}

/**
 * Phase 0 stub. Agent A implements: locked state until the exam is passed, name entry
 * (setCertName), printable certificate with date and score, print button.
 */
export default function Certificate({ moduleTitle }: CertificateProps) {
  return (
    <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted">
      Certificate for {moduleTitle} coming soon.
    </div>
  );
}
