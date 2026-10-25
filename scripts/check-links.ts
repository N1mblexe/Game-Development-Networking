/**
 * Internal link checker for the built site.
 *
 *   pnpm check:links                     # checks dist/ for a root deployment
 *   BASE_PATH=/netlearn pnpm check:links  # checks a build made with BASE_PATH=/netlearn
 *   tsx scripts/check-links.ts --dist dist --base /netlearn
 *
 * For every HTML page it collects internal references (href, src, srcset, astro-island component/renderer
 * URLs, Pagefind's bundle-path, …) and checks that each one
 *   - starts with the base path (a root-relative URL that skips the base breaks on GitHub Pages),
 *   - resolves to a file in dist/ (with or without a trailing slash: "/x", "/x/" and "/x/index.html"),
 *   - and, when it has a #fragment, that the target page has an element with that id (or <a name>).
 * It also checks the JS chunks: relative imports between chunks, "_astro/…" preload paths, and the base
 * baked into Vite's preload helper, plus url(...) references in CSS.
 *
 * Exits 1 when anything is broken. Output is grouped by source file under src/ when it can be inferred.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, posix, relative, resolve } from 'node:path';

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const DIST = resolve(arg('dist') ?? 'dist');
const BASE = `/${(arg('base') ?? process.env.BASE_PATH ?? '/').replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/');
const verbose = args.includes('--verbose');

if (!existsSync(DIST)) {
  console.error(`check-links: ${DIST} does not exist. Run \`pnpm build\` first.`);
  process.exit(2);
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = walk(DIST);
const htmlFiles = files.filter((f) => f.endsWith('.html'));
const jsFiles = files.filter((f) => f.endsWith('.js') || f.endsWith('.mjs'));
const cssFiles = files.filter((f) => f.endsWith('.css'));

/** URL path of an HTML file, as served: dist/a/b/index.html → <base>a/b/ */
const pageUrl = (file: string) => {
  const rel = relative(DIST, file).split('\\').join('/');
  return BASE + rel.replace(/(^|\/)index\.html$/, '$1');
};

const decodeEntities = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

// ---------------------------------------------------------------- ids per page (for #fragments)
const idCache = new Map<string, Set<string>>();
function idsOf(file: string): Set<string> {
  let ids = idCache.get(file);
  if (!ids) {
    const html = readFileSync(file, 'utf8');
    ids = new Set<string>();
    for (const m of html.matchAll(/\s(?:id|name)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) ids.add(decodeEntities(m[1] ?? m[2]));
    idCache.set(file, ids);
  }
  return ids;
}

/** Map a URL path (already without base, query and hash) to a file in dist, or null. */
function resolveFile(pathInDist: string): string | null {
  let p: string;
  try {
    p = decodeURIComponent(pathInDist);
  } catch {
    p = pathInDist;
  }
  const abs = join(DIST, p);
  if (!abs.startsWith(DIST)) return null;
  const candidates = p.endsWith('/') || p === '' ? [join(abs, 'index.html')] : [abs, join(abs, 'index.html'), `${abs}.html`];
  for (const c of candidates) if (existsSync(c) && statSync(c).isFile()) return c;
  return null;
}

interface Problem {
  from: string;
  url: string;
  why: string;
}
const problems: Problem[] = [];
let checked = 0;

const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i; // http:, https:, mailto:, tel:, data:, javascript:, //host

function checkRef(fromFile: string, fromUrl: string, raw: string) {
  const url = decodeEntities(raw.trim());
  if (!url || EXTERNAL.test(url)) return;
  checked++;
  const hashAt = url.indexOf('#');
  const fragment = hashAt >= 0 ? url.slice(hashAt + 1) : '';
  const pathPart = (hashAt >= 0 ? url.slice(0, hashAt) : url).replace(/\?.*$/, '');

  // Resolve relative URLs against the page they appear on.
  const absPath = pathPart === '' ? fromUrl : pathPart.startsWith('/') ? pathPart : posix.resolve(posix.dirname(fromUrl + 'x'), pathPart) + (pathPart.endsWith('/') ? '/' : '');
  const from = relative(DIST, fromFile);

  if (!(absPath + '/').startsWith(BASE) && absPath !== BASE.slice(0, -1)) {
    problems.push({ from, url, why: `does not start with the base path ${BASE}` });
    return;
  }
  const target = resolveFile(absPath.slice(BASE.length));
  if (!target) {
    problems.push({ from, url, why: 'no such file in dist/' });
    return;
  }
  if (fragment && target.endsWith('.html')) {
    let id = fragment;
    try {
      id = decodeURIComponent(fragment);
    } catch {
      /* keep raw */
    }
    if (!idsOf(target).has(id)) problems.push({ from, url, why: `#${id} is not an id on ${relative(DIST, target)}` });
  }
}

// ---------------------------------------------------------------- HTML
const ATTRS = ['href', 'src', 'component-url', 'renderer-url', 'before-hydration-url', 'bundle-path', 'action', 'poster', 'data-href'];
const attrRe = new RegExp(`\\s(${ATTRS.join('|')})\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'g');

for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8')
    // Code samples and inline scripts aren't links.
    .replace(/<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<pre\b[\s\S]*?<\/pre>/gi, '')
    .replace(/<template\b[\s\S]*?<\/template>/gi, '');
  const from = pageUrl(file);
  for (const m of html.matchAll(attrRe)) {
    const value = m[2] ?? m[3];
    // Pagefind's bundle-path is a directory: check the files the UI actually fetches from it.
    if (m[1] === 'bundle-path') for (const f of ['pagefind.js', 'pagefind-entry.json']) checkRef(file, from, value.replace(/\/?$/, '/') + f);
    else checkRef(file, from, value);
  }
  for (const m of html.matchAll(/\ssrcset\s*=\s*"([^"]*)"/g))
    for (const part of m[1].split(',')) checkRef(file, from, part.trim().split(/\s+/)[0]);
}

// ---------------------------------------------------------------- JS chunks
for (const file of jsFiles) {
  const js = readFileSync(file, 'utf8');
  const fileUrl = BASE + relative(DIST, file).split('\\').join('/');
  // import("./x.js"), import"./x.js", from"./x.js", new URL("./x.js", import.meta.url)
  for (const m of js.matchAll(/(?:\bimport\s*\(?|\bfrom)\s*["'`](\.{1,2}\/[^"'`]+)["'`]/g)) checkRef(file, fileUrl, m[1]);
  // Vite's preload dependency lists: "_astro/x.js" relative to the base.
  for (const m of js.matchAll(/["'`](_astro\/[\w.@-]+\.(?:js|css))["'`]/g)) checkRef(file, fileUrl, BASE + m[1]);
  // Vite's preload helper bakes in the base: function(e){return"/<base>/"+e}
  const helper = /function\(\w\)\{return\s*["'`]([^"'`]*)["'`]\s*\+\s*\w\}/.exec(js);
  if (helper && /preload/.test(js) && helper[1] !== BASE)
    problems.push({ from: relative(DIST, file), url: helper[1], why: `Vite preload base is "${helper[1]}", expected "${BASE}"` });
}

// ---------------------------------------------------------------- CSS url(...)
for (const file of cssFiles) {
  const css = readFileSync(file, 'utf8');
  const fileUrl = BASE + relative(DIST, file).split('\\').join('/');
  for (const m of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) if (!m[1].startsWith('#')) checkRef(file, fileUrl, m[1]);
}

// ---------------------------------------------------------------- report
const byFrom = new Map<string, Problem[]>();
for (const p of problems) byFrom.set(p.from, [...(byFrom.get(p.from) ?? []), p]);
const unique = new Set(problems.map((p) => `${p.url} ${p.why}`));

console.log(
  `check-links: ${htmlFiles.length} pages, ${jsFiles.length} scripts, ${cssFiles.length} stylesheets, ${checked} references, base ${BASE}`,
);
if (!problems.length) {
  console.log('0 broken links');
  process.exit(0);
}
for (const [from, list] of [...byFrom].sort(([a], [b]) => a.localeCompare(b))) {
  console.log(`\n${from}`);
  const seen = new Set<string>();
  for (const p of list) {
    const key = `${p.url} ${p.why}`;
    if (seen.has(key) && !verbose) continue;
    seen.add(key);
    console.log(`  ${p.url}  →  ${p.why}`);
  }
}
console.log(`\n${problems.length} broken reference(s) (${unique.size} unique) in ${byFrom.size} file(s)`);
process.exit(1);

// Keep tsc happy about unused helpers in some configurations.
void dirname;
