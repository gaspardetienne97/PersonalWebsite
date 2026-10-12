// Studio ears: a loop heard Flat and Changed, the change named.
import { expect, test, type Page } from "@playwright/test";
import { expectNoHorizontalOverflow } from "./fixtures";

const SHOTS = "docs/screenshots/rebuild/studio-ears";
const prompt = (page: Page) => page.locator("article[data-exercise]");
const hz = (a: string) => (Number(a) >= 1000 ? `${Number(a) / 1000} kHz` : `${a} Hz`);

test.describe("studio ears", () => {
  test.beforeEach(async ({ page }) => {
    await page.routeWebSocket(/\/\?token=|vite-hmr/, () => {});
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  test("find the boost on pink noise: flip, answer, see the curve", async ({ page }) => {
    await page.goto("/music/listening");
    await expect(page.getByRole("heading", { level: 1, name: "Studio ears" })).toBeVisible();
    await page.getByRole("button", { name: "Start", exact: true }).click();
    const card = prompt(page);
    await expect(card).toHaveAttribute("data-step", "answer", { timeout: 15_000 });
    // Flat first, then Changed; A and B flip.
    const flat = page.getByRole("button", { name: /^Flat/ });
    const changed = page.getByRole("button", { name: /^Changed/ });
    await expect(changed).toHaveAttribute("aria-pressed", "true", { timeout: 4000 });
    await page.keyboard.press("a");
    await expect(flat).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("b");
    await expect(changed).toHaveAttribute("aria-pressed", "true");
    const answers = page.getByRole("group", { name: "Answers" }).getByRole("button");
    await expect(answers).toHaveText(["250 Hz", "1 kHz", "4 kHz"]);

    const a = (await card.getAttribute("data-answer"))!;
    await answers.filter({ hasText: new RegExp(`^${hz(a)}$`) }).click();
    await expect(card).toContainText(`Right: ${hz(a)}.`);
    await expect(card.getByRole("img", { name: `+12 dB at ${hz(a)}` })).toBeVisible();
    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await expectNoHorizontalOverflow(page);
      await page.screenshot({ path: `${SHOTS}/peak-${width}.png`, fullPage: true });
    }

    // A wrong one next, then on to the next prompt.
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("article", { name: "Prompt 2" })).toHaveAttribute(
      "data-step",
      "answer",
    );
    const b = (await card.getAttribute("data-answer"))!;
    const wrong = ["250", "1000", "4000"].find((x) => x !== b)!;
    await answers.filter({ hasText: new RegExp(`^${hz(wrong)}$`) }).click();
    await expect(card).toContainText(`It was ${hz(b)}. You said ${hz(wrong)}.`);
  });

  test("boost or cut at matched loudness, on the band loop", async ({ page }) => {
    await page.goto("/music/listening?exercise=boost-or-cut&material=music&gain=6");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    const card = prompt(page);
    await expect(card).toHaveAttribute("data-step", "answer", { timeout: 20_000 });
    const a = (await card.getAttribute("data-answer"))!;
    await page
      .getByRole("group", { name: "Answers" })
      .getByRole("button", { name: a === "boost" ? "Boost" : "Cut" })
      .click();
    await expect(card).toContainText(`Right: ${a === "boost" ? "Boost" : "Cut"}.`);
  });
});
