// The note highway on guitar and ukulele: notes scroll into the now line on the
// run's own clock, and each fret tap is judged perfect, early, late or missed.
import { expect, test, type Page } from "@playwright/test";
import { expectNoHorizontalOverflow } from "./fixtures";

const SHOTS = process.env.HIGHWAY_SHOTS ?? "test-results/highway";
const fret = (s: number, f: number) => `button[aria-label^="String ${s} fret ${f},"]`;

async function shoot(page: Page, name: string) {
  await page.getByTestId("note-highway").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

/** Start a Practice run and wait for the count-in's clock to be published. */
async function startRun(page: Page) {
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.locator("[data-step-ms][data-downbeat]")).toHaveCount(1, { timeout: 10_000 });
}

/** Start a run on a drill without a step clock (changes): wait for the shell's "Go.". */
async function startRun2(page: Page) {
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(/Go\.|Play/, { timeout: 10_000 });
}

/** Tap each fret at its time (ms after the downbeat), scheduled in the page so the runner's latency never shifts it. */
async function tapsAt(page: Page, taps: { sel: string; ms: number }[]) {
  await page.evaluate((taps) => {
    const clock = document.querySelector("[data-step-ms][data-downbeat]")!;
    const downbeat = Number(clock.getAttribute("data-downbeat"));
    for (const t of taps)
      setTimeout(
        () => {
          const el = document.querySelector(t.sel)!;
          const o = { bubbles: true, pointerId: 9, button: 0 };
          el.dispatchEvent(new PointerEvent("pointerdown", o));
          setTimeout(() => el.dispatchEvent(new PointerEvent("pointerup", o)), 60);
        },
        Math.max(0, downbeat + t.ms - performance.now()),
      );
  }, taps);
}

test.describe("note highway", () => {
  test.beforeEach(async ({ page }) => {
    // A shared dev server's HMR reloads must not land mid-run.
    await page.routeWebSocket(
      () => true,
      () => {},
    );
  });

  test("Spider on the highway: perfect, late and missed", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(
      "/music/fretboard?mode=spider&pattern=ascending-1234&tuning=guitar.standard&strings=5,6&startFret=5&crossing=0&instrument=guitar&bpm=60",
    );
    await page.getByRole("button", { name: "Highway", exact: true }).click();
    const road = page.getByTestId("note-highway");
    await expect(road).toBeVisible();
    // Before a run: string names, and the first notes in the finger colours.
    await expect(road.locator(".note")).not.toHaveCount(0);
    await expect(road.locator('.note[data-finger="1"] .head').first()).toHaveText("5");
    await shoot(page, "spider-ready-1280");

    await startRun(page);
    const step = 1000;
    // Notes 1 to 3 on time, note 4 late by 150 ms, note 5 skipped, then on.
    await tapsAt(page, [
      { sel: fret(6, 5), ms: 0 },
      { sel: fret(6, 6), ms: step },
      { sel: fret(6, 7), ms: 2 * step },
      { sel: fret(6, 8), ms: 3 * step + 150 },
      { sel: fret(5, 6), ms: 5 * step },
    ]);
    // A note leaves the screen under a beat after it passes the line, so check each as it comes.
    await expect(road.locator('[data-verdict="perfect"]').first()).toBeVisible({ timeout: 9000 });
    await expect(road.locator('[data-verdict="late"]')).toHaveCount(1, { timeout: 5000 });
    await expect(road.locator('[data-verdict="missed"]')).toHaveCount(1, { timeout: 4000 });
    await expect(road.locator('[data-verdict="perfect"]')).not.toHaveCount(0, { timeout: 2000 });
    await expect(road.locator(".word")).toBeVisible();
    await shoot(page, "spider-run-1280");
    await page.setViewportSize({ width: 375, height: 800 });
    await expectNoHorizontalOverflow(page);
    await shoot(page, "spider-run-375");
    await page.keyboard.press("Escape");
  });

  test("Fingerpicking on a phone: picking letters ride on the notes, chord names above", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/music/chords?mode=fingerpick&instrument=guitar&bpm=70");
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.getByRole("button", { name: "Highway", exact: true }).click();
    const road = page.getByTestId("note-highway");
    await expect(road.locator(".tag").first()).toHaveText(/^[pima]$/);
    await expect(road.locator(".label").first()).not.toBeEmpty();
    await expectNoHorizontalOverflow(page);
    await shoot(page, "fingerpick-ready-375-dark");
    await startRun(page);
    await expect(road).toHaveAttribute("data-beat", /^[1-9]/, { timeout: 8000 });
    await shoot(page, "fingerpick-run-375-dark");
    await page.keyboard.press("Escape");
  });

  test("Ukulele legato: four lanes, the marks on the notes", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/music/fretboard?mode=legato&instrument=ukulele");
    await page.getByRole("button", { name: "Highway", exact: true }).click();
    const road = page.getByTestId("note-highway");
    await expect(road.locator(".open")).toHaveCount(4);
    await expect(road.locator(".tag").first()).toBeVisible();
    await shoot(page, "legato-ukulele-1280");
    // The view is a preference: Positions opens on the highway too.
    await page.goto("/music/fretboard?mode=positions&instrument=guitar");
    await expect(page.getByTestId("note-highway")).toBeVisible();
    await expect(page.getByTestId("note-highway").locator(".open")).toHaveCount(6);
    await page.getByRole("button", { name: "Tab", exact: true }).click();
    await expect(page.getByTestId("line-tab")).toBeVisible();
  });

  test("Timed chord changes: a block per chord, judged on arrival or missed", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/music/chords?mode=changes&instrument=guitar&clock=2&bpm=90");
    await page.getByRole("button", { name: "Highway", exact: true }).click();
    const road = page.getByTestId("note-highway");
    await expect(road.locator(".block .name").first()).not.toBeEmpty();
    await startRun2(page);
    // C is left unplayed; G is strummed (taps a hair apart) as its block reaches the line.
    await page.evaluate(
      async (frets) => {
        const road = document.querySelector('[data-testid="note-highway"]')!;
        await new Promise<void>((done) => {
          const wait = () =>
            Number(road.getAttribute("data-beat")) >= 1.97 ? done() : requestAnimationFrame(wait);
          wait();
        });
        for (const [st, f] of frets) {
          const el = document.querySelector(`button[aria-label^="String ${st} fret ${f},"]`)!;
          const o = { bubbles: true, pointerId: 9, button: 0 };
          el.dispatchEvent(new PointerEvent("pointerdown", o));
          el.dispatchEvent(new PointerEvent("pointerup", o));
          await new Promise((r) => setTimeout(r, 8));
        }
      },
      [
        [6, 3],
        [5, 2],
        [4, 0],
        [3, 0],
        [2, 0],
        [1, 3],
      ],
    );
    await expect(road.locator('.block[data-tone="bad"]').first()).toBeVisible({ timeout: 4000 });
    await expect(
      road.locator('.block[data-tone="good"], .block[data-tone="near"]').first(),
    ).toBeVisible({ timeout: 3000 });
    await shoot(page, "changes-run-1280");
    await page.keyboard.press("Escape");
  });

  test("Strum a progression: strum arrows and chord names, scrolling with the demo", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/music/strum?instrument=guitar&pattern=guitar-old-faithful&bpm=80");
    await page.getByRole("button", { name: "Highway", exact: true }).click();
    const road = page.getByTestId("note-highway");
    await expect(road.locator(".block .arrow").first()).toHaveText(/[↓↑✕]/);
    await expect(road.locator(".block .name").first()).not.toBeEmpty();
    await page.getByRole("button", { name: "Hear it first" }).click();
    await expect(road).toHaveAttribute("data-beat", /^[1-9]/, { timeout: 5000 });
    await expect(road.locator(".ball")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await shoot(page, "strum-demo-375");
    await page.getByRole("button", { name: "Stop demo" }).click();
  });

  test("Phrases: the highway on guitar, falling notes on piano", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/music/phrases?instrument=guitar");
    await page.getByRole("button", { name: "Highway", exact: true }).click();
    const road = page.getByTestId("note-highway");
    await expect(road.locator(".note").first()).toBeVisible();
    await page.getByRole("button", { name: "Hear it first" }).click();
    await expect(road).toHaveAttribute("data-beat", /^[1-9]/, { timeout: 5000 });
    await shoot(page, "phrases-guitar-1280");
    await page.getByRole("button", { name: "Stop demo" }).click();

    await page.goto("/music/phrases?instrument=piano");
    await page.getByRole("link", { name: "Falling notes", exact: true }).click();
    await expect(page.getByTestId("falling-notes")).toBeVisible();
    await page.getByRole("link", { name: "Staff", exact: true }).click();
    await expect(page.getByTestId("line-staff")).toBeVisible();
  });

  test("Song Studio offers the highway on guitar", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/music/library?tab=import&instrument=guitar");
    await page.getByLabel("Score file").setInputFiles("e2e/music/fixtures/ode-to-joy.musicxml");
    await expect(page.getByRole("heading", { name: "Preview" })).toBeVisible();
    await page.getByRole("button", { name: "Save to songs" }).click();
    // Wait for the save before leaving the page, as the library specs do.
    await expect(page.getByText(/is in your songs\./)).toBeVisible();
    await page.goto("/music/library");
    await page
      .getByRole("link", { name: /Ode to Joy/ })
      .first()
      .click();
    await page.getByRole("link", { name: "Highway", exact: true }).click();
    const road = page.getByTestId("note-highway");
    await expect(road.locator(".note").first()).toBeVisible();
    await page.getByRole("button", { name: "Hear it" }).click();
    await expect(road).toHaveAttribute("data-beat", /^[1-9]/, { timeout: 5000 });
    await shoot(page, "studio-guitar-1280");
  });
});
