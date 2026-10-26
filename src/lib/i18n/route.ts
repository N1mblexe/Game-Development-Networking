/**
 * Locale-aware routing. English lives at the site root (/modules/theory/), every other language under its prefix
 * (/tr/modules/theory/), with the same slugs. All pages live in src/pages/[...locale]/ and loop over the locales in
 * getStaticPaths; Astro's own `i18n` routing stays off (its fallback works per page file, not per content entry).
 *
 * "Site path" below means a root-relative path WITHOUT the deploy base and WITHOUT a locale prefix: '/modules/x/'.
 * Every function that returns an href adds the base (GitHub Pages serves the site under /<repo>/).
 *
 *   localizePath('/glossary/', 'tr')        → '/<base>/tr/glossary/'
 *   localizePath('/glossary/', 'en')        → '/<base>/glossary/'
 *   stripLocale('/<base>/tr/modules/x/')    → '/modules/x/'
 *   localeFromPath('/<base>/tr/modules/x/') → 'tr'
 *   alternateUrls('/<base>/tr/modules/x/')  → { en: '/<base>/modules/x/', tr: '/<base>/tr/modules/x/' }
 */
import { DEFAULT_LOCALE, LOCALE_CODES, LOCALES, type Locale } from '../../i18n/locales';
import { withBase } from '../url';

const base = () => import.meta.env.BASE_URL.replace(/\/+$/, '');

/** Remove the deploy base from a pathname, if present: '/<base>/tr/x/' → '/tr/x/'. */
function stripBase(pathname: string): string {
  const b = base();
  if (b && (pathname === b || pathname.startsWith(`${b}/`))) return pathname.slice(b.length) || '/';
  return pathname.startsWith('/') ? pathname : `/${pathname}`;
}

/** The locale prefix a (base-stripped) path starts with, or undefined for the default locale. */
function prefixOf(path: string): Locale | undefined {
  const seg = path.split('/')[1];
  return LOCALE_CODES.find((l) => l !== DEFAULT_LOCALE && LOCALES[l].prefix === seg);
}

/** Which locale a URL pathname (with or without the base) belongs to. */
export function localeFromPath(pathname: string): Locale {
  return prefixOf(stripBase(pathname)) ?? DEFAULT_LOCALE;
}

/** The site path of a URL pathname: base and locale prefix removed. '/<base>/tr/glossary/' → '/glossary/'. */
export function stripLocale(pathname: string): string {
  const path = stripBase(pathname);
  const loc = prefixOf(path);
  if (!loc) return path;
  return path.slice(LOCALES[loc].prefix.length + 1) || '/';
}

/**
 * The href of a site path in a locale (with the base). Accepts a path that already has a base or locale prefix and
 * normalises it first, so localizePath(Astro.url.pathname, 'tr') is safe. Query strings and #fragments are kept.
 */
export function localizePath(path: string, locale: Locale): string {
  const m = /^([^?#]*)(.*)$/.exec(path)!;
  const site = stripLocale(m[1] || '/');
  const prefix = LOCALES[locale].prefix;
  return withBase(prefix ? `/${prefix}${site}` : site) + m[2];
}

/** The same page in every locale: { en: href, tr: href }. */
export function alternateUrls(pathname: string): Record<Locale, string> {
  return Object.fromEntries(LOCALE_CODES.map((l) => [l, localizePath(pathname, l)])) as Record<Locale, string>;
}

/**
 * Where the language switcher and banner point from this page: alternateUrls(), except on the root 404 page (it exists
 * only once, GitHub Pages serves it for every missing URL), which points to each language's home page.
 */
export function switcherUrls(pathname: string): Record<Locale, string> {
  const notFound = /^\/404(\.html|\/)?$/.test(stripLocale(pathname));
  return alternateUrls(notFound ? '/' : pathname);
}

/** The locale of the page being rendered. Works in pages, layouts and components (it reads the request URL). */
export function getLocale(astro: { url: URL; params?: Record<string, string | undefined> }): Locale {
  const p = astro.params?.locale;
  if (p !== undefined) {
    const fromParam = LOCALE_CODES.find((l) => LOCALES[l].prefix === p);
    if (fromParam) return fromParam;
  }
  return localeFromPath(astro.url.pathname);
}

/** Value of the optional `[...locale]` route param for a locale: undefined for the default (root) locale. */
export const localeParam = (locale: Locale): string | undefined => LOCALES[locale].prefix || undefined;

/**
 * getStaticPaths helper. With no argument it yields one path per locale; with a list of `{ params, props }` it yields
 * every combination, adding `locale` to both params (the route segment) and props (the Locale code).
 *
 *   export const getStaticPaths = () => localeStaticPaths();
 *   export async function getStaticPaths() {
 *     return localeStaticPaths((await getModules()).map((m) => ({ params: { module: m.id }, props: { moduleId: m.id } })));
 *   }
 * Props can also be a function of the locale, for per-locale data: `props: (locale) => ({ ... })`.
 */
export function localeStaticPaths(): { params: { locale: string | undefined }; props: { locale: Locale } }[];
export function localeStaticPaths<P extends Record<string, string | undefined>, Pr extends object>(
  paths: { params: P; props?: Pr | ((locale: Locale) => Pr) }[],
): { params: P & { locale: string | undefined }; props: Pr & { locale: Locale } }[];
export function localeStaticPaths(
  paths: { params: Record<string, string | undefined>; props?: object | ((locale: Locale) => object) }[] = [{ params: {} }],
) {
  return LOCALE_CODES.flatMap((locale) =>
    paths.map((p) => ({
      params: { ...p.params, locale: localeParam(locale) },
      props: { ...(typeof p.props === 'function' ? p.props(locale) : p.props), locale },
    })),
  );
}
