/** Every route on the site, derived from src/content so new modules and lessons are picked up automatically. */
import { readdirSync, readFileSync } from 'node:fs';

const stem = (f: string) => f.replace(/\.(ya?ml|mdx?)$/, '');
const CONTENT = 'src/content';

export const modules = readdirSync(`${CONTENT}/modules`).map(stem).sort();

/** Lesson URLs: lessons/<module>/NN-<slug>.mdx → /modules/<module>/<slug>/ */
export const lessons = modules.flatMap((m) =>
  readdirSync(`${CONTENT}/lessons/${m}`)
    .filter((f) => /\.mdx?$/.test(f))
    .sort()
    .map((f) => `/modules/${m}/${stem(f).replace(/^\d+-/, '')}/`),
);

export const exams = readdirSync(`${CONTENT}/exams`).map((f) => `/modules/${stem(f)}/exam/`);
export const moduleIndexes = modules.map((m) => `/modules/${m}/`);
export const certificates = modules.map((m) => `/certificate/${m}/`);
export const staticPages = ['/', '/playground/', '/review/', '/glossary/', '/progress/', '/search/?q=udp'];

export const allRoutes = [...staticPages, ...moduleIndexes, ...lessons, ...exams, ...certificates];

/** The first lesson of a module that embeds a <Sim> or <Diagram> (falls back to its first lesson). */
export const firstLessonOf = (m: string) => {
  const files = readdirSync(`${CONTENT}/lessons/${m}`).filter((f) => /\.mdx?$/.test(f)).sort();
  const rich = files.find((f) => /<(Sim|Diagram)\b/.test(readFileSync(`${CONTENT}/lessons/${m}/${f}`, 'utf8'))) ?? files[0];
  return `/modules/${m}/${stem(rich).replace(/^\d+-/, '')}/`;
};
