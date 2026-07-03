const ROUTER_HISTORY_WARNING =
  "Avoid using `history.pushState(...)` and `history.replaceState(...)`";

export function setTestUrl(href: string, state: unknown = {}): void {
  updateHistoryQuietly(() => window.history.replaceState(state, "", href));
}

export function pushTestUrl(href: string, state: unknown = {}): void {
  updateHistoryQuietly(() => window.history.pushState(state, "", href));
}

function updateHistoryQuietly(update: () => void): void {
  const warn = console.warn;
  console.warn = (...args) => {
    if (typeof args[0] === "string" && args[0].includes(ROUTER_HISTORY_WARNING)) {
      return;
    }
    warn(...args);
  };

  try {
    update();
  } finally {
    console.warn = warn;
  }
}
