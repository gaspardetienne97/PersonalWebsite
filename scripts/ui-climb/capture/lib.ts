// Shared helpers for the UI hill climb captures. Each flow writes
//   .ui-climb/shots/<round>/<flow>/<state>--<desktop|tablet|phone>-<light|dark>.png
// and every state is shot in both themes at the current viewport. Tablet tests (a title
// ending "tablet") run in the config's touch project, so the context has `hasTouch`.
//
// Theme: the app uses mode-watcher (localStorage `mode-watcher-mode`, default "system").
// `startTheme` keeps the mode on "system" and drives `prefers-color-scheme`, so `shot`
// flips the theme the way the app itself would (mode-watcher applies `.dark`, its
// icons and `color-scheme`), with CSS transitions held off so no frame is mid-fade.
// If a page stored an explicit mode, `shot` falls back to toggling the class in place.
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, type Page } from "@playwright/test";

export const ROUND = process.env.UI_CLIMB_ROUND ?? "0";
export const OUT = resolve(import.meta.dirname, "../../../.ui-climb/shots", ROUND);

export const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  /** Tablet landscape, with touch (see playwright.capture.config.ts). */
  tablet: { width: 1180, height: 820 },
  phone: { width: 390, height: 844 },
} as const;
export type Width = keyof typeof VIEWPORTS;
export type Theme = "light" | "dark";

/** Intro lessons on or off for this context (the e2e suite turns them off). */
export async function lessons(page: Page, on: boolean) {
  await page.addInitScript((v) => localStorage.setItem("woodshed.lessons", v), on ? "on" : "off");
}

/** Start in a theme; `shot` flips it in place to capture the other one. */
export async function startTheme(page: Page, theme: Theme = "light") {
  await page.addInitScript(() => localStorage.setItem("mode-watcher-mode", "system"));
  await page.emulateMedia({ colorScheme: theme });
}

const NO_TRANSITIONS = "ui-climb-no-transitions";

async function holdTransitions(page: Page, on: boolean) {
  await page.evaluate(
    ([id, on]) => {
      document.getElementById(id as string)?.remove();
      if (!on) return;
      const s = document.createElement("style");
      s.id = id as string;
      s.textContent = "*,*::before,*::after{transition:none!important}";
      document.head.appendChild(s);
    },
    [NO_TRANSITIONS, on] as const,
  );
}

async function currentTheme(page: Page): Promise<Theme> {
  return page.evaluate(() =>
    document.documentElement.classList.contains("dark") ? "dark" : "light",
  );
}

async function setTheme(page: Page, theme: Theme) {
  const stored = await page.evaluate(() => localStorage.getItem("mode-watcher-mode"));
  if (stored === null || stored === "system") {
    await page.emulateMedia({ colorScheme: theme });
    try {
      await expect
        .poll(() => currentTheme(page), { timeout: 2000, intervals: [30, 60, 120] })
        .toBe(theme);
    } catch {
      // mode-watcher did not follow the media query (no watcher on this page): flip by hand.
    }
  }
  if ((await currentTheme(page)) !== theme) {
    await page.evaluate((t) => {
      const el = document.documentElement;
      el.classList.toggle("dark", t === "dark");
      el.style.colorScheme = t;
    }, theme);
  }
  // Two frames so styles, canvases and the theme icon settle.
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))),
  );
  await page.waitForTimeout(60);
}

/**
 * Screenshot the current state in light and dark at the current viewport.
 * `full` also writes a full-page shot for long pages.
 */
export async function shot(
  page: Page,
  flow: string,
  state: string,
  width: Width,
  opts: { full?: boolean; themes?: Theme[] } = {},
) {
  const dir = join(OUT, flow);
  mkdirSync(dir, { recursive: true });
  await page.evaluate(() => document.fonts?.ready.then(() => null));
  // Park the mouse on an empty strip of the top bar so no stale hover state is shot.
  const vp = page.viewportSize();
  if (vp) await page.mouse.move(Math.floor(vp.width * 0.6), 1);
  const original = await currentTheme(page);
  await holdTransitions(page, true);
  try {
    for (const theme of opts.themes ?? ["light", "dark"]) {
      await setTheme(page, theme);
      await page.screenshot({ path: join(dir, `${state}--${width}-${theme}.png`) });
      if (opts.full)
        await page.screenshot({
          path: join(dir, `${state}--${width}-${theme}-full.png`),
          fullPage: true,
        });
    }
    await setTheme(page, original);
  } finally {
    await holdTransitions(page, false).catch(() => {});
  }
}

/** Go to a music route and wait until it has rendered (the app renders on the client). */
export async function open(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator("h1").first()).toBeVisible({ timeout: 60_000 });
  await page.evaluate(() => document.fonts?.ready.then(() => null));
  await page.waitForTimeout(400);
}

/**
 * Back to the setup screen from a session (a lesson, a run or its results own the screen
 * there, and the mode, tabs and setup are hidden). Fails if the session will not close.
 */
export async function leaveSession(page: Page) {
  const session = page.locator("[data-session]");
  const close = page.getByRole("button", { name: "Close and back to setup" });
  for (let i = 0; i < 4 && (await session.count()); i++) {
    if (await close.isVisible()) await close.click();
    else await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
  }
  await expect(session, "the session (lesson, run or results) did not close").toHaveCount(0);
}

/** The ready screen's setup sentence: the way into Setup, where Practice or Check lives. It carries the
 *  mode as `data-mode` when the drill has both. */
const setupLine = (page: Page) => page.getByTestId("setup-line");
const modeGroup = (page: Page) => page.locator('[data-setup="run-mode"]');

/** Open Setup from the setup sentence (or close it); nothing when it already is, or the drill has none. */
export async function openSetup(page: Page, open = true) {
  const line = setupLine(page);
  const now = await line.getAttribute("aria-expanded", { timeout: 2000 }).catch(() => null);
  if (now !== null && now !== String(open)) await line.click();
}

/** Whether the drill has Practice and Check (asked from the setup screen). */
export async function hasCheck(page: Page) {
  await leaveSession(page);
  return (await setupLine(page).getAttribute("data-mode")) !== null;
}

/**
 * Leave any session, then switch to `m` (in Setup) and see the setup sentence say so, with Setup
 * closed again. A click before the page hydrates is lost, and Check can open its concept lesson
 * (closed on the retry), so this retries until the sentence shows `m`. A drill without the two
 * modes is Practice only.
 */
export async function mode(page: Page, m: "Practice" | "Check") {
  const line = setupLine(page);
  await expect(async () => {
    await leaveSession(page);
    const now = await line.getAttribute("data-mode", { timeout: 2000 });
    if (now === null && m === "Practice") return;
    if (now !== m.toLowerCase()) {
      await openSetup(page);
      await modeGroup(page).getByRole("button", { name: m, exact: true }).click({ timeout: 2000 });
    }
    await expect(line).toHaveAttribute("data-mode", m.toLowerCase(), { timeout: 1000 });
    await openSetup(page, false);
  }, `could not switch the drill to ${m}`).toPass({ timeout: 20_000 });
}

/** A seeded number in [0, 1) for `i` (mulberry32), so every capture plays the same. */
function rand(i: number) {
  let t = (i * 0x6d2b79f5 + 0x9e3779b9) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
}

/** A player's few ms off the beat for hit `i`: 3 to 12 ms early or late, inside on time. */
export function jitter(i: number) {
  const r = rand(i);
  return (r < 0.5 ? -1 : 1) * (3 + Math.floor(((r * 2) % 1) * 10));
}

/** A player's think before answer `i` (0.8 to 1.8 s by default), so answer times do not read 0.1 s. */
export async function think(page: Page, i: number, [lo, hi] = [800, 1800]) {
  await page.waitForTimeout(lo + Math.round(rand(i + 7919) * (hi - lo)));
}
