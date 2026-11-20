// Where each page was opened from, so a drill can say "Back to Today" (or
// Drills, Paths, Studio, Progress...) and take you there. Recorded on every navigation
// to a different page (query-only changes on one page do not count) and kept
// for the browser session, so a reload remembers it.
import { CATALOG } from "@repo/music-core/content/catalog";
import { m } from "@repo/i18n/messages.js";

const KEY = "music.came-from";

/** Every drill's path: Today's hub owns them (the Drills tab lists them). */
export const DRILL_ROUTES = [...new Set(CATALOG.map((e) => e.route.split("?")[0]))].filter(
  (r) => !r.startsWith("/music/library"),
);

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
    return tab === "drills"
      ? m.music_shell_nav_drills()
      : tab === "paths"
        ? m.music_shell_home_paths()
        : m.music_shell_nav_today();
  }
  const hub: Record<string, string> = {
    "/music/progress":
      url.searchParams.get("view") === "journal"
        ? m.music_shell_nav_journal()
        : m.music_shell_nav_progress(),
    "/music/studio": m.music_shell_nav_studio(),
    "/music/guide": m.music_shell_nav_guide(),
    "/music/connect": m.music_shell_nav_connect(),
  };
  return hub[url.pathname] ?? null;
}

/** The hub that owns `pathname` when nothing recorded where it was opened from. */
export function ownerOf(pathname: string): { href: string; label: string } {
  if (pathname.startsWith("/music/songs") || pathname.startsWith("/music/create"))
    return { href: "/music/studio", label: m.music_shell_nav_studio() };
  if (DRILL_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/")))
    return { href: "/music?tab=drills", label: m.music_shell_nav_drills() };
  return { href: "/music", label: m.music_shell_nav_today() };
}

/** Where "Back" goes from `pathname`, and what to call it. The owning hub by default. */
export function backFor(pathname: string): { href: string; label: string } {
  const href = known[pathname];
  const name = href ? nameOf(href) : null;
  return href && name ? { href, label: name } : ownerOf(pathname);
}
