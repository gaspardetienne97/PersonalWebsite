/**
 * Shared state for the logo intro and the circuit board behind the site.
 *
 * The intro plays on a visitor's first visit to the home page, or again when
 * someone types the shortcut (hold Ctrl and Shift, then press G, M, E). Whatever
 * board the intro grew stays on as the site background.
 */
import { goto } from "$app/navigation";
import { growCircuit, ringRoots, type Board } from "#lib/circuit/router.ts";

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

/**
 * The site's board: traces fan out from the logo's ring, and from a small hidden
 * chip at its centre so the logo's area fills too, then branch across the screen. Nothing is kept clear: the letters and text
 * sit on a frosted veil over the traces instead, so the board has no holes when it
 * becomes the background.
 */
export function growSiteBoard(width: number, height: number, ring: Ring, seed: number): Board {
  return growCircuit({
    width,
    height,
    pitch: PITCH,
    seed,
    roots: [
      ...ringRoots(ring.cx, ring.cy, ring.r, 22),
      ...ringRoots(ring.cx, ring.cy, ring.r * 0.2, 14),
    ],
    density: 0.14,
    reach: 9,
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
