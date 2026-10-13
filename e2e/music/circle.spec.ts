// The circle of fifths: the wheel in the Library, and the drill.
import { expect, test, type Page } from "@playwright/test";
import { expectNoHorizontalOverflow } from "./fixtures";

const SHOTS = "docs/screenshots/rebuild/circle";
const prompt = (page: Page) => page.locator("article[data-mode]");
async function shots(page: Page, name: string) {
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(200);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: `${SHOTS}/${name}-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
}

test.describe("circle of fifths", () => {
  test.beforeEach(async ({ page }) => {
    await page.routeWebSocket(/\/\?token=|vite-hmr/, () => {});
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  test("the Library's wheel shows a key's signature, chords and neighbours", async ({ page }) => {
    await page.goto("/music/library?tab=reference&section=circle");
    const section = page.locator("#circle");
    await expect(section.getByRole("heading", { name: "Circle of fifths" })).toBeVisible();
    await section.getByRole("button", { name: /^D major, 2 sharps$/ }).click();
    await expect(section).toContainText("2 sharps: F# C#.");
    await expect(section).toContainText("The last sharp, C#, is a half step below D.");
    for (const c of ["D", "Em", "F#m", "G", "A", "Bm", "C#°"])
      await expect(section.getByRole("button", { name: new RegExp(` ${c}$`) })).toBeVisible();
    await expect(section).toContainText("A major (its V)");
    await expect(section).toContainText("G major (its IV)");
    await expect(
      section
        .locator("svg")
        .filter({ has: page.locator("text") })
        .first(),
    ).toBeVisible();
    await shots(page, "library-circle");
  });

  test("keys and counts, with the rule and the wheel after a miss", async ({ page }) => {
    await page.goto("/music/circle?mode=count&band=two");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    const card = prompt(page);
    await expect(card).toHaveAttribute("data-step", "answer");
    const answers = page.getByRole("group", { name: "Answers" }).getByRole("button");
    const a = (await card.getAttribute("data-answer"))!;
    await answers
      .filter({ hasText: new RegExp(`^${a.replace(/[#♯♭]/g, (m) => `\\${m}`)}\\d?$`) })
      .first()
      .click();
    await expect(card).toContainText(/Right(, but slow)?: /);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("article", { name: "Prompt 2" })).toHaveAttribute(
      "data-step",
      "answer",
    );
    // A wrong answer by number key: the rule and the wheel follow.
    const b = (await card.getAttribute("data-answer"))!;
    const labels = (await answers.allTextContents()).map((t) => t.replace(/\d$/, ""));
    const wrong = labels.findIndex((t) => t !== b);
    await page.keyboard.press(String(wrong + 1));
    await expect(card).toContainText(`It was ${b}.`);
    await expect(
      card.getByRole("group", { name: "The circle, with the key of this prompt" }),
    ).toBeVisible();
    await shots(page, "drill-count-miss");
  });

  test("a signature on the bass staff, and the blank wheel", async ({ page }) => {
    await page.goto("/music/circle?mode=signature&band=four&clefs=bass");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    const card = prompt(page);
    await expect(card.locator("svg").first()).toBeVisible();
    const a = (await card.getAttribute("data-answer"))!;
    await page
      .getByRole("group", { name: "Answers" })
      .getByRole("button")
      .filter({ hasText: new RegExp(`^${a.replace("#", "\\#")}\\d?$`) })
      .click();
    await expect(card).toContainText(/Right/);
    await shots(page, "drill-signature");

    await page.goto("/music/circle?mode=wheel&band=all");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(card).toHaveAttribute("data-step", "answer");
    const slot = Number(await card.getAttribute("data-answer"));
    await card.getByRole("button", { name: `Slot ${slot + 1}, hidden` }).click();
    await expect(card).toContainText(/Right/);
    await shots(page, "drill-wheel");
  });

  test("keys are picked on the circle: the Library's tonic and the chord-scales key", async ({
    page,
  }) => {
    await page.goto("/music/library?tab=reference&section=explorer");
    await page.getByRole("button", { name: "Tonic: C" }).click();
    await page
      .getByRole("group", { name: "Tonic: the circle of fifths" })
      .getByRole("button", { name: "Eb major, 3 flats" })
      .click();
    await expect(page.locator("#explorer")).toContainText("Eb major");
    await expect(page.getByRole("button", { name: "Tonic: Eb" })).toBeVisible();

    await page.goto("/music/chord-scales");
    await page.getByRole("button", { name: "Change setup" }).click();
    await page.getByRole("button", { name: /^Key: / }).click();
    await shots(page, "key-picker");
    // The bottom of the circle: F#/Gb, spelled Gb as the jazz cycle has it.
    await page.getByRole("button", { name: /^F# major \(Gb\)/ }).click();
    await expect(page.getByRole("button", { name: "Key: Gb" })).toBeVisible();
    await expect(page.getByText("Setup:").locator("..")).toContainText("Gb");
  });
});
