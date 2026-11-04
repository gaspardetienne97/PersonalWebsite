// The practice strip's instrument picks the stage: drills written for the
// keyboard draw a fretboard on guitar and ukulele, the fingering on the
// Aerophone, and Rhythm hands the MPC its pads.
import { expect, test, type Page } from "@playwright/test";
import { choose, muteHmr } from "./fixtures";

const SHOTS = "docs/screenshots/rebuild/instrument-views";

async function pick(page: Page, instrument: string) {
  await choose(
    page,
    page.getByRole("group", { name: "Practice controls" }).getByLabel("Instrument"),
    instrument,
  );
}

test.describe("instrument views", () => {
  test.beforeEach(async ({ page }) => {
    await muteHmr(page);
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  test("scales follow the strip: keyboard, guitar and ukulele fretboards, the Aerophone fingering", async ({
    page,
  }) => {
    await page.goto("/music/scales?tonic=60&kind=major&pattern=scale&span=one-octave&motion=up");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await pick(page, "Piano");
    await expect(page.getByLabel(/^Piano keyboard/)).toBeVisible();
    // Before the run, the whole scale is marked: C major up one octave is eight keys.
    await expect(page.locator(".piano [data-target]")).toHaveCount(8);
    // The scale written out above: a staff on piano, tab on guitar.
    await expect(page.getByTestId("line-staff").locator("svg")).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/scales-piano-1280.png`, fullPage: true });
    await pick(page, "Guitar");
    await expect(page.getByLabel(/^guitar fretboard/)).toBeVisible();
    // C major up one octave: eight targets, each with its finger, the two Cs marked as the root.
    const neck = page.getByLabel(/^guitar fretboard/);
    await expect(neck.locator("[data-target][data-finger]")).toHaveCount(8);
    await expect(neck.locator('[data-role="root"]')).toHaveCount(2);
    await expect(page.getByTestId("line-tab").locator("svg")).toBeVisible();
    await expect(page.getByText("Setup:").locator("..")).toContainText("on guitar");
    await page.screenshot({ path: `${SHOTS}/scales-guitar-1280.png`, fullPage: true });
    await pick(page, "Ukulele");
    await expect(page.getByLabel(/^ukulele fretboard/)).toBeVisible();
    // A3 sits below a high-G ukulele: the line moves up an octave instead of falling off the neck.
    await page.goto("/music/scales?tonic=57&kind=major&pattern=scale&span=one-octave&motion=up");
    await expect(page.getByLabel(/^ukulele fretboard/)).toBeVisible();
    await expect(page.getByText(/out of the ukulele's range/)).toHaveCount(0);
    await pick(page, "Aerophone");
    await expect(page.getByTestId("line-staff").locator("svg")).toBeVisible();
    await page.getByRole("button", { name: "Hear it", exact: true }).click();
    await expect(page.getByTestId("aerophone-fingering")).toContainText(/A4|B4|C#5/, {
      timeout: 10_000,
    });
    await page.screenshot({ path: `${SHOTS}/scales-aerophone-1280.png`, fullPage: true });
  });

  test("chord scales on the Aerophone list the notes that fit", async ({ page }) => {
    await page.goto("/music/chord-scales");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await pick(page, "Aerophone");
    await expect(page.getByRole("list", { name: "The notes that fit" })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/chord-scales-aerophone-1280.png`, fullPage: true });
  });

  test("reading on the Aerophone: one treble line", async ({ page }) => {
    await page.goto("/music/reading?activity=sight-reading&instrument=auto");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await pick(page, "Aerophone");
    await expect(page.getByText("Setup:").locator("..")).toContainText("aerophone");
    await expect(page.getByTestId("aerophone-fingering")).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/sight-reading-aerophone-1280.png`, fullPage: true });
  });

  test("ear drills answer on the strip's instrument", async ({ page }) => {
    await page.goto("/music/ear/intervals?answer=playback");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await pick(page, "Ukulele");
    await expect(page.getByLabel(/^ukulele fretboard/)).toBeVisible();
  });

  test("rhythm on the MPC taps on its pads", async ({ page }) => {
    await page.goto("/music/rhythm?mode=pulse");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await pick(page, "MPC pads");
    await expect(page.getByLabel("Pads: any pad is a tap")).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/rhythm-mpc-1280.png`, fullPage: true });
  });

  test("the drills list on the Aerophone includes scales, reading and licks", async ({ page }) => {
    await page.goto("/music?tab=drills");
    await pick(page, "Aerophone");
    for (const name of ["Scales", "Note reading", "Jazz licks"])
      await expect(page.getByRole("link", { name: new RegExp(name) }).first()).toBeVisible();
  });

  test("the line is written out above the instrument: staff on piano and Aerophone, tab on guitar", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    for (const path of [
      "/music/two-hand",
      "/music/comping",
      "/music/voicings?variant=cadence",
      "/music/pedal",
      "/music/licks",
      "/music/chord-scales",
    ]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await pick(page, "Piano");
      await expect(page.getByTestId("line-staff").locator("svg"), path).toBeVisible();
    }
    await page.screenshot({ path: `${SHOTS}/chord-scales-staff-1280.png`, fullPage: true });
    await pick(page, "Guitar");
    await expect(page.getByTestId("line-tab").locator("svg")).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/chord-scales-tab-1280.png`, fullPage: true });
    await page.goto("/music/pedal");
    await page.screenshot({ path: `${SHOTS}/pedal-staff-1280.png`, fullPage: true });
    await page.goto("/music/aerophone?mode=scales&scale=major&key=7");
    await expect(page.getByTestId("line-staff").locator("svg")).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/aero-scales-staff-1280.png`, fullPage: true });
  });
});
