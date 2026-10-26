/**
 * Source hashes for stale-translation detection. A translation records the hash of the English it was made from
 * (`sourceHash` in a lesson's frontmatter, `_src` on each overlay item); when English changes, the hashes differ
 * and the validator and `pnpm i18n:status` report the translation as stale.
 *
 * Used by `pnpm i18n:stamp` (writes), scripts/validate-content.ts, scripts/i18n-status.ts and
 * src/lib/content/localized.ts (reads), so all of them agree. Node only (node:crypto); never import it in an island.
 */
import { createHash } from 'node:crypto';
import { TRANSLATION_SOURCE_FIELDS } from '../content/schemas';

export type SourceKind = keyof typeof TRANSLATION_SOURCE_FIELDS;

/** JSON with sorted keys, so the hash doesn't depend on property order. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object')
    return `{${Object.keys(v)
      .sort()
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  return JSON.stringify(v);
}

export const hashText = (text: string) => createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex').slice(0, 12);

/** Hash of the translatable fields of an English item (module, exam, question, flashcard or glossary term). */
export function sourceHash(kind: SourceKind, item: object): string {
  const picked: Record<string, unknown> = {};
  for (const f of TRANSLATION_SOURCE_FIELDS[kind]) picked[f] = (item as Record<string, unknown>)[f];
  return hashText(stable(picked));
}
