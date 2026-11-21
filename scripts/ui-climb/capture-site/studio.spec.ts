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
        : "Studio, the wall on a phone: a one-line introduction, the wall or kinds switch on the title's row, the kinds as equal chips in two rows of four, then every piece of every kind as equal tiles",
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
        'Studio wall, pointer over a project tile: it lifts with a shadow, its picture grows, the project\'s full line shows and the mark reads "Open"',
        { keepMouse: true },
      );
      await page.locator(".wall button.tile").first().hover();
      await settle(page, 350);
      await snap(
        page,
        "studio",
        "tile-hover-drawing",
        width,
        'Studio wall, pointer over a drawing\'s tile: it lifts with a shadow and the mark reads "View" (it opens in the viewer)',
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
        ? 'Studio, the kinds view: seven equal doors in one row, one per kind, each with a picture or icon and its count or "Soon" as a corner badge'
        : 'Studio, the kinds view on a phone: seven equal doors in two columns, each with its count or "Soon" as a corner badge, and no row of kind chips above them',
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
        ? 'the viewer opened on the first drawing (a tall one): title, the piece whole on its mat, a plain left arrow and a right arrow, a zoom control showing 1×, a counter that reads "Drawings, 1 of 9" with the strip of thumbnails'
        : 'the viewer opened on the first drawing (a tall one), filling the screen: title, the piece centred, a zoom control showing 1×, a bordered Close, a counter that reads "Drawings, 1 of 9" and a row of thumbnails with the current one in the middle',
    );
    if (width === "desktop") {
      // On the first piece the left arrow still points left; its tip says where it goes.
      await dialog.locator(".side .arrow.prev").hover();
      await settle(page, 400);
      await snap(
        page,
        "studio-viewer",
        "first-prev-tip",
        width,
        'the viewer on the first drawing, pointer over the left arrow: its tip reads "Last drawing"',
        { keepMouse: true },
      );
      await page.mouse.move(640, 5);
    }
    // The drag hint lasts 3 s, so each theme zooms in afresh and is shot at once.
    for (const theme of ["light", "dark"] as const) {
      await dialog.getByRole("button", { name: "Zoom in" }).click();
      await expect(dialog.locator(".zoombox")).toBeVisible();
      await expect(dialog.locator(".hint")).toBeVisible();
      await settle(page, 300);
      await snap(
        page,
        "studio-viewer",
        "zoomed",
        width,
        "the viewer after Zoom in: the same drawing large in a box that scrolls, a hint that says to drag, the zoom control showing 2×, and a small locator in the foot beside the counter showing which part is in view",
        { themes: [theme] },
      );
      if (theme === "light") {
        await dialog.getByRole("button", { name: "Zoom out" }).click();
        await expect(dialog.locator(".zoombox")).toHaveCount(0);
      }
    }
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
        "the zoomed drawing after dragging it about 160 px: the hint has gone, another part is in view and the locator's frame in the foot has moved with it",
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
