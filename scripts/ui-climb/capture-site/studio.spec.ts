// The Studio: the wall, a kind's wall, the kinds view, an empty kind, and the viewer.
import { expect, test } from "@playwright/test";
import { WIDTHS, settle, snap } from "../capture-common.ts";
import { returning, visit } from "./site.ts";

for (const width of WIDTHS) {
  test(`studio ${width}`, async ({ page }) => {
    await returning(page, width);
    await visit(page, "/studio");
    await snap(
      page,
      "studio",
      "wall",
      width,
      "Studio, the wall: every piece of every kind as equal tiles, kinds as tabs, a wall or kinds switch",
      { full: true },
    );
    if (width === "desktop") {
      await page.locator(".wall .tile").nth(4).hover();
      await settle(page, 350);
      await snap(page, "studio", "tile-hover", width, "Studio wall, pointer over a tile", {
        keepMouse: true,
      });
    }
    await visit(page, "/studio?type=drawings");
    await snap(page, "studio", "wall-drawings", width, "Studio wall showing one kind, Drawings");
    await visit(page, "/studio?type=projects");
    await snap(
      page,
      "studio",
      "wall-projects",
      width,
      "Studio wall showing one kind, Projects (tiles link to the apps)",
    );
    await visit(page, "/studio?view=kinds");
    await snap(
      page,
      "studio",
      "kinds",
      width,
      "Studio, the kinds view: one card per kind with a peek at its pieces",
      { full: true },
    );
    await visit(page, "/studio?type=music");
    await snap(
      page,
      "studio",
      "empty-kind",
      width,
      "Studio wall for a kind with nothing in it yet (Music): the empty state",
    );
  });

  test(`studio viewer ${width}`, async ({ page }) => {
    await returning(page, width);
    await visit(page, "/studio?type=drawings");
    await page.locator(".wall button.tile").first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("img").first()).toBeVisible();
    await dialog.locator("img").first().evaluate((img: HTMLImageElement) => img.decode().catch(() => {}));
    await settle(page, 600);
    await snap(
      page,
      "studio-viewer",
      "open",
      width,
      "the viewer opened on the first drawing (a tall one): title, kind, the piece, previous and next arrows, position",
    );
    for (let i = 0; i < 2; i++) await page.keyboard.press("ArrowRight");
    await settle(page, 900);
    await dialog.locator("img").nth(2).evaluate((img: HTMLImageElement) => img.decode().catch(() => {}));
    await settle(page, 300);
    await snap(
      page,
      "studio-viewer",
      "wide",
      width,
      "the viewer two pieces on (a wide drawing), after pressing the right arrow twice",
    );
    // From the full wall the viewer steps through every kind.
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await visit(page, "/studio");
    await page.locator(".wall button.tile").nth(3).click();
    await expect(dialog).toBeVisible();
    await settle(page, 900);
    await snap(
      page,
      "studio-viewer",
      "from-wall",
      width,
      "the viewer opened from the full wall on the fourth piece",
    );
  });
}

test("studio in French phone", async ({ page }) => {
  await returning(page, "phone", { locale: "fr" });
  await visit(page, "/studio");
  await snap(page, "studio", "wall", "phone", "Studio, the wall", { fr: true });
  await visit(page, "/studio?view=kinds");
  await snap(page, "studio", "kinds", "phone", "Studio, the kinds view", { fr: true });
  await visit(page, "/studio?type=music");
  await snap(page, "studio", "empty-kind", "phone", "Studio wall for an empty kind", { fr: true });
  await visit(page, "/studio?type=drawings");
  await page.locator(".wall button.tile").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await settle(page, 900);
  await snap(page, "studio-viewer", "open", "phone", "the viewer opened on the first drawing", {
    fr: true,
  });
});
