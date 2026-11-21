// The Studio: the wall, a kind's wall, the kinds view, an empty kind, and the viewer.
import { expect, test, type Page } from "@playwright/test";
import { WIDTHS, settle, snap } from "../capture-common.ts";
import { returning, visit } from "./site.ts";

/** The viewer's current piece, once its large picture has loaded whole. */
async function pieceShown(page: Page) {
  await expect(page.getByRole("dialog").locator("[data-current] img.large.whole")).toBeVisible({
    timeout: 30_000,
  });
  await settle(page, 600);
}

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
      // The second tile is a project, so its cover and the hover state both show.
      await page.locator(".wall .tile").nth(1).hover();
      await settle(page, 350);
      await snap(
        page,
        "studio",
        "tile-hover",
        width,
        "Studio wall, pointer over a project tile with its cover",
        { keepMouse: true },
      );
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
      "Studio wall for a kind with nothing in it yet (Music): the empty state and the way back to all the work",
    );
  });

  test(`studio viewer ${width}`, async ({ page }) => {
    await returning(page, width);
    await visit(page, "/studio?type=drawings");
    await page.locator(".wall button.tile").first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await pieceShown(page);
    await snap(
      page,
      "studio-viewer",
      "open",
      width,
      width === "desktop"
        ? 'the viewer opened on the first drawing (a tall one): title, the piece whole on its mat, previous and next arrows, Zoom in, a counter that reads "Drawings, 1 of 9" and a strip of thumbnails'
        : 'the viewer opened on the first drawing (a tall one): title, the piece whole on its mat, Zoom in and a counter that reads "Drawings, 1 of 9"',
    );
    await dialog.getByRole("button", { name: "Zoom in" }).click();
    await expect(dialog.locator(".zoombox")).toBeVisible();
    await settle(page, 600);
    await snap(
      page,
      "studio-viewer",
      "zoomed",
      width,
      "the viewer after Zoom in: the same drawing large, in a box that scrolls, with Zoom out to go back",
    );
    await dialog.getByRole("button", { name: "Zoom out" }).click();
    await expect(dialog.locator(".zoombox")).toHaveCount(0);
    for (let i = 0; i < 2; i++) await page.keyboard.press("ArrowRight");
    await pieceShown(page);
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
    await pieceShown(page);
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
  await pieceShown(page);
  await snap(page, "studio-viewer", "open", "phone", "the viewer opened on the first drawing", {
    fr: true,
  });
});
