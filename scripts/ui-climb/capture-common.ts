// Helpers shared by the site and Narrator captures (capture-site/, capture-narrator/).
// Shots go through `snap`, which writes the image, its caption, and an audit line when the
// page scrolls sideways. Console errors and page errors go to the same audit file:
//   <work>/rounds/<round>/audit/<project>.jsonl
// The audit is raw material for the round's bugs list; lines repeat when a run is repeated.
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { type Page } from "@playwright/test";
import {
  PROJECT,
  ROUND,
  VIEWPORTS,
  shot,
  startTheme,
  type ShotOptions,
  type Theme,
  type Width,
} from "./capture/lib.ts";

export { VIEWPORTS, type Width, type Theme };

/** The widths every flow is shot at. */
export const WIDTHS: Width[] = ["desktop", "phone"];

const AUDIT = join(PROJECT.dir, "rounds", ROUND, "audit", `${PROJECT.key}.jsonl`);

function audit(entry: Record<string, unknown>) {
  mkdirSync(dirname(AUDIT), { recursive: true });
  appendFileSync(AUDIT, `${JSON.stringify(entry)}\n`);
}

export type Locale = "en" | "fr";

/**
 * A fresh page at a width: viewport, the theme left on "system" (see lib.ts), the interface
 * language (Paraglide's cookie) and the audit listeners.
 */
export async function prepare(
  page: Page,
  width: Width,
  opts: { theme?: Theme; locale?: Locale; baseURL?: string } = {},
) {
  await page.setViewportSize(VIEWPORTS[width]);
  await startTheme(page, opts.theme ?? "light");
  if (opts.locale && opts.locale !== "en")
    await page.context().addCookies([
      {
        name: "PARAGLIDE_LOCALE",
        value: opts.locale,
        url: opts.baseURL ?? `http://localhost:${PROJECT.port}`,
      },
    ]);
  // One line per distinct error on this page, and one more when it keeps repeating.
  const seen = new Map<string, number>();
  const note = (kind: string, text: string) => {
    const url = page.url();
    const key = `${kind}|${url}|${text}`;
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    if (count === 1) audit({ kind, width, url, text });
    if (count === 50) audit({ kind, width, url, text, repeated: "50 times or more" });
  };
  page.on("console", (msg) => {
    if (msg.type() === "error") note("console", msg.text().slice(0, 400));
  });
  page.on("pageerror", (error) => note("pageerror", String(error).slice(0, 400)));
}

/** Wait for fonts and two frames, then a short beat for late layout. */
export async function settle(page: Page, ms = 250) {
  await page.evaluate(() => document.fonts?.ready.then(() => null));
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))),
  );
  await page.waitForTimeout(ms);
}

/**
 * Shoot a state in both themes with its caption. `fr` marks a French shot: the state name
 * gets "-fr" and the caption says so. Sideways overflow of the page is written to the audit.
 */
export async function snap(
  page: Page,
  flow: string,
  state: string,
  width: Width,
  caption: string,
  opts: ShotOptions & { fr?: boolean } = {},
) {
  const { fr, ...rest } = opts;
  const name = fr ? `${state}-fr` : state;
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    const extra = root.scrollWidth - root.clientWidth;
    if (extra <= 0) return null;
    // Name what sticks out furthest, to make the bug findable.
    let worst: { tag: string; cls: string; right: number } | null = null;
    for (const el of document.body.querySelectorAll<HTMLElement>("*")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.right <= root.clientWidth + 0.5) continue;
      if (!worst || r.right > worst.right)
        worst = {
          tag: el.tagName.toLowerCase(),
          cls: String(el.className).slice(0, 80),
          right: r.right,
        };
    }
    return { extra, worst };
  });
  if (overflow)
    audit({ kind: "overflow-x", flow, state: name, width, url: page.url(), ...overflow });
  await shot(page, flow, name, width, {
    ...rest,
    caption: fr ? `${caption} (interface in French)` : caption,
  });
}

/** Scroll an element to the middle of the viewport without smooth scrolling. */
export async function scrollTo(page: Page, selector: string) {
  await page
    .locator(selector)
    .first()
    .evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
  await settle(page, 150);
}

/** Set every running animation to `ms` into its timeline and hold it there (see lib.ts `freeze`). */
export async function freezeAt(page: Page, ms: number) {
  await page.evaluate((at) => {
    const held = document.getAnimations().filter((a) => a.playState === "running");
    for (const a of held) {
      a.currentTime = at;
      a.pause();
    }
    (window as unknown as Record<string, unknown>).__uiClimbFrozen = held;
  }, ms);
}

/** Wait until no finite animation or transition is still running (endless ones are ignored). */
export async function animationsDone(page: Page, timeout = 20_000) {
  await page.waitForFunction(
    () =>
      document
        .getAnimations()
        .every(
          (a) =>
            a.playState !== "running" ||
            a.effect?.getComputedTiming().iterations === Number.POSITIVE_INFINITY,
        ),
    undefined,
    { timeout },
  );
}
