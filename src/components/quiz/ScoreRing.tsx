interface Props {
  pct: number;
  passPct: number;
  size?: number;
}

/** Circular score with a tick at the pass mark. Colors come from theme tokens. */
export default function ScoreRing({ pct, passPct, size = 112 }: Props) {
  const r = 44;
  const c = 2 * Math.PI * r;
  const passed = pct >= passPct;
  const tick = (passPct / 100) * 2 * Math.PI - Math.PI / 2;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className="shrink-0" role="img" aria-label={`Score ${pct}%`}>
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="9" />
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke={passed ? 'var(--ok)' : 'var(--danger)'}
        strokeWidth="9"
        strokeLinecap={pct > 0 ? 'round' : 'butt'}
        strokeDasharray={`${(pct / 100) * c} ${c}`}
        transform="rotate(-90 50 50)"
        className="transition-[stroke-dasharray] duration-700"
      />
      <line
        x1={50 + Math.cos(tick) * 37}
        y1={50 + Math.sin(tick) * 37}
        x2={50 + Math.cos(tick) * 51}
        y2={50 + Math.sin(tick) * 51}
        stroke="var(--muted)"
        strokeWidth="2"
      />
      <text x="50" y="50" textAnchor="middle" dominantBaseline="central" fill="var(--text)" fontSize="22" fontWeight="800">
        {pct}%
      </text>
    </svg>
  );
}
