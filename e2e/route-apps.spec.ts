import { expect, test } from "@playwright/test";

test("narrow site menu supports keyboard and pointer navigation", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/about");
  const trigger = page.getByRole("button", { name: "Site menu", exact: true });
  await trigger.click();
  for (const [name, href] of [
    ["Home", "/"],
    ["About", "/about"],
    ["Studio", "/studio"],
    ["Writing", "/blog"],
  ]) {
    await expect(page.getByRole("menuitem", { name, exact: true })).toHaveAttribute("href", href);
  }
  await expect(page.getByRole("menuitem", { name: "About", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Home", exact: true })).toBeFocused();
  for (const name of ["About", "Studio", "Writing"]) {
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitem", { name, exact: true })).toBeFocused();
  }
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL("/blog");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await trigger.click();
  await page.getByRole("menuitem", { name: "Studio", exact: true }).click();
  await expect(page).toHaveURL("/studio");
  // The sweep below measures the site chrome, so it runs on a bare page: the
  // content routes (/blog, /studio) and the /pdf app shell each overflow on
  // their own at these widths, which would mask a chrome regression.
  await page.goto("/demo");
  for (const width of [375, 320]) {
    await page.setViewportSize({ width, height: 812 });
    if (width === 320) {
      // On a phone the theme switch is a row of the site menu, and choosing it keeps the menu open.
      await trigger.click();
      await page.getByRole("menuitem", { name: "Toggle theme", exact: true }).click();
      await expect(page.locator("html")).toHaveClass(/dark/);
      await expect(page.getByRole("menu")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("menu")).toHaveCount(0);
    }
    await trigger.click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBe(0);
    await expect(page.getByRole("menuitem", { name: "Studio", exact: true })).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`site-menu-${width}.png`),
      animations: "disabled",
    });
    for (const name of ["Home", "About", "Studio", "Writing"]) {
      await expect
        .poll(() =>
          page.getByRole("menuitem", { name, exact: true }).evaluate((node) => {
            const rect = node.getBoundingClientRect();
            return node.contains(
              document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2),
            );
          }),
        )
        .toBe(true);
    }
    await page.keyboard.press("Escape");
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(trigger).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Site navigation", exact: true }),
  ).toBeVisible();
});

test("the intro plays on the first visit only, and the board stays as the background", async ({
  page,
}) => {
  await page.goto("/");
  const intro = page.getByRole("dialog", { name: "Introduction" });
  await expect(intro).toBeVisible();
  await page.getByRole("button", { name: "Animate the logo" }).click();
  await expect(page.getByRole("img", { name: "G M E" })).toBeVisible();
  await expect(intro.locator("path").first()).toBeAttached();
  await page.getByRole("button", { name: "Explore the site" }).click();
  await expect(intro).toHaveCount(0);
  await expect(
    page.getByRole("heading", { level: 1, name: "Gaspard Michel Etienne" }),
  ).toBeVisible();
  await expect(page.locator(".backdrop path").first()).toBeAttached();

  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: "Gaspard Michel Etienne" }),
  ).toBeVisible();
  await expect(intro).toHaveCount(0);
});

test("Ctrl+Shift+G, M, E replays the intro from any page", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gm.intro.seen", "1"));
  await page.goto("/about");
  await expect(page.locator(".backdrop path").first()).toBeAttached();
  await page.keyboard.down("Control");
  await page.keyboard.down("Shift");
  for (const key of ["G", "M", "E"]) await page.keyboard.press(key);
  await page.keyboard.up("Shift");
  await page.keyboard.up("Control");
  await expect(page).toHaveURL("/");
  const intro = page.getByRole("dialog", { name: "Introduction" });
  await expect(intro).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(intro).toHaveCount(0);
});

test("personal site links to route apps from Projects", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gm.intro.seen", "1"));
  await page.goto("/");

  await expect(page.getByRole("link", { name: "Narrator", exact: true }).first()).toHaveAttribute(
    "href",
    "/pdf",
  );
  await expect(page.getByRole("link", { name: "Woodshed", exact: true }).first()).toHaveAttribute(
    "href",
    "/music",
  );
});

test("the Studio's drawings open in a viewer you can step through", async ({ page }) => {
  await page.goto("/studio?type=drawings");
  await expect(page.getByRole("heading", { name: "Drawings" })).toBeVisible();
  await page.getByRole("button", { name: /Trace maze/ }).click();
  await expect(page.getByRole("dialog", { name: "Trace maze" })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("dialog", { name: "Lattice" })).toBeVisible();
});

test("narrator route app renders", async ({ page }) => {
  await page.goto("/pdf");

  await expect(page.getByRole("heading", { name: "narrator" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your Library" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Add document/ }).first()).toBeVisible();
  // Narrator runs full screen: no site header or footer, and its logo leads home.
  await expect(page.getByRole("navigation", { name: "Site navigation" })).toHaveCount(0);
  await expect(page.locator("footer[data-site-chrome]")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Back to Gaspard's site" })).toHaveAttribute(
    "href",
    "/",
  );
});

// The e2e preview runs without a database, so sign-in is off: the private page
// still sends you to sign in, and the sign-in page says it isn't set up.
test("the private page asks you to sign in", async ({ page }) => {
  await page.goto("/private");
  await expect(page).toHaveURL("/login?redirectTo=%2Fprivate");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByText("Sign-in isn't set up on this server yet.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Authentik" })).toHaveCount(0);
  expect((await page.request.get("/api/auth/get-session")).status()).toBe(503);
});
