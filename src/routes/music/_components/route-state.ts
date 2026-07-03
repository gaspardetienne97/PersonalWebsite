import { replaceState } from "$app/navigation";
import { page } from "$app/stores";
import { get } from "svelte/store";

// BRITTLE: both constants match SvelteKit's *internal* message text. If a
// SvelteKit upgrade rewords its router warning/error, the matching silently
// stops and the fallback/suppression becomes a no-op — re-check these strings
// when bumping @sveltejs/kit.
const ROUTER_HISTORY_WARNING =
  "Avoid using `history.pushState(...)` and `history.replaceState(...)`";
const ROUTER_NOT_READY = "before router is initialized";

/**
 * Sync a drill's shareable config URL from inside an `$effect` without
 * creating a feedback loop: reads the current page state untracked (via
 * `get(page)`, not `$page`) and no-ops when the URL already matches.
 */
export function syncRouteQuery(href: string): void {
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (href === current) return;
  replaceRouteState(href, get(page).state);
}

export function replaceRouteState(href: string, state: App.PageState): void {
  try {
    replaceState(href, state);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes(ROUTER_NOT_READY)) {
      throw error;
    }
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
