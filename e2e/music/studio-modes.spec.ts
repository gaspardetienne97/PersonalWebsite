// Song practice's run modes: a no-stop run scored on continuity, a run from
// memory in another key, and dynamics and a breath mark from MusicXML graded
// from MIDI velocity and note lengths, over fake MIDI.
import { expect, test, type Page } from "@playwright/test";
import { PORTS, expectNoHorizontalOverflow, installFakeMidi } from "./fixtures";

const SHOTS = "docs/screenshots/rebuild/studio-modes";
// Ode to Joy, bars 1 to 4, one note per group, and where each starts (beats).
const ODE_NOTES = [64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 64, 62, 62];
const STARTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13.5, 14];
const BEAT = 250;

async function seed(page: Page) {
  await page.goto("/music");
  await page.waitForLoadState("networkidle");
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("woodshed");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction("settings", "readwrite");
          const store = tx.objectStore("settings");
          const get = store.get("music.settings");
          get.onsuccess = () =>
            store.put({
              id: "music.settings",
              value: {
                ...get.result?.value,
                midiEnabledBefore: true,
                activeInstrument: "piano",
                countInBars: 1,
              },
            });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
}

async function importSong(page: Page, file: string, title: string) {
  await page.goto("/music/library?tab=import");
  await page.getByLabel("Score file").setInputFiles(file);
  await expect(page.getByRole("heading", { name: "Preview" })).toBeVisible();
  await page.getByRole("button", { name: "Save to songs" }).click();
  await expect(page.getByText(`${title} is in your songs.`)).toBeVisible();
  await page.goto("/music/library");
  await page
    .getByRole("link", { name: new RegExp(title) })
    .first()
    .click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
}

/** On the run's own downbeat, play notes stamped at beat times; `hold` and `velocity` per note. */
async function playFromGo(
  page: Page,
  notes: { midi: number; beat: number; hold: number; velocity?: number }[],
) {
  const stage = page.getByTestId("studio-stage");
  await expect(stage).toHaveAttribute("data-downbeat", /\d/, { timeout: 8000 });
  const downbeat = Number(await stage.getAttribute("data-downbeat"));
  await page.evaluate(
    ({ notes, port, beat, downbeat }) => {
      const t0 = downbeat;
      const send = (bytes: number[], at: number) =>
        setTimeout(
          () => (window as any).__midi.send(port, bytes, at),
          Math.max(0, at - 60 - performance.now()),
        );
      for (const n of notes) {
        send([0x90, n.midi, n.velocity ?? 96], t0 + n.beat * beat);
        send([0x80, n.midi, 0], t0 + n.beat * beat + n.hold);
      }
    },
    { notes, port: PORTS.keys.id, beat: BEAT, downbeat },
  );
}

test.describe("song practice modes", () => {
  test.beforeEach(async ({ page }) => {
    await page.routeWebSocket(/\/\?token=|vite-hmr/, () => {});
    await installFakeMidi(page, [PORTS.keys]);
    await page.setViewportSize({ width: 1280, height: 1000 });
    await seed(page);
  });

  test("no-stop: a bar left out is named as a stop", async ({ page }) => {
    test.setTimeout(60_000);
    await importSong(page, "e2e/music/fixtures/ode-to-joy.musicxml", "Ode to Joy");
    await page.goto(page.url().split("?")[0] + "?mode=no-stop&bpm=240");
    await expect(page.getByText("No-stop run, whole score, 240 BPM")).toBeVisible();
    await page.getByRole("button", { name: "Start no-stop run" }).click();
    await playFromGo(
      page,
      ODE_NOTES.flatMap((midi, i) =>
        i >= 8 && i <= 11 ? [] : [{ midi, beat: STARTS[i], hold: 120 }],
      ),
    );
    await expect(page.getByRole("status")).toContainText("Stopped for 4 beats at bar 3", {
      timeout: 10_000,
    });
    await expect(page.getByText("Kept going (bars played)")).toBeVisible();
    await expect(page.locator("article").first()).toContainText("3 of 4, longest slip 4 beats");
    await page.screenshot({ path: `${SHOTS}/no-stop-1280.png`, fullPage: true });
  });

  test("from memory, a whole step up: the notes hide and the new key is graded", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await importSong(page, "e2e/music/fixtures/ode-to-joy.musicxml", "Ode to Joy");
    await page.goto(
      page.url().split("?")[0] + "?mode=performance&takes=1&memory=look&transpose=2&bpm=240",
    );
    await expect(page.getByText("up 2 semitones (D major), from memory")).toBeVisible();
    await page.getByRole("button", { name: "Start performance" }).click();
    await expect(
      page.getByText("From memory: the notes are hidden until the results."),
    ).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/memory-running-1280.png`, fullPage: true });
    await playFromGo(
      page,
      ODE_NOTES.map((m, i) => ({ midi: m + 2, beat: STARTS[i], hold: 120 })),
    );
    await expect(page.getByRole("status")).toContainText("Clean take at 240 BPM", {
      timeout: 10_000,
    });
    await expect(
      page.getByText("From memory: the notes are hidden until the results."),
    ).toBeHidden();
  });

  test("dynamics and a breath mark from MusicXML, graded from velocity", async ({ page }) => {
    test.setTimeout(60_000);
    await importSong(page, "e2e/music/fixtures/ode-dynamics.musicxml", "Ode with dynamics");
    await page.goto(page.url().split("?")[0] + "?mode=performance&takes=1&grade=dynamics&bpm=240");
    await expect(page.getByText("dynamics and breaths scored")).toBeVisible();
    // The marks are drawn on the staff: p, f and the breath comma.
    await expect(page.locator("svg text", { hasText: /^f$/ }).first()).toBeAttached();
    await page.screenshot({ path: `${SHOTS}/dynamics-ready-1280.png`, fullPage: true });
    await page.getByRole("button", { name: "Start performance" }).click();
    await playFromGo(
      page,
      ODE_NOTES.map((m, i) => ({
        midi: m,
        beat: STARTS[i],
        // Legato everywhere but a breath after bar 2; p then f.
        hold: i === 7 ? 120 : 240,
        velocity: i < 8 ? 40 : 110,
      })),
    );
    await expect(page.getByText("Dynamics and breaths as marked")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("article").first()).toContainText("1 of 1 changes, 1 of 1 breaths");
    await page.screenshot({ path: `${SHOTS}/dynamics-results-1280.png`, fullPage: true });
  });

  test("the setup offers the modes at phone width", async ({ page }) => {
    await importSong(page, "e2e/music/fixtures/ode-dynamics.musicxml", "Ode with dynamics");
    await page.setViewportSize({ width: 375, height: 900 });
    await page.getByRole("button", { name: "Setup", exact: true }).click();
    for (const name of ["No-stop", "After a look", "Bar by bar", "Dynamics and breaths", "Vibrato"])
      await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
    await expect(page.getByText("The song marks 2 dynamics, 1 breath mark")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: `${SHOTS}/setup-375.png`, fullPage: true });
  });
});
