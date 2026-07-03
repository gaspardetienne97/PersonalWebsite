import { suppressRouterHistoryWarning } from "./route-state";

/** Test-only helpers: set the URL for a rendered page without the router. */
export function setTestUrl(href: string, state: unknown = {}): void {
  suppressRouterHistoryWarning(() => window.history.replaceState(state, "", href));
}

export function pushTestUrl(href: string, state: unknown = {}): void {
  suppressRouterHistoryWarning(() => window.history.pushState(state, "", href));
}
