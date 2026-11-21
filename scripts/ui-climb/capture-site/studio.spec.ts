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
      width === "desktop"
        ? "Studio, the wall: every piece of every kind as equal tiles (a picture, a title and one line), kinds as tabs, a wall or kinds switch"
        : "Studio, the wall on a phone: every piece of every kind as equal tiles, the kinds as chips that wrap, a wall or kinds switch",
      { full: true },
    );
    if (width === "desktop") {
      // A project is a link, a piece is a button: one of each, so both hover states show.
      await page.locator(".wall a.tile").first().hover();
      await settle(page, 350);
      await snap(
        page,
        "studio",
        "tile-hover",
        width,
        "Studio wall, pointer over a project tile with its cover",
        { keepMouse: true },
      );
      await page.locator(".wall button.tile").first().hover();
      await settle(page, 350);
      await snap(
        page,
        "studio",
        "tile-hover-drawing",
        width,
        "Studio wall, pointer over a drawing's tile (it opens in the viewer)",
        { keepMouse: true },
      );
      await page.mouse.move(640, 5);
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
      width === "desktop"
        ? "Studio, the kinds view: seven doors, one per kind, each with a peek at its pieces (no separate card for everything)"
        : "Studio, the kinds view on a phone: seven doors, one per kind, and no row of kind chips above them",
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
        ? 'the viewer opened on the first drawing (a tall one): title, the piece whole on its mat, previous and next arrows (on the first piece the left arrow shows it wraps round to the last), Zoom in, a counter that reads "Drawings, 1 of 9" and a strip of thumbnails'
        : 'the viewer opened on the first drawing (a tall one): title, the piece whole on its mat, Zoom in, a counter that reads "Drawings, 1 of 9" and a row of thumbnails',
    );
    await dialog.getByRole("button", { name: "Zoom in" }).click();
    await expect(dialog.locator(".zoombox")).toBeVisible();
    await settle(page, 600);
    await snap(
      page,
      "studio-viewer",
      "zoomed",
      width,
      "the viewer after Zoom in: the same drawing large in a box that scrolls, a hint that says to drag, a small locator showing which part is in view, and Zoom out to go back",
    );
    // Drag inside the zoomed picture: the locator's frame follows.
    const box = await dialog.locator(".zoombox").boundingBox();
    if (box) {
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x - 40, y - 160, { steps: 8 });
      await page.mouse.up();
      await settle(page, 400);
      await snap(
        page,
        "studio-viewer",
        "zoomed-panned",
        width,
        "the zoomed drawing after dragging it about 160 px: another part is in view and the locator's frame has moved with it",
      );
    }
    await dialog.getByRole("button", { name: "Zoom out" }).click();
    await expect(dialog.locator(".zoombox")).toHaveCount(0);
    for (let i = 0; i < 2; i++) await page.keyboard.press("ArrowRight");
    // The Zoom button was the last thing pressed: let go of it, so the shot has no focus ring.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
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
