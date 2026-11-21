// Helpers for the personal site captures.
//
// The site's circuit board is grown from a random seed (a new one per session, and per intro
// play). Captures pin it, so every round shoots the same board: a returning visitor gets the
// session seed the background reads (`gm.board.seed`), and a first visit gets a seeded
// Math.random for the board the intro grows. Nothing else about the page is touched.
import { expect, type Page } from "@playwright/test";
import { prepare, settle, type Locale, type Theme, type Width } from "../capture-common.ts";

/** localStorage key the intro sets once it has been seen (src/lib/components/site/intro.svelte.ts). */
export const SEEN_KEY = "gm.intro.seen";
const BOARD_SEED = "20261120";

/** A visitor who has already seen the intro, at a width. */
export async function returning(
  page: Page,
  width: Width,
  opts: { theme?: Theme; locale?: Locale } = {},
) {
  await prepare(page, width, opts);
  await page.addInitScript(
    ([seen, seed]) => {
      localStorage.setItem(seen, "1");
      sessionStorage.setItem("gm.board.seed", seed);
    },
    [SEEN_KEY, BOARD_SEED] as const,
  );
}

/** A first visit: nothing stored, and the intro's board grows from a fixed seed. */
export async function firstVisit(
  page: Page,
  width: Width,
  opts: { theme?: Theme; locale?: Locale } = {},
) {
  await prepare(page, width, opts);
  await page.addInitScript((seed) => {
    let s = Number(seed) >>> 0;
    // mulberry32, so the same board grows on every capture.
    Math.random = () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }, BOARD_SEED);
}

/** Open a site page and wait for its heading and the board behind it. */
export async function visit(page: Page, url: string, opts: { board?: boolean } = {}) {
  await page.goto(url);
  await expect(page.locator("main").first()).toBeVisible({ timeout: 60_000 });
  if (opts.board !== false)
    await expect(page.locator(".backdrop path").first()).toBeAttached({ timeout: 30_000 });
  // The board fades in over 0.6 s.
  await settle(page, 900);
}
