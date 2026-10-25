/**
 * SVG building blocks shared by the diagrams: Arrow, PacketDot, Node and Lane.
 * Colors come from CSS variables (see ../diagrams.css), so every piece follows the site theme.
 */
import { useEffect, useRef } from 'react';
import type { SequenceStep } from '../types';
import { ActorGlyph, type ActorKind } from './ActorIcon';
import '../diagrams.css';

export type LineKind = NonNullable<SequenceStep['kind']>;

// ------------------------------------------------------------------------------------ Arrow

interface ArrowProps {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind?: LineKind;
  /** '%' draws a horizontal arrow in percentage units (responsive sequence rows). */
  unit?: '%' | '';
  head?: boolean;
  /** Pull both ends back by this many user units (numeric mode only), e.g. to stop at a node's edge. */
  inset?: number;
  className?: string;
  style?: React.CSSProperties;
}

/** A connector line whose dash pattern encodes the message kind, with an arrowhead at (x2, y2). */
export function Arrow({ x1, y1, x2, y2, kind = 'reliable', unit = '', head = true, inset = 0, className = '', style }: ArrowProps) {
  const lineKind = kind === 'rpc' || kind === 'local' ? 'reliable' : kind;
  if (unit === '%') {
    const dir = x2 >= x1 ? 1 : -1;
    return (
      <g className={className} style={style}>
        <line className="dg-line" data-kind={lineKind} x1={`${x1}%`} x2={`${x2}%`} y1={y1} y2={y2} />
        {head && (
          <svg x={`${x2}%`} y={y2} overflow="visible">
            <polygon className="dg-head" points={dir > 0 ? '1,0 -9,-5 -9,5' : '-1,0 9,-5 9,5'} />
          </svg>
        )}
      </g>
    );
  }
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const sx = x1 + ux * inset;
  const sy = y1 + uy * inset;
  const ex = x2 - ux * inset;
  const ey = y2 - uy * inset;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  return (
    <g className={className} style={style}>
      <line className="dg-line" data-kind={lineKind} x1={sx} y1={sy} x2={head ? ex - ux * 6 : ex} y2={head ? ey - uy * 6 : ey} />
      {head && <polygon className="dg-head" points="0,0 -10,-5.5 -10,5.5" transform={`translate(${ex} ${ey}) rotate(${angle})`} />}
    </g>
  );
}

// ------------------------------------------------------------------------------------ PacketDot

interface PacketDotProps {
  /** Polyline the dot travels along. */
  points: Array<[number, number]>;
  unit?: '%' | '';
  durationMs?: number;
  /** Change this to restart the animation. */
  runKey?: string | number;
  r?: number;
  /** Skip animation (reduced motion): the dot is not drawn at all. */
  disabled?: boolean;
  className?: string;
  /** Repeat forever instead of stopping at the end. */
  loop?: boolean;
}

/** A small "packet" that moves along a path. Driven by requestAnimationFrame, no re-renders per frame. */
export function PacketDot({ points, unit = '', durationMs = 900, runKey, r = 5, disabled, className = 'dg-dot', loop }: PacketDotProps) {
  const ref = useRef<SVGCircleElement>(null);
  const key = JSON.stringify(points);

  useEffect(() => {
    const el = ref.current;
    if (!el || disabled || points.length < 2) return;
    const segs = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]));
    const total = segs.reduce((a, b) => a + b, 0) || 1;
    let raf = 0;
    let start = 0;
    const place = (t: number) => {
      let d = t * total;
      let i = 0;
      while (i < segs.length - 1 && d > segs[i]) d -= segs[i++];
      const f = segs[i] ? d / segs[i] : 1;
      const [ax, ay] = points[i];
      const [bx, by] = points[i + 1];
      el.setAttribute('cx', `${ax + (bx - ax) * f}${unit}`);
      el.setAttribute('cy', `${ay + (by - ay) * f}`);
    };
    const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
    const tick = (now: number) => {
      if (!start) start = now;
      const raw = (now - start) / durationMs;
      const t = loop ? raw % 1 : Math.min(raw, 1);
      place(ease(t));
      el.style.opacity = t >= 1 && !loop ? '0' : '1';
      if (loop || raw < 1) raf = requestAnimationFrame(tick);
    };
    place(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, unit, durationMs, runKey, disabled, loop]);

  if (disabled || points.length < 2) return null;
  return <circle ref={ref} className={className} r={r} cx={`${points[0][0]}${unit}`} cy={points[0][1]} />;
}

// ------------------------------------------------------------------------------------ Node

interface NodeProps {
  x: number;
  y: number;
  w?: number;
  h?: number;
  kind?: ActorKind;
  label: string;
  sublabel?: string;
  /** Marks the node as holding authority (draws a badge). */
  authority?: boolean;
  active?: boolean;
  dim?: boolean;
  /** Narrow screens: drop the icon and centre larger text so it stays legible when the SVG is scaled down. */
  compact?: boolean;
}

/** A labelled machine box for SVG diagrams, centred on (x, y). */
export function Node({ x, y, w = 104, h = 52, kind = 'client', label, sublabel, authority, active, dim, compact }: NodeProps) {
  const tx = compact ? x : x - w / 2 + 31;
  const anchor = compact ? 'middle' : 'start';
  return (
    <g className={`dg-kind-${kind}`}>
      {/* Opaque base so connectors never show through, even when the node is dimmed. */}
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={10} fill="var(--surface)" />
      <g style={{ opacity: dim ? 0.4 : 1, transition: 'opacity .25s' }}>
      <rect
        x={x - w / 2}
        y={y - h / 2}
        width={w}
        height={h}
        rx={10}
        fill="none"
        stroke={active ? 'var(--accent)' : 'var(--kind)'}
        strokeWidth={active ? 2.5 : 1.5}
      />
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={10} fill="var(--kind)" opacity={0.08} />
      {!compact && (
        <g style={{ color: 'var(--kind)' }}>
          <ActorGlyph kind={kind} x={x - w / 2 + 17} y={y} size={20} />
        </g>
      )}
      <text x={tx} textAnchor={anchor} y={sublabel ? y - (compact ? 2 : 3) : y + (compact ? 5 : 4)} fontSize={compact ? 15 : 12.5} fontWeight={650} fill="var(--text)">
        {label}
      </text>
      {sublabel && (
        <text x={tx} textAnchor={anchor} y={y + (compact ? 15 : 12)} fontSize={compact ? 12 : 10.5} fill="var(--muted)">
          {sublabel}
        </text>
      )}
      {authority && (
        <g transform={`translate(${x + w / 2 - 4} ${y - h / 2 + 4})`}>
          <circle r={10} fill="var(--warn)" stroke="var(--surface)" strokeWidth={2} />
          <path d="M-5 2.5 -5.5 -3.5 -2.2 -0.8 0 -4.5 2.2 -0.8 5.5 -3.5 5 2.5Z" fill="var(--surface)" />
          <title>Authoritative</title>
        </g>
      )}
      </g>
    </g>
  );
}

// ------------------------------------------------------------------------------------ Lane

/** A lifeline: a vertical dashed line under an actor, positioned at `x`% of its container. */
export function Lane({ x, kind = 'client', top = 0 }: { x: number; kind?: ActorKind; top?: number }) {
  return (
    <div
      aria-hidden="true"
      className={`dg-kind-${kind} pointer-events-none absolute bottom-0 w-0 border-l-2 border-dashed`}
      style={{ left: `${x}%`, top, borderColor: 'color-mix(in srgb, var(--kind) 45%, transparent)' }}
    />
  );
}
