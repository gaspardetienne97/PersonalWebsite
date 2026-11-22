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

/** Walk down the page and back, so images that load lazily are in before a full-page shot. */
async function loadWholePage(page: Page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += innerHeight) {
      window.scrollTo({ top: y, behavior: "instant" });
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo({ top: 0, behavior: "instant" });
  });
  await page.waitForFunction(() => [...document.images].every((img) => img.complete));
  await settle(page);
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
        'first visit, the logo intro covers the page and waits: a ring ripples out from the logo, the name and the role line sit under it (any press, key or scroll starts it), and "Skip intro" goes straight to the site',
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
        'first visit, the intro once it has played: the initials, the name and the "Explore the site" button, over the grown circuit board (it stays until the visitor leaves it)',
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
    await loadWholePage(page);
    await snap(
      page,
      FLOW,
      "home",
      width,
      width === "phone"
        ? 'home page for a returning visitor (no intro): name, role line and the introduction paragraph, then "Newest", a reel with one slide for each kind that holds work (only the next slide\'s picture peeks in), then one door per kind in two columns and a closing row of ways on'
        : 'home page for a returning visitor (no intro): name, role line and introduction beside "Newest", a reel with one slide for each kind that holds work (only the next slide\'s picture peeks in), then one door per kind in one row and a closing row of ways on',
      { full: true },
    );
    // The reel moves by its arrows, its dots or a swipe. It never moves by itself.
    await page.getByRole("button", { name: "Next piece" }).click();
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await settle(page, 700);
    await snap(
      page,
      FLOW,
      "home-reel-next",
      width,
      "home page after one press of the reel's next arrow: the second slide is in front, its position mark is marked and the previous arrow is now live",
    );
    await page.getByRole("button", { name: "Next piece" }).click();
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await settle(page, 700);
    await snap(
      page,
      FLOW,
      "home-reel-last",
      width,
      "home page, the reel at its last slide after two presses of the next arrow",
    );
    if (width === "desktop") {
      // Each position mark names its kind in a tip.
      await page.locator(".reel .pip").nth(1).hover();
      await settle(page, 350);
      await snap(
        page,
        FLOW,
        "home-reel-pip-tip",
        width,
        "home page, pointer over the reel's second position mark: a tip names the kind it stands for",
        { keepMouse: true },
      );
      await page.mouse.move(0, 0);
    }
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
      width === "phone"
        ? "home page scrolled to 'Everything': one equal door per kind of work in two columns, each with its count or \"Soon\" as a badge in the cell's corner, then the closing row"
        : "home page scrolled to 'Everything': one equal door per kind of work, all eight in one row, each with its count or \"Soon\" as a badge in the cell's corner, then the closing row",
    );
    if (width === "desktop") {
      // Pointer over a door.
      const door = page.locator(".doors .door").first();
      await door.hover();
      await settle(page, 350);
      await snap(page, FLOW, "home-door-hover", width, "home page, pointer over the first door", {
        keepMouse: true,
      });
      // An empty door keeps its sentence in a tip, shown on hover and keyboard focus.
      await page.locator('.doors a[href*="type=doodles"]').hover();
      await settle(page, 350);
      await snap(
        page,
        FLOW,
        "home-door-tip",
        width,
        "home page, pointer over an empty door (Doodles): a tip says what will go there",
        { keepMouse: true },
      );
    }
  });
}

test("home returning visit in French phone", async ({ page }) => {
  await returning(page, "phone", { locale: "fr" });
  await visit(page, "/");
  await loadWholePage(page);
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

// Reduced motion: no ripple and no growing board. The first press shows the initials and the
// name at once.
for (const width of WIDTHS) {
  test(`home first visit, reduced motion ${width}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await firstVisit(page, width);
    await page.goto("/");
    const intro = page.getByRole("dialog", { name: "Introduction" });
    await expect(intro).toBeVisible();
    await settle(page, 800);
    // A press anywhere but a button starts it. One before the page hydrates is lost, so it is
    // tried again; a press once the board is there does nothing.
    await expect(async () => {
      await page.mouse.click(40, 300);
      await expect(intro).toHaveClass(/revealed/, { timeout: 1500 });
    }).toPass({ timeout: 20_000 });
    await settle(page, 400);
    await snap(
      page,
      FLOW,
      "intro-reduced-motion",
      width,
      "first visit with reduced motion turned on, after a press anywhere on the screen: the initials, the name and the board are there at once, with no animation",
    );
  });
}
