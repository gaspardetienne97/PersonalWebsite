// Shared helpers for the UI hill climb captures. Each flow writes
//   .ui-climb/shots/<round>/<flow>/<state>--<desktop|phone>-<light|dark>.png
// and every state is shot in both themes at the current viewport.
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
