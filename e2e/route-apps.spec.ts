import { expect, test } from "@playwright/test";

test("narrow site menu supports keyboard and pointer navigation", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/pdf");
  const trigger = page.getByRole("button", { name: "Site menu", exact: true });
  await trigger.click();
  for (const [name, href] of [
    ["Home", "/"],
    ["About", "/about"],
    ["Gallery", "/gallery"],
    ["Blog", "/blog"],
    ["Music", "/music"],
    ["Narrator", "/pdf"],
  ]) {
    await expect(page.getByRole("menuitem", { name, exact: true })).toHaveAttribute("href", href);
  }
  await expect(page.getByRole("menuitem", { name: "Narrator", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Home", exact: true })).toBeFocused();
  for (const name of ["About", "Gallery", "Blog", "Music", "Narrator"]) {
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitem", { name, exact: true })).toBeFocused();
  }
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL("/pdf");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await trigger.click();
  await page.getByRole("menuitem", { name: "Blog", exact: true }).click();
  await expect(page).toHaveURL("/blog");
  // The sweep below measures the site chrome, so it runs on a bare page: the
  // content routes (/blog, /gallery) and the /pdf app shell each overflow on
  // their own at these widths, which would mask a chrome regression.
  await page.goto("/demo");
  for (const width of [375, 320]) {
    await page.setViewportSize({ width, height: 812 });
    if (width === 320) {
      await page.getByRole("button", { name: "Toggle theme", exact: true }).click();
      await expect(page.locator("html")).toHaveClass(/dark/);
    }
    await trigger.click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBe(0);
    await expect(page.getByRole("menuitem", { name: "Narrator", exact: true })).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`site-menu-${width}.png`),
      animations: "disabled",
    });
    for (const name of ["Home", "About", "Gallery", "Blog", "Narrator"]) {
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

test("personal site links to route apps", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /welcome/i })).toBeVisible();
  await expect(page.getByRole("link", { name: "Narrator" })).toHaveAttribute("href", "/pdf");
});

test("narrator route app renders", async ({ page }) => {
  await page.goto("/pdf");

  await expect(page.getByRole("heading", { name: "narrator" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your Library" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Add document/ }).first()).toBeVisible();
});
