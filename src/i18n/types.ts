/**
 * Dictionary types.
 *
 * English dictionaries are the source of truth and end with `satisfies Dict`. Every other language types its copy
 * against the English one, so a missing key, an extra key or a function leaf with different parameters fails
 * `pnpm check`:
 *
 *   // src/i18n/en/quiz.ts
 *   export default {
 *     next: 'Next question',
 *     score: ({ n, total }: { n: number; total: number }) => `${n} of ${total} correct`,
 *   } satisfies Dict;
 *
 *   // src/i18n/tr/quiz.ts
 *   import type en from '../en/quiz';
 *   export default {
 *     next: 'Sonraki soru',
 *     score: ({ n, total }) => `${total} sorudan ${n} doğru`,
 *   } satisfies Messages<typeof en>;
 *
 * Interpolation is always a function leaf, never a "{n}" placeholder string: translators can then move the values
 * around and attach Turkish suffixes ("%70'i", "RPC'ler") with normal code.
 */

/** A leaf is a plain string or a function that builds one (or, for the few .tsx dictionaries, a ReactNode). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MessageLeaf = string | ((...args: any[]) => unknown);
export interface Dict {
  [key: string]: MessageLeaf | Dict | readonly string[];
}

/**
 * The shape a translation of `T` must have: the same keys, strings stay strings (any text), string arrays stay string
 * arrays, and function leaves keep their exact parameters and return type.
 */
export type Messages<T> = {
  [K in keyof T]: T[K] extends string
    ? string
    : T[K] extends readonly string[]
      ? readonly string[]
      : T[K] extends (...args: infer A) => infer R
        ? (...args: A) => R
        : Messages<T[K]>;
};
