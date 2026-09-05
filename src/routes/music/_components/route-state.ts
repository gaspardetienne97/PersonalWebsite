import { replaceState } from "$app/navigation";
import { page } from "$app/stores";
import { get } from "svelte/store";

// BRITTLE: this matches SvelteKit's internal warning text. Re-check it when
// bumping @sveltejs/kit.
const ROUTER_HISTORY_WARNING =
  "Avoid using `history.pushState(...)` and `history.replaceState(...)`";

const DRILL_CONFIG_STORAGE_PREFIX = "music:drill-config:";

/**
 * Sync a drill's shareable config URL from inside an `$effect` without
 * creating a feedback loop: reads the current page state untracked (via
 * `get(page)`, not `$page`) and no-ops when the URL already matches.
 *
 * Also remembers the synced config per drill (keyed by pathname) so the next
 * plain visit restores the last setup — see `initialDrillSearch`.
 */
export function syncRouteQuery(href: string): void {
  rememberDrillSearch(href);
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (href === current) return;
  replaceRouteState(href, get(page).state);
}

/**
 * The search params a drill page should initialize from: explicit URL params
 * when present (shared links stay exact), otherwise the last setup this drill
 * synced via `syncRouteQuery`. The sync effect then writes the restored
 * config back into the URL, so a restored visit is immediately shareable.
 *
 * Pass `exclude` to filter out params that should not be restored from
 * localStorage (e.g. `bpm` / `tempo` for routes using shared practice BPM).
 */
export function initialDrillSearch(exclude?: string[]): URLSearchParams {
  const current = new URLSearchParams(window.location.search);
  if ([...current.keys()].length > 0) {
    return current;
  }
  try {
    const stored = window.localStorage.getItem(
      `${DRILL_CONFIG_STORAGE_PREFIX}${window.location.pathname}`,
    );
    if (stored) {
      const params = new URLSearchParams(stored);
      if (exclude) {
        for (const p of exclude) params.delete(p);
      }
      return params;
    }
  } catch {
    // Storage unavailable (private mode, quota) — fall through to defaults.
  }
  return current;
}

/** Test-isolation hook: drop every remembered drill setup. */
export function clearStoredDrillSearches(): void {
  try {
    const doomed: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(DRILL_CONFIG_STORAGE_PREFIX)) doomed.push(key);
    }
    for (const key of doomed) window.localStorage.removeItem(key);
  } catch {
    // Storage unavailable — nothing to clear.
  }
}

function rememberDrillSearch(href: string): void {
  try {
    const url = new URL(href, window.location.origin);
    if ([...url.searchParams.keys()].length === 0) return;
    window.localStorage.setItem(
      `${DRILL_CONFIG_STORAGE_PREFIX}${url.pathname}`,
      url.searchParams.toString(),
    );
  } catch {
    // Storage unavailable — the URL itself still carries the config.
  }
}

export function replaceRouteState(href: string, state: App.PageState): void {
  try {
    replaceState(href, state);
  } catch {
    suppressRouterHistoryWarning(() => window.history.replaceState(state, "", href));
  }
}

/**
 * Run a raw history update with SvelteKit's dev-mode "use $app/navigation"
 * warning suppressed. Shared with the test-only URL helpers in test-url.ts.
 */
export function suppressRouterHistoryWarning<T>(update: () => T): T {
  const warn = console.warn;
  console.warn = (...args) => {
    if (typeof args[0] === "string" && args[0].includes(ROUTER_HISTORY_WARNING)) {
      return;
    }
    warn(...args);
  };

  try {
    return update();
  } finally {
    console.warn = warn;
  }
}

/**
 * A hub tab that lives in the URL. `readRouteTab` picks the tab out of a
 * search string (falling back when the value is unknown); `writeRouteTab`
 * writes the chosen tab back through `syncRouteQuery`, keeping every other
 * parameter, so Library, Create and Tuner round-trip their tabs the same way.
 */
export function readRouteTab<T extends string>(
  search: URLSearchParams | string | null | undefined,
  param: string,
  values: readonly T[],
  fallback: T,
): T {
  const params = search instanceof URLSearchParams ? search : new URLSearchParams(search ?? "");
  const value = params.get(param);
  return (values as readonly string[]).includes(value ?? "") ? (value as T) : fallback;
}

export function writeRouteTab(
  param: string,
  value: string,
  options: { drop?: string[] } = {},
): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set(param, value);
  for (const key of options.drop ?? []) url.searchParams.delete(key);
  syncRouteQuery(`${url.pathname}?${url.searchParams.toString()}${url.hash}`);
}
