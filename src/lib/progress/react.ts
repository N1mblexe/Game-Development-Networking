/**
 * React helpers for progress. Progress lives in localStorage, which the server can't see,
 * so anything derived from it must render only after mount to avoid hydration mismatches.
 */
import { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import { $progress, initProgress } from './store';
import type { Progress } from './types';

/** False during SSR and the hydration render; true afterwards. */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    initProgress();
    setHydrated(true);
  }, []);
  return hydrated;
}

/** Current progress, or null until mounted (render a placeholder for null). */
export function useProgress(): Progress | null {
  const hydrated = useHydrated();
  const p = useStore($progress);
  return hydrated ? p : null;
}
