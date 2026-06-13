import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import { useSync } from "@/contexts/SyncContext";

/**
 * Reload screen data both when the screen regains focus AND whenever local data
 * changes elsewhere (tracked via SyncContext.localVersion).
 *
 * Why: screens opened *behind* a modal route (e.g. `invoice/new`) never receive
 * a focus event when that modal is dismissed, so `useFocusEffect` alone leaves
 * them showing stale data after a sale/return/cash movement. Bumping
 * `localVersion` after any local write (and after a successful sync) forces the
 * effect below to re-run, keeping every mounted screen consistent.
 *
 * The callback is held in a ref so a fresh inline function on every render does
 * not re-register the focus effect or double-fire the version watcher.
 */
export function useRefreshOnFocus(fn: () => void) {
  const { localVersion } = useSync();
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useFocusEffect(
    useCallback(() => {
      fnRef.current();
    }, []),
  );

  const mounted = useRef(false);
  useEffect(() => {
    // Skip the initial run — useFocusEffect already loads on mount.
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    fnRef.current();
  }, [localVersion]);
}
