// Home: the logo intro on a first visit (waiting, mid-play, settled), the page it leaves
// behind, and the page a returning visitor gets.
import { expect, test, type Page } from "@playwright/test";
import { freeze, thaw } from "../capture/lib.ts";
import { WIDTHS, animationsDone, freezeAt, scrollTo, settle, snap } from "../capture-common.ts";
import { firstVisit, returning, visit } from "./site.ts";

const FLOW = "home";

/** Press the logo and see the board start to grow. A press before the page hydrates is lost, so
 *  it is tried again; one that was heard is never repeated (a second press folds the logo back). */
async function pressLogo(page: Page) {
  const intro = page.getByRole("dialog");
  await expect(async () => {
    await intro.locator("button.mark").click({ force: true });
    await expect(intro).toHaveClass(/grown/, { timeout: 1500 });
  }).toPass({ timeout: 20_000 });
}

for (const width of WIDTHS) {
  // The theme switch (mode-watcher) cuts running transitions short, so the two moments shot
  // mid-animation get one run per theme instead of a switch in place.
  for (const theme of ["light", "dark"] as const) {
    test(`home first visit ${width} ${theme}`, async ({ page }) => {
      await firstVisit(page, width, { theme });
      await page.goto("/");
      const intro = page.getByRole("dialog", { name: "Introduction" });
      await expect(intro).toBeVisible();
      await settle(page, 800);

      // The ring ripples while it waits: hold the ripple part-way out so it shows.
      await freezeAt(page, 1500);
      await snap(
        page,
        FLOW,
        "intro-waiting",
        width,
        "first visit, the logo intro covers the page and waits to be pressed, a ring ripples out from the logo",
        { frozen: true, themes: [theme] },
      );
      await thaw(page);

      // Press the logo: the board grows from its ring and the logo unfolds into G M E.
      await pressLogo(page);
      await page.waitForTimeout(800);
      await freeze(page);
      await snap(
        page,
        FLOW,
        "intro-mid-play",
        width,
        "first visit, just under a second after pressing the logo: the circuit board is growing out of the ring and the logo is unfolding into the initials G M E (animation caught mid-way)",
        { frozen: true, themes: [theme] },
      );
      await thaw(page);
      if (theme === "dark") return;

      await expect(intro).toHaveClass(/revealed/, { timeout: 15_000 });
      await animationsDone(page);
      await settle(page, 300);
      await snap(
        page,
        FLOW,
        "intro-settled",
        width,
        "first visit, the intro once it has played: the initials, the name and a pulsing arrow to enter the site, over the grown circuit board",
      );

      await page.getByRole("button", { name: "Explore the site" }).click();
      await expect(intro).toHaveCount(0);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await settle(page, 900);
      await snap(
        page,
        FLOW,
        "home-after-intro",
        width,
        "the home page just after the intro lifts away, the board it grew stays behind the page",
      );
    });
  }

  test(`home returning visit ${width}`, async ({ page }) => {
    await returning(page, width);
    await visit(page, "/");
    await snap(
      page,
      FLOW,
      "home",
      width,
      "home page for a returning visitor (no intro): name and introduction, the newest post and piece",
      { full: true },
    );
    await scrollTo(page, "#everything-heading");
    await page.locator("#everything-heading").evaluate((el) => {
      window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - 96, behavior: "instant" });
    });
    await settle(page);
    await snap(
      page,
      FLOW,
      "home-doors",
      width,
      "home page scrolled to 'Everything': one door per kind of work (drawings, music, projects, writing and so on)",
    );
    if (width === "desktop") {
      // Pointer over a door.
      const door = page.locator(".doors .door").first();
      await door.hover();
      await settle(page, 350);
      await snap(page, FLOW, "home-door-hover", width, "home page, pointer over the first door", {
        keepMouse: true,
      });
    }
  });
}

test("home returning visit in French phone", async ({ page }) => {
  await returning(page, "phone", { locale: "fr" });
  await visit(page, "/");
  await snap(page, FLOW, "home", "phone", "home page for a returning visitor", {
    full: true,
    fr: true,
  });
});

test("home first visit in French phone", async ({ page }) => {
  await firstVisit(page, "phone", { locale: "fr" });
  await page.goto("/");
  const intro = page.getByRole("dialog");
  await expect(intro).toBeVisible();
  await settle(page, 800);
  await pressLogo(page);
  await expect(intro).toHaveClass(/revealed/, { timeout: 15_000 });
  await animationsDone(page);
  await settle(page, 300);
  await snap(
    page,
    FLOW,
    "intro-settled",
    "phone",
    "first visit, the intro once it has played: initials, name, role line and the arrow into the site",
    { fr: true },
  );
});
