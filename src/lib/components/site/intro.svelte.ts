/**
 * Shared state for the logo intro and the circuit board behind the site.
 *
 * The intro plays on a visitor's first visit to the home page, or again when
 * someone types the shortcut (hold Ctrl and Shift, then press G, M, E). Whatever
 * board the intro grew stays on as the site background.
 */
import { goto } from "$app/navigation";
import { growCircuit, logoColorAt, ringRoots, type Board, type Root } from "#lib/circuit/router.ts";

/** localStorage key set once the intro has been seen. */
export const SEEN_KEY = "gm.intro.seen";
/** Class the head script puts on <html> so a returning visitor never sees the intro flash. */
export const SEEN_CLASS = "gm-intro-seen";

export const site = $state<{
  /** Set to ask the home page to play the intro again; the intro clears it. */
  replay: boolean;
  /** The board behind the site, once one has been grown, and the ring it grew from. */
  board: Board | null;
  ring: Ring | null;
  seed: number;
}>({ replay: false, board: null, ring: null, seed: 0 });

/** Grid pitch shared by the intro, the dot grid and the background. */
export const PITCH = 16;

export type Ring = { cx: number; cy: number; r: number };

/** An area of the screen, in the board's own pixels. */
export type Rect = { x: number; y: number; w: number; h: number };

/**
 * The site's board: traces fan out from the logo's ring, and from a small hidden
 * chip at its centre so the logo's area fills too, then branch across the screen.
 *
 * `clear` lists areas no trace may enter (the intro's name, its line and the button
 * at its foot). On a phone the name's area spans the screen and would cut the board
 * in two, so an area with no way round it and room under it sends traces down from
 * its lower edge, like the pins of a chip. With no clear areas the board has no
 * holes at all.
 */
export function growSiteBoard(
  width: number,
  height: number,
  ring: Ring,
  seed: number,
  clear: Rect[] = [],
): Board {
  const pins = clear.flatMap((area): Root[] => {
    const y = area.y + area.h + 1;
    const wayRound = area.x > PITCH * 3 || area.x + area.w < width - PITCH * 3;
    if (wayRound || y + PITCH * 4 > height) return [];
    const count = Math.max(2, Math.floor(area.w / (PITCH * 2)));
    return Array.from({ length: count }, (_, i) => ({
      // On a grid node, so the trace leaves straight down with no kink.
      x:
        Math.round((area.x + ((i + 0.5) / count) * area.w - PITCH / 2) / PITCH) * PITCH + PITCH / 2,
      y,
      dir: 2,
      color: logoColorAt((i + 0.5) / count),
    }));
  });
  return growCircuit({
    width,
    height,
    pitch: PITCH,
    seed,
    roots: [
      ...ringRoots(ring.cx, ring.cy, ring.r, 22),
      ...ringRoots(ring.cx, ring.cy, ring.r * 0.2, 14),
      ...pins,
    ],
    blocked: clear.length
      ? (x, y) => clear.some((a) => x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h)
      : undefined,
    density: 0.14,
    reach: 9,
    // The band between the name and the button is a few steps deep: keep short traces there.
    ...(pins.length ? { minRoot: 5 } : {}),
  });
}

export const randomSeed = () => Math.floor(Math.random() * 2 ** 31);

export function replayIntro() {
  site.replay = true;
  if (location.pathname !== "/") goto("/");
}

export const SHORTCUT = ["KeyG", "KeyM", "KeyE"] as const;

/**
 * Watches keydowns for Ctrl+Shift+G, M, E pressed in order within `window` ms.
 * Returns true for an event that belongs to the shortcut, so the caller can stop
 * the browser acting on it.
 */
export function shortcutListener(onMatch: () => void, window = 1500) {
  let index = 0;
  let last = 0;
  return (event: Pick<KeyboardEvent, "code" | "ctrlKey" | "shiftKey" | "timeStamp">) => {
    if (!event.ctrlKey || !event.shiftKey) {
      index = 0;
      return false;
    }
    if (index > 0 && event.timeStamp - last > window) index = 0;
    if (event.code === SHORTCUT[index]) {
      index++;
      last = event.timeStamp;
      if (index === SHORTCUT.length) {
        index = 0;
        onMatch();
      }
      return true;
    }
    index = event.code === SHORTCUT[0] ? 1 : 0;
    last = event.timeStamp;
    return index === 1;
  };
}
