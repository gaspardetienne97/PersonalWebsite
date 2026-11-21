// Getting around: the header, the language menu, the phone menu, keyboard focus, the footer.
import { expect, test } from "@playwright/test";
import { WIDTHS, settle, snap } from "../capture-common.ts";
import { returning, visit } from "./site.ts";

const FLOW = "nav";
// The header's controls in order: on a phone the site menu comes first, then language, then theme.
const controls = ".site-header .actions > button";

for (const width of WIDTHS) {
  test(`nav ${width}`, async ({ page }) => {
    await returning(page, width);
    await visit(page, "/about");
    await snap(
      page,
      FLOW,
      "header",
      width,
      width === "desktop"
        ? "the header on the About page: logo and name, the four links with the current page marked, language and theme buttons"
        : "the header on the About page at phone width: logo and name, a Menu button, language and theme buttons",
    );

    await page.evaluate(() => window.scrollTo({ top: 520, behavior: "instant" }));
    await settle(page);
    await snap(
      page,
      FLOW,
      "header-scrolled",
      width,
      "the header staying on top while the page scrolls",
    );
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));

    const language = page.locator(controls).nth(width === "phone" ? 1 : 0);
    await language.click();
    await expect(page.getByRole("menu")).toBeVisible();
    await settle(page, 300);
    await snap(
      page,
      FLOW,
      "language-menu",
      width,
      "the language menu open: four languages, each named in itself, the current one ticked",
    );
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);

    if (width === "phone") {
      await page.locator(controls).first().click();
      await expect(page.getByRole("menu")).toBeVisible();
      await settle(page, 300);
      await snap(
        page,
        FLOW,
        "phone-menu",
        width,
        "the site menu open at phone width, the current page marked",
      );
      await page.keyboard.press("Escape");
      await expect(page.getByRole("menu")).toHaveCount(0);
    } else {
      // Keyboard: Tab to the second nav link so the focus ring shows.
      await page.locator(".site-header .brand").focus();
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      await settle(page, 200);
      await snap(
        page,
        FLOW,
        "keyboard-focus",
        width,
        "the header with keyboard focus on a nav link (reached with Tab)",
        {
          keepMouse: true,
        },
      );
    }

    await page.evaluate(() =>
      window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }),
    );
    await settle(page);
    await snap(
      page,
      FLOW,
      "footer",
      width,
      "the footer: name and note, replay the intro, site links, projects, elsewhere, the private link",
    );
  });
}

test("nav in French phone", async ({ page }) => {
  await returning(page, "phone", { locale: "fr" });
  await visit(page, "/studio");
  await page.locator(controls).first().click();
  await expect(page.getByRole("menu")).toBeVisible();
  await settle(page, 300);
  await snap(page, FLOW, "phone-menu", "phone", "the site menu open at phone width", { fr: true });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.locator(controls).nth(1).click();
  await expect(page.getByRole("menu")).toBeVisible();
  await settle(page, 300);
  await snap(page, FLOW, "language-menu", "phone", "the language menu open, French ticked", {
    fr: true,
  });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.evaluate(() =>
    window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }),
  );
  await settle(page);
  await snap(page, FLOW, "footer", "phone", "the footer", { fr: true });
});
