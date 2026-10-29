// Intro lessons in the drill frame (lessons are on here; the other suites switch them off).
import { expect, test, type Page } from "@playwright/test";
import { expectNoHorizontalOverflow } from "./fixtures";

test.use({ storageState: { cookies: [], origins: [] } });

const URL = "/music/circle?mode=order";
const lessonHeading = (page: Page) => page.getByRole("heading", { name: "The order of sharps" });
const start = (page: Page) => page.getByRole("button", { name: "Start", exact: true });

/** Records whether the lesson ever appears, so a flash before the stored settings arrive is caught. */
async function watchForLesson(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __lessonFlashed: boolean }).__lessonFlashed = false;
    // Stored settings arrive late (IndexedDB success events delayed), the case a flash needs.
    const add = IDBRequest.prototype.addEventListener;
    IDBRequest.prototype.addEventListener = function (
      this: IDBRequest,
      type: string,
      fn: never,
      ...rest: never[]
    ) {
      if (type !== "success") return add.call(this, type, fn, ...rest);
      return add.call(
        this,
        type,
        ((e: Event) => setTimeout(() => (fn as (e: Event) => void)(e), 400)) as never,
        ...rest,
      );
    } as typeof add;
    const desc = Object.getOwnPropertyDescriptor(IDBRequest.prototype, "onsuccess")!;
    Object.defineProperty(IDBRequest.prototype, "onsuccess", {
      set(fn) {
        desc.set!.call(this, fn && ((e: Event) => setTimeout(() => fn.call(this, e), 400)));
      },
      get: desc.get,
    });
    new MutationObserver(() => {
      if (document.querySelector("[data-testid=lesson]"))
        (window as unknown as { __lessonFlashed: boolean }).__lessonFlashed = true;
    }).observe(document, { childList: true, subtree: true });
  });
}
const flashed = (page: Page) =>
  page.evaluate(() => (window as unknown as { __lessonFlashed: boolean }).__lessonFlashed);

/** Next until the last screen's "Start the quiz" shows. */
async function toEnd(page: Page) {
  const done = page.getByRole("button", { name: "Start the quiz" });
  for (let i = 0; i < 40 && !(await done.isVisible()); i++)
    await page.getByRole("button", { name: "Next", exact: true }).click();
  return done;
}

test.describe("intro lessons", () => {
  test.beforeEach(async ({ page }) => {
    await page.routeWebSocket(/\/\?token=|vite-hmr/, () => {});
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  test("first visit shows the lesson, not the stage", async ({ page }) => {
    await page.goto(URL);
    await expect(lessonHeading(page)).toBeVisible();
    await expect(start(page)).toHaveCount(0);
  });

  test("Space does nothing on a lesson; arrows move", async ({ page }) => {
    await page.goto(URL);
    await expect(lessonHeading(page)).toBeVisible();
    await page.keyboard.press("Space");
    await expect(lessonHeading(page)).toBeVisible();
    await expect(page.getByRole("button", { name: /^Stop/ })).toHaveCount(0);
    await page.keyboard.press("ArrowRight");
    await expect(page.getByText("Tap Next", { exact: false }).first()).toBeVisible();
    for (let i = 0; i < 7; i++) await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("heading", { name: "Flats run backwards" })).toBeVisible();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect(lessonHeading(page)).toBeVisible();
  });

  test("finishing lands in Practice and is remembered", async ({ page }) => {
    await page.goto(URL);
    await (await toEnd(page)).click();
    await expect(start(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "Practice", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await watchForLesson(page);
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(start(page)).toBeVisible();
    expect(await flashed(page), "the lesson flashed before settings loaded").toBe(false);
  });

  test("skip marks it seen", async ({ page }) => {
    await page.goto(URL);
    await page.getByRole("button", { name: "Skip, I know this" }).click();
    await expect(start(page)).toBeVisible();
    await watchForLesson(page);
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(start(page)).toBeVisible();
    expect(await flashed(page), "the lesson flashed before settings loaded").toBe(false);
  });

  test("the Lesson button brings it back", async ({ page }) => {
    await page.goto(URL);
    await page.getByRole("button", { name: "Skip, I know this" }).click();
    await page.getByRole("button", { name: "Lesson", exact: true }).click();
    await expect(lessonHeading(page)).toBeVisible();
  });

  test("changing tab swaps the lesson", async ({ page }) => {
    await page.goto(URL);
    await expect(lessonHeading(page)).toBeVisible();
    await page.getByRole("button", { name: "Signatures", exact: true }).click();
    await expect(lessonHeading(page)).toHaveCount(0);
    await expect(start(page)).toBeVisible();
  });

  test("the Lesson button shows as pressed while its lesson is open", async ({ page }) => {
    await page.goto(URL);
    await expect(lessonHeading(page)).toBeVisible();
    await page.getByRole("button", { name: "Skip, I know this" }).click();
    await page.getByRole("button", { name: "Lesson", exact: true }).click();
    await expect(lessonHeading(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "Lesson", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("screen 1 shows a staff before the first Next", async ({ page }) => {
    await page.goto(URL);
    await expect(page.getByTestId("lesson").locator("svg").first()).toBeVisible();
  });

  test("no overflow at 375", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(URL);
    await expect(lessonHeading(page)).toBeVisible();
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("ArrowRight");
      await expectNoHorizontalOverflow(page);
    }
  });
});
