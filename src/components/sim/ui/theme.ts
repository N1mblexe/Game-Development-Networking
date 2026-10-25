/** Canvas colours come from the site's CSS variables so sims follow the light/dark theme. */
export interface Palette {
  dark: boolean;
  bg: string;
  surface: string;
  surface2: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  accentSoft: string;
  ok: string;
  okSoft: string;
  warn: string;
  warnSoft: string;
  danger: string;
  dangerSoft: string;
  /** Extra categorical colours (not in the CSS tokens). */
  violet: string;
  teal: string;
  sans: string;
  mono: string;
}

const FALLBACK: Palette = {
  dark: false,
  bg: '#f6f7f9',
  surface: '#ffffff',
  surface2: '#eef1f5',
  border: '#d9dee6',
  text: '#171a21',
  muted: '#5a6372',
  accent: '#2459d6',
  accentSoft: '#e3ebfd',
  ok: '#157a3c',
  okSoft: '#e1f4e8',
  warn: '#a35b06',
  warnSoft: '#fcefdc',
  danger: '#b42318',
  dangerSoft: '#fde7e5',
  violet: '#7c3aed',
  teal: '#0e7490',
  sans: 'system-ui, sans-serif',
  mono: 'ui-monospace, monospace',
};

export function readPalette(): Palette {
  if (typeof document === 'undefined') return FALLBACK;
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  const v = (name: string, fb: string) => cs.getPropertyValue(name).trim() || fb;
  const dark = root.dataset.theme === 'dark';
  return {
    dark,
    bg: v('--bg', FALLBACK.bg),
    surface: v('--surface', FALLBACK.surface),
    surface2: v('--surface-2', FALLBACK.surface2),
    border: v('--border', FALLBACK.border),
    text: v('--text', FALLBACK.text),
    muted: v('--muted', FALLBACK.muted),
    accent: v('--accent', FALLBACK.accent),
    accentSoft: v('--accent-soft', FALLBACK.accentSoft),
    ok: v('--ok', FALLBACK.ok),
    okSoft: v('--ok-soft', FALLBACK.okSoft),
    warn: v('--warn', FALLBACK.warn),
    warnSoft: v('--warn-soft', FALLBACK.warnSoft),
    danger: v('--danger', FALLBACK.danger),
    dangerSoft: v('--danger-soft', FALLBACK.dangerSoft),
    violet: dark ? '#b49bff' : '#7c3aed',
    teal: dark ? '#2dd4bf' : '#0f766e',
    sans: v('--font-sans', FALLBACK.sans),
    mono: v('--font-mono', FALLBACK.mono),
  };
}

/** Calls `onChange` whenever `data-theme` on <html> changes. Returns a disconnect function. */
export function watchTheme(onChange: () => void): () => void {
  if (typeof MutationObserver === 'undefined') return () => {};
  const mo = new MutationObserver(onChange);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
  return () => mo.disconnect();
}
