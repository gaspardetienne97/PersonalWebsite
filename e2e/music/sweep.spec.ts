// Every music route at phone and laptop widths, both themes: loads with its
// h1, no console errors, no horizontal page overflow. Screenshots for review.
import { expect, test } from "@playwright/test";

const ROUTES = [
  "/music",
  "/music?tab=drills",
  "/music?tab=paths",
  "/music/ear/intervals",
  "/music/ear/scale-degrees",
  "/music/reading",
  "/music/rhythm",
  "/music/scales",
  "/music/two-hand",
  "/music/comping",
  "/music/voicings",
  "/music/licks",
  "/music/chord-scales",
  "/music/fretboard",
  "/music/chords",
  "/music/strum",
  "/music/pads",
  "/music/aerophone",
  "/music/lab",
  "/music/jam",
  "/music/library",
  "/music/library?tab=reference",
  "/music/library?tab=import",
  "/music/create",
  "/music/create?mode=roll",
  "/music/record",
  "/music/progress",
  "/music/progress?view=skills",
  "/music/progress?view=sessions",
  "/music/journal",
  "/music/connect",
  "/music/tuner",
  "/music/tuner?mode=drone",
  "/music/settings",
  "/music/guide",
];

const slug = (r: string) => r.replace(/^\/music\/?/, "").replace(/[?=&/]/g, "-") || "today";

for (const width of [375, 1280]) {
  for (const theme of ["light", "dark"] as const) {
    test(`all routes at ${width} ${theme}`, async ({ page }) => {
      test.setTimeout(240_000);
      await page.setViewportSize({ width, height: width < 600 ? 812 : 900 });
      await page.addInitScript((t) => localStorage.setItem("mode-watcher-mode", t), theme);
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(`${page.url()}: ${e.message}`));
      page.on("console", (m) => m.type() === "error" && errors.push(`${page.url()}: ${m.text()}`));
      for (const route of ROUTES) {
        await page.goto(route);
        await expect(page.locator("h1").first()).toBeVisible();
        await page.waitForTimeout(300);
        const { sw, iw } = await page.evaluate(() => ({
          sw: document.documentElement.scrollWidth,
          iw: innerWidth,
        }));
        expect.soft(sw, `${route} overflows at ${width}`).toBeLessThanOrEqual(iw);
        await page.screenshot({
          path: `docs/screenshots/rebuild/sweep/${slug(route)}-${width}-${theme}.png`,
        });
      }
      // Sample loading needs the network; a failed fetch there is not an app error.
      expect(errors.filter((e) => !/tonejs\.github\.io|Failed to load resource/.test(e))).toEqual(
        [],
      );
    });
  }
}
