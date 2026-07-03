import { replaceState } from "$app/navigation";

const ROUTER_HISTORY_WARNING =
  "Avoid using `history.pushState(...)` and `history.replaceState(...)`";
const ROUTER_NOT_READY = "before router is initialized";

export function replaceRouteState(href: string, state: App.PageState): void {
  try {
    replaceState(href, state);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes(ROUTER_NOT_READY)) {
      throw error;
    }
    replaceHistoryStateQuietly(href, state);
  }
}

function replaceHistoryStateQuietly(href: string, state: App.PageState): void {
  const warn = console.warn;
  console.warn = (...args) => {
    if (typeof args[0] === "string" && args[0].includes(ROUTER_HISTORY_WARNING)) {
      return;
    }
    warn(...args);
  };

  try {
    window.history.replaceState(state, "", href);
  } finally {
    console.warn = warn;
  }
}
