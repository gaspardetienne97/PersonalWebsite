// Where each page was opened from, so a drill can say "Back to Today" (or
// Drills, Paths, Progress...) and take you there. Recorded on every navigation
// to a different page (query-only changes on one page do not count) and kept
// for the browser session, so a reload remembers it.
const KEY = "music.came-from";

function read(): Record<string, string> {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

// Reactive, so a link drawn before the layout records the visit updates.
let known = $state<Record<string, string>>(typeof sessionStorage === "undefined" ? {} : read());

/** Call after each navigation: `from` and `to` are the URLs. */
export function noteNavigation(from: URL | null | undefined, to: URL | null | undefined) {
  if (!from || !to || from.pathname === to.pathname) return;
  const map = { ...read(), [to.pathname]: from.pathname + from.search };
  known = map;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* private mode: the default below still works */
  }
}

/** Places a page can be opened from, by path and Today's tab. */
function nameOf(href: string): string | null {
  const url = new URL(href, "http://x");
  if (url.pathname === "/music") {
    const tab = url.searchParams.get("tab");
    return tab === "drills" ? "Drills" : tab === "paths" ? "Paths" : "Today";
  }
  const hub: Record<string, string> = {
    "/music/progress": "Progress",
    "/music/journal": "Journal",
    "/music/library": "Library",
    "/music/guide": "Guide",
    "/music/connect": "Connect",
  };
  return hub[url.pathname] ?? null;
}

/** Where "Back" goes from `pathname`, and what to call it. Drills by default. */
export function backFor(pathname: string): { href: string; label: string } {
  const href = known[pathname];
  const name = href ? nameOf(href) : null;
  return href && name ? { href, label: name } : { href: "/music?tab=drills", label: "Drills" };
}
