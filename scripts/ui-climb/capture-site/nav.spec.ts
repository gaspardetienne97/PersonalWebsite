// Getting around: the header, the language menu, the phone menu, keyboard focus, the footer.
import { expect, test } from "@playwright/test";
import { WIDTHS, settle, snap } from "../capture-common.ts";
import { returning, visit } from "./site.ts";

const FLOW = "nav";
// From 640px the header has its links and two tools, language then theme. On a phone it is the
// brand and one menu button, and the menu's panel holds the pages, the languages and the theme.
const tools = ".site-header .tools button";
const menuButton = ".site-header .actions > button";

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
        : "the header on the About page at phone width: logo and name, and one menu button that holds the pages, the language and the theme",
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

    if (width === "phone") {
      await page.locator(menuButton).click();
      await expect(page.getByRole("menu")).toBeVisible();
      await settle(page, 300);
      await snap(
        page,
        FLOW,
        "phone-menu",
        width,
        "the site menu open at phone width: a panel as wide as the screen with the pages (the current one marked), the languages and the theme switch, the page dimmed behind it",
      );
      // There is no separate language menu on a phone: the languages are rows of this panel.
      await page.getByRole("menuitemradio").first().focus();
      await settle(page, 200);
      await snap(
        page,
        FLOW,
        "language-menu",
        width,
        "the languages inside the phone menu: four languages, each named in itself, the current one with a check mark (keyboard focus on it)",
        { keepMouse: true },
      );
      await page.keyboard.press("Escape");
      await expect(page.getByRole("menu")).toHaveCount(0);
    } else {
      await page.locator(tools).nth(0).click();
      await expect(page.getByRole("menu")).toBeVisible();
      await settle(page, 300);
      await snap(
        page,
        FLOW,
        "language-menu",
        width,
        "the language menu open: four languages, each named in itself, the current one with a check mark",
      );
      await page.keyboard.press("Escape");
      await expect(page.getByRole("menu")).toHaveCount(0);

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

    // Closing a menu hands focus back to its button: let go of it, so the footer shot has no ring.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.evaluate(() =>
      window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }),
    );
    await settle(page);
    await snap(
      page,
      FLOW,
      "footer",
      width,
      "the footer: name and note, replay the intro, site links, projects, elsewhere, the owner sign-in link",
    );
  });
}

test("nav in French phone", async ({ page }) => {
  await returning(page, "phone", { locale: "fr" });
  await visit(page, "/studio");
  await page.locator(menuButton).click();
  await expect(page.getByRole("menu")).toBeVisible();
  await settle(page, 300);
  await snap(
    page,
    FLOW,
    "phone-menu",
    "phone",
    "the site menu open at phone width: pages, languages with a check mark on French, and the theme switch",
    { fr: true },
  );
  await page.locator('[role="menuitemradio"][aria-checked="true"]').focus();
  await settle(page, 200);
  await snap(
    page,
    FLOW,
    "language-menu",
    "phone",
    "the languages inside the phone menu, French with the check mark (keyboard focus on it)",
    { fr: true, keepMouse: true },
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.evaluate(() =>
    window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }),
  );
  await settle(page);
  await snap(page, FLOW, "footer", "phone", "the footer", { fr: true });
});
