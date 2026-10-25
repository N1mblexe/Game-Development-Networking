/** Canvas drawing helpers shared by the sims. All coordinates are CSS pixels. */
import type { Palette } from './theme';

const alphaCache = new Map<string, string>();

/** `#rrggbb` (or `#rgb`) with alpha → `rgba(...)`. Cached, so it is cheap to call per frame. */
export function alpha(color: string, a: number): string {
  const key = color + a;
  const hit = alphaCache.get(key);
  if (hit) return hit;
  let out = color;
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (m) {
    let h = m[1]!;
    if (h.length === 3) h = h[0]! + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16);
    out = `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  if (alphaCache.size > 512) alphaCache.clear();
  alphaCache.set(key, out);
  return out;
}

export function font(p: Palette, px: number, weight = 500, mono = false): string {
  return `${weight} ${px}px ${mono ? p.mono : p.sans}`;
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function fillRound(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string, stroke?: string): void {
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

export function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill?: string, stroke?: string, lineWidth = 1.5): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

export function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, width = 1, dash?: number[]): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  if (dash) ctx.setLineDash(dash);
  ctx.stroke();
  if (dash) ctx.setLineDash([]);
}

export function arrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, width = 1.5, head = 7): void {
  line(ctx, x1, y1, x2, y2, color, width);
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - head * Math.cos(a - 0.45), y2 - head * Math.sin(a - 0.45));
  ctx.lineTo(x2 - head * Math.cos(a + 0.45), y2 - head * Math.sin(a + 0.45));
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

/** A small "x" mark, used for lost packets and misses. */
export function cross(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, width = 2): void {
  ctx.beginPath();
  ctx.moveTo(x - r, y - r);
  ctx.lineTo(x + r, y + r);
  ctx.moveTo(x + r, y - r);
  ctx.lineTo(x - r, y + r);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

export interface TextOpts {
  color?: string;
  size?: number;
  weight?: number;
  mono?: boolean;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  /** Draw a rounded pill behind the text. */
  bg?: string;
  border?: string;
  pad?: number;
}

/** Draws text (optionally on a pill) and returns its width. */
export function text(ctx: CanvasRenderingContext2D, p: Palette, s: string, x: number, y: number, o: TextOpts = {}): number {
  const size = o.size ?? 11;
  ctx.font = font(p, size, o.weight ?? 500, o.mono);
  ctx.textAlign = o.align ?? 'left';
  ctx.textBaseline = o.baseline ?? 'middle';
  const w = ctx.measureText(s).width;
  if (o.bg) {
    const pad = o.pad ?? 4;
    const left = ctx.textAlign === 'center' ? x - w / 2 : ctx.textAlign === 'right' || ctx.textAlign === 'end' ? x - w : x;
    const top = ctx.textBaseline === 'middle' ? y - size / 2 - 3 : ctx.textBaseline === 'top' ? y - 3 : y - size - 3;
    fillRound(ctx, left - pad, top, w + pad * 2, size + 6, 4, o.bg, o.border);
  }
  ctx.fillStyle = o.color ?? p.text;
  ctx.fillText(s, x, y);
  return w;
}

/** Background panel with an optional heading in the top-left corner. */
export function panel(ctx: CanvasRenderingContext2D, p: Palette, x: number, y: number, w: number, h: number, title?: string, titleColor?: string): void {
  fillRound(ctx, x, y, w, h, 8, p.surface2, p.border);
  if (title) text(ctx, p, title, x + 10, y + 13, { size: 11, weight: 650, color: titleColor ?? p.muted });
}
