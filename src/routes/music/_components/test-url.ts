import { clearStoredDrillSearches, suppressRouterHistoryWarning } from "./route-state";

/**
 * Test-only helpers: set the URL for a rendered page without the router.
 *
 * `setTestUrl("/")` — the afterEach idiom in every drill page test — also
 * clears the per-drill config remembered by syncRouteQuery, so one test's
 * setup changes can't leak into the next test's "fresh visit".
 */
export function setTestUrl(href: string, state: unknown = {}): void {
  if (href === "/") clearStoredDrillSearches();
  suppressRouterHistoryWarning(() => window.history.replaceState(state, "", href));
}

export function pushTestUrl(href: string, state: unknown = {}): void {
  suppressRouterHistoryWarning(() => window.history.pushState(state, "", href));
}
