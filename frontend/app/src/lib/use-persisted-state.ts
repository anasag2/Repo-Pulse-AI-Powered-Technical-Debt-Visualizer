import { useState } from "react";

/**
 * Like useState, but the value survives leaving and returning to a page.
 * Wouter unmounts route components on navigation, which would otherwise reset
 * filters/selection/view-mode state back to defaults every time you come
 * back. Backed by sessionStorage, so it resets when the tab closes.
 *
 * `override`, when not undefined, wins over both sessionStorage and
 * `initialValue` on the very first render — for deep links (e.g. a file's
 * path from the 3D map) that must beat a stale persisted selection instead of
 * being corrected a render later.
 */
export function usePersistedState<T>(key: string, initialValue: T | (() => T), override?: T) {
  const storageKey = `rp-state:${key}`;

  const [state, setState] = useState<T>(() => {
    if (override !== undefined) return override;
    try {
      const stored = sessionStorage.getItem(storageKey);
      if (stored !== null) return JSON.parse(stored) as T;
    } catch {
      /* ignore */
    }
    return initialValue instanceof Function ? initialValue() : initialValue;
  });

  const setPersisted = (value: T | ((prev: T) => T)) => {
    setState((prev) => {
      const next = value instanceof Function ? (value as (prev: T) => T)(prev) : value;
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return [state, setPersisted] as const;
}
