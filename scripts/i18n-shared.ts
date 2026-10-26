/**
 * Shared by scripts/validate-content.ts, i18n-stamp.ts and i18n-status.ts: where translations live, which English
 * file each one belongs to, and the source hash every translated item should carry. Mirrors the merge rules of
 * src/lib/content/localized.ts (which does the same at build time).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { lessonIdFromPath } from '../src/lib/content/schemas';
import { hashText, sourceHash, type SourceKind } from '../src/lib/i18n/hash';

export const CONTENT = new URL('../src/content/', import.meta.url).pathname;

export type OverlayType = 'modules' | 'quizzes' | 'exams' | 'flashcards' | 'glossary';
/** How each overlay maps onto its English file: an optional top-level item and an optional list keyed by id. */
export const OVERLAYS: Record<OverlayType, { top?: SourceKind; list?: { field: string; kind: SourceKind } }> = {
  modules: { top: 'module' },
  quizzes: { list: { field: 'questions', kind: 'question' } },
  exams: { top: 'exam', list: { field: 'questions', kind: 'question' } },
  flashcards: { list: { field: 'cards', kind: 'flashcard' } },
  glossary: { list: { field: 'terms', kind: 'glossary' } },
};
export const OVERLAY_TYPES = Object.keys(OVERLAYS) as OverlayType[];

/** Files under src/content/<dir> with an extension, relative to that dir, sorted. */
export const filesIn = (dir: string, ext: string) =>
  existsSync(join(CONTENT, dir))
    ? readdirSync(join(CONTENT, dir), { recursive: true, encoding: 'utf8' })
        .filter((f) => f.endsWith(ext))
        .sort()
    : [];

export const readYamlFile = (rel: string): unknown => parseYaml(readFileSync(join(CONTENT, rel), 'utf8'));

/** Split an MDX file into frontmatter text and body. */
export function splitFrontmatter(text: string): { fm: string; body: string } | null {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  return m ? { fm: m[1]!, body: m[2]! } : null;
}

/** English lesson files by lesson key: "theory/packets-and-protocols" → "theory/01-packets-and-protocols.mdx". */
export function englishLessons(): Map<string, string> {
  return new Map(filesIn('lessons', '.mdx').map((f) => [lessonIdFromPath(f), f]));
}

/** The hash a translation of this English lesson file records in `sourceHash`. */
export const lessonHash = (englishFile: string) => hashText(readFileSync(join(CONTENT, 'lessons', englishFile), 'utf8'));

/** English items of an overlay type's file: '' = the top-level item, otherwise ids from the list. */
export function englishItems(type: OverlayType, data: unknown): Map<string, { kind: SourceKind; item: Record<string, unknown> }> {
  const out = new Map<string, { kind: SourceKind; item: Record<string, unknown> }>();
  const spec = OVERLAYS[type];
  const d = (data ?? {}) as Record<string, unknown>;
  if (spec.top) out.set('', { kind: spec.top, item: d });
  if (spec.list)
    for (const item of (d[spec.list.field] as Record<string, unknown>[] | undefined) ?? [])
      out.set(String(item.id), { kind: spec.list.kind, item });
  return out;
}

/** Translated items of an overlay: '' = top-level text (when it has any), otherwise the list entries by id. */
export function overlayItems(type: OverlayType, data: unknown): Map<string, Record<string, unknown>> {
  const out = new Map<string, Record<string, unknown>>();
  const spec = OVERLAYS[type];
  const d = (data ?? {}) as Record<string, unknown>;
  if (spec.top) {
    const { [spec.list?.field ?? '\0']: _list, ...top } = d;
    if (Object.keys(top).some((k) => k !== '_src')) out.set('', top);
  }
  if (spec.list) for (const [id, item] of Object.entries((d[spec.list.field] as Record<string, Record<string, unknown>>) ?? {})) out.set(id, item ?? {});
  return out;
}

export const itemHash = (kind: SourceKind, item: object) => sourceHash(kind, item);

/** Module id a lesson or overlay file belongs to, for per-module reports. */
export const moduleOf = (_type: OverlayType | 'lessons', rel: string) => rel.split('/')[0]!.replace(/\.yaml$/, '');
