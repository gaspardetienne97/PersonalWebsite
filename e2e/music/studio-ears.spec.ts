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
    await page.goto("/music/ear/studio");
    await expect(page.getByRole("heading", { level: 1, name: "Ear" })).toBeVisible();
    await expect(page.getByLabel("Ear drill")).toContainText("Studio ears");
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
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByRole("article", { name: "Question 2" })).toHaveAttribute(
      "data-step",
      "answer",
    );
    const b = (await card.getAttribute("data-answer"))!;
    const wrong = ["250", "1000", "4000"].find((x) => x !== b)!;
    await answers.filter({ hasText: new RegExp(`^${hz(wrong)}$`) }).click();
    await expect(card).toContainText(`It was ${hz(b)}. You said ${hz(wrong)}.`);
  });

  test("boost or cut at matched loudness, on the band loop", async ({ page }) => {
    await page.goto("/music/ear/studio?exercise=boost-or-cut&material=music&gain=6");
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

  test("compression (level-matched) and delay time on the drum loop", async ({ page }) => {
    // Pink noise is picked, but these two need hits: the drum loop plays.
    await page.goto("/music/ear/studio?exercise=compression&material=noise");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    const card = prompt(page);
    await expect(card).toHaveAttribute("data-step", "answer", { timeout: 20_000 });
    await expect(card).toContainText("Drum loop");
    const answers = page.getByRole("group", { name: "Answers" }).getByRole("button");
    await expect(answers).toHaveText(["None", "Light (2.5:1)", "Heavy (12:1)"]);
    const c = (await card.getAttribute("data-answer"))!;
    await answers.nth(["none", "light", "heavy"].indexOf(c)).click();
    await expect(card).toContainText("Right:");

    await page.goto("/music/ear/studio?exercise=delay&delays=4&material=drums");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(card).toHaveAttribute("data-step", "answer", { timeout: 20_000 });
    await expect(answers).toHaveText([
      "1/16, 167 ms",
      "1/8, 333 ms",
      "Dotted 1/8, 500 ms",
      "1/4, 667 ms",
    ]);
    const d = (await card.getAttribute("data-answer"))!;
    await answers.nth(["167", "333", "500", "667"].indexOf(d)).click();
    await expect(card).toContainText("Right:");
  });

  test("the Drills tab groups drills by what you practise, and a mode chip opens that mode", async ({
    page,
  }) => {
    await page.goto("/music?tab=drills");
    await page.getByRole("button", { name: "All instruments" }).click();
    const jump = page.getByRole("navigation", { name: "Jump to" });
    await expect(jump.getByRole("link")).toHaveText([
      /^Ear \(16\)$/,
      /^Reading and rhythm \(3\)$/,
      /^Technique \(9\)$/,
      /^Grooves and time \(3\)$/,
      /^Play over changes \(8\)$/,
      /^Theory \(1\)$/,
      /^Studio ears \(1\)$/,
      /^Phrases and songs \(5\)$/,
    ]);
    await expect(page.getByRole("link", { name: "Studio ears", exact: true })).toHaveAttribute(
      "href",
      "/music/ear/studio",
    );
    await page.screenshot({ path: `${SHOTS}/drills-tab.png`, fullPage: true });
    await page.getByRole("button", { name: "Exercises in Rhythm" }).click();
    await page.getByRole("link", { name: "Rhythm: Echo" }).click();
    await expect(page).toHaveURL(/\/music\/rhythm\?mode=echo$/);
    // The mode is the title's picker now, not part of the setup sentence.
    await expect(page.getByLabel("Rhythm drill")).toHaveAttribute("data-value", "echo");
    await expect(page.getByLabel("Rhythm drill")).toContainText("Echo");
    // Pads and the Aerophone are split by what their modes practise; a split row opens its first mode.
    await page.goto("/music?tab=drills");
    await page.getByRole("button", { name: "All instruments" }).click();
    await expect(page.getByRole("link", { name: "Pad grooves", exact: true })).toHaveAttribute(
      "href",
      "/music/pads?mode=groove",
    );
    await page.getByRole("button", { name: "Exercises in Aerophone breath and tongue" }).click();
    await page.getByRole("link", { name: "Aerophone breath and tongue: Bite vibrato" }).click();
    await expect(page).toHaveURL(/\/music\/aerophone\?mode=vibrato$/);
    // Ear drills chip their answer styles; Scales chips what it plays.
    await page.goto("/music?tab=drills");
    await page.getByRole("button", { name: "All instruments" }).click();
    await page.getByRole("button", { name: "Exercises in Intervals" }).click();
    await page.locator('a[href="/music/ear/intervals?answer=play-back"]').click();
    await expect(
      page.getByText("Play on the keys below or your MIDI keyboard.", { exact: false }),
    ).toBeVisible();
    await page.goto("/music?tab=drills");
    await page.getByRole("button", { name: "All instruments" }).click();
    // Two Scales cards (keys and strings) each have a Modes menu: open the one holding Arpeggio.
    const arpeggio = page.getByRole("link", { name: "Scales: Arpeggio" });
    for (const menu of await page.getByRole("button", { name: "Exercises in Scales" }).all()) {
      await menu.click();
      if (await arpeggio.isVisible()) break;
      await page.keyboard.press("Escape");
    }
    await arpeggio.click();
    await expect(page).toHaveURL(/\/music\/scales\?pattern=arpeggio$/);
    await expect(page.getByTestId("setup-line")).toContainText(/arpeggio/i);
  });
});
