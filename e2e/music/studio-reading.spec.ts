// Song practice for reading: a sight-read (a look, then one pass, counted on the
// song's first run only), tapping a score's rhythm, the duet partner and melody
// balance from MIDI velocity; and the sight-reading generator's kick lane and
// meter changes. Over fake MIDI.
import { expect, test, type Page } from "@playwright/test";
import { PORTS, installFakeMidi, muteHmr, pickMode } from "./fixtures";

const SHOTS = "docs/screenshots/rebuild/studio-reading";
// Ode to Joy, bars 1 to 4, one note per group, and where each starts (beats).
const ODE_NOTES = [64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 64, 62, 62];
const STARTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13.5, 14];
const BEAT = 250;

async function seed(page: Page, over: Record<string, unknown> = {}) {
  await page.goto("/music");
  await page.waitForLoadState("networkidle");
  await page.evaluate(
    (over) =>
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
                ...over,
              },
            });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      }),
    over,
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

/** On the take's own downbeat, play notes stamped at beat times. */
async function playFromGo(
  page: Page,
  notes: { midi: number; beat: number; hold?: number; velocity?: number }[],
) {
  const stage = page.getByTestId("studio-stage");
  await expect(stage).toHaveAttribute("data-downbeat", /\d/, { timeout: 8000 });
  const downbeat = Number(await stage.getAttribute("data-downbeat"));
  await page.evaluate(
    ({ notes, port, beat, downbeat }) => {
      const send = (bytes: number[], at: number) =>
        setTimeout(
          () => (window as any).__midi.send(port, bytes, at),
          Math.max(0, at - 60 - performance.now()),
        );
      for (const n of notes) {
        send([0x90, n.midi, n.velocity ?? 96], downbeat + n.beat * beat);
        send([0x80, n.midi, 0], downbeat + n.beat * beat + (n.hold ?? 120));
      }
    },
    { notes, port: PORTS.keys.id, beat: BEAT, downbeat },
  );
}

/** The params of the last Song practice run saved. */
function lastRunParams(page: Page) {
  return page.evaluate(
    () =>
      new Promise<Record<string, unknown>>((resolve, reject) => {
        const open = indexedDB.open("woodshed");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const get = open.result.transaction("sessions").objectStore("sessions").getAll();
          get.onsuccess = () => {
            const runs = (
              get.result as {
                runs: { exerciseId: string; endedAt: number; params: Record<string, unknown> }[];
              }[]
            )
              .flatMap((s) => s.runs)
              .filter((r) => r.exerciseId === "song.studio")
              .sort((a, b) => a.endedAt - b.endedAt);
            resolve(runs.at(-1)?.params ?? {});
          };
        };
      }),
  );
}

test.describe("song practice for reading", () => {
  test.beforeEach(async ({ page }) => {
    await muteHmr(page);
    await installFakeMidi(page, [PORTS.keys]);
    await page.setViewportSize({ width: 1280, height: 1000 });
    await seed(page);
  });

  test("sight-read: hidden until the look, one pass, counted on the first run only", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await importSong(page, "e2e/music/fixtures/ode-to-joy.musicxml", "Ode to Joy");
    await page.goto(page.url().split("?")[0] + "?mode=sight-read&bpm=240");
    await expect(page.getByText("Sight-read, whole score, 240 BPM")).toBeVisible();
    await expect(page.getByText("The notes stay hidden until you start")).toBeVisible();
    await expect(page.getByRole("button", { name: "Hear it" })).toBeDisabled();
    await page.screenshot({ path: `${SHOTS}/sight-read-ready-1280.png`, fullPage: true });
    await page.getByRole("button", { name: "Start sight-reading" }).click();
    await expect(page.getByRole("status")).toContainText("Look for 30 seconds");
    await expect(page.getByText("Look", { exact: true })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/sight-read-look-1280.png`, fullPage: true });
    await page.getByRole("button", { name: "Ready, count me in" }).click();
    await playFromGo(
      page,
      ODE_NOTES.map((midi, i) => ({ midi, beat: STARTS[i] })),
    );
    await expect(page.getByRole("status")).toContainText("it counts as a sight-read", {
      timeout: 10_000,
    });
    expect(await lastRunParams(page)).toMatchObject({
      mode: "sight-read",
      firstRun: true,
      kept: true,
    });
    // The second run is not a sight-read, and the notes show before it.
    await expect(page.getByText("The notes stay hidden until you start")).toBeHidden();
    await page.getByRole("button", { name: "Again", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("won't count as a sight-read");
    await page.getByRole("button", { name: "Ready, count me in" }).click();
    await playFromGo(
      page,
      ODE_NOTES.map((midi, i) => ({ midi, beat: STARTS[i] })),
    );
    await expect(page.getByRole("status")).toContainText("doesn't count as a sight-read", {
      timeout: 10_000,
    });
    expect(await lastRunParams(page)).toMatchObject({ mode: "sight-read", firstRun: false });
  });

  test("tap the rhythm: any note on each onset, graded on timing", async ({ page }) => {
    test.setTimeout(60_000);
    await importSong(page, "e2e/music/fixtures/ode-to-joy.musicxml", "Ode to Joy");
    await page.goto(page.url().split("?")[0] + "?mode=performance&takes=1&tap=true&bpm=240");
    await expect(page.getByText("tapping the rhythm")).toBeVisible();
    await page.getByRole("button", { name: "Start performance" }).click();
    // One low key for every note, whatever its pitch.
    await playFromGo(
      page,
      STARTS.map((beat) => ({ midi: 41, beat })),
    );
    await expect(page.getByRole("status")).toContainText("Clean take at 240 BPM", {
      timeout: 10_000,
    });
    await expect(page.getByText("Taps found")).toBeVisible();
    expect(await lastRunParams(page)).toMatchObject({ tap: true, mode: "performance" });
  });

  test("melody balance from velocity, and the duet partner for a part left out", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await importSong(page, "e2e/music/fixtures/ode-duet.musicxml", "Ode duet");
    const base = page.url().split("?")[0];
    await page.goto(base + "?mode=performance&takes=1&grade=balance&bpm=240");
    await expect(page.getByText("melody balance graded")).toBeVisible();
    await page.getByRole("button", { name: "Start performance" }).click();
    // The melody over the bass at beats 0 and 4: louder at 0, softer at 4.
    await playFromGo(page, [
      ...ODE_NOTES.slice(0, 8).map((midi, i) => ({ midi, beat: i, velocity: i === 4 ? 50 : 110 })),
      { midi: 48, beat: 0, velocity: 60, hold: 900 },
      { midi: 43, beat: 4, velocity: 100, hold: 900 },
    ]);
    await expect(page.getByText("Melody louder than the notes under it")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator("article").first()).toContainText("1 of 2");
    expect(await lastRunParams(page)).toMatchObject({ grade: "balance" });

    // Play the melody only: the app plays the bass.
    await page.goto(base + "?mode=no-stop&grade=notes&partner=true&bpm=240");
    await page.getByRole("button", { name: "Setup" }).click();
    await page.getByRole("button", { name: "✓ Bass" }).click();
    await expect(page.getByText("Woodshed plays Bass").first()).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/duet-partner-1280.png`, fullPage: true });
    await page.getByRole("button", { name: "Start no-stop run" }).click();
    await playFromGo(
      page,
      ODE_NOTES.slice(0, 8).map((midi, i) => ({ midi, beat: i })),
    );
    await expect(page.getByRole("status")).toContainText("Kept going to the end", {
      timeout: 10_000,
    });
    expect(await lastRunParams(page)).toMatchObject({ partner: true, mode: "no-stop", kept: true });
  });
});

test.describe("sight-reading generator for Tap the rhythm", () => {
  test.beforeEach(async ({ page }) => {
    await muteHmr(page);
    await installFakeMidi(page, [PORTS.keys]);
    await seed(page, { countInBars: 0, bpm: 80 });
  });

  test("a kick on every beat under the tapped rhythm", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto(
      "/music/reading?activity=sight-reading&follower=tap&kick=true&level=line-4&measures=1&meter=simple&climb=false",
    );
    await expect(page.getByText("Setup:").locator("..")).toContainText("kick on every beat");
    await pickMode(page, "Practice");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(page.getByRole("button", { name: "Kick", exact: true })).toBeEnabled();
    const paper = page.locator(".paper-wrap[data-onsets]");
    await expect(paper).toHaveAttribute("data-downbeat", /^\d+$/, { timeout: 10_000 });
    await page.evaluate((port) => {
      const el = document.querySelector<HTMLElement>(".paper-wrap[data-onsets]")!;
      const down = Number(el.dataset.downbeat);
      const beat = Number(el.dataset.beatMs);
      const midi = (window as any).__midi;
      const hit = (note: number, b: number) => {
        const at = down + b * beat;
        setTimeout(
          () => midi.send(port, [0x90, note, 90], at),
          Math.max(0, at - performance.now() - 80),
        );
        setTimeout(
          () => midi.send(port, [0x80, note, 0]),
          Math.max(0, at - performance.now() + 100),
        );
      };
      for (const o of el.dataset.onsets!.split(",").map(Number)) hit(60, o);
      for (const b of [0, 1, 2, 3]) hit(36, b);
    }, PORTS.keys.id);
    await expect(page.getByRole("status")).toContainText("Read and played in time", {
      timeout: 15_000,
    });
    await expect(page.getByText("Kick on every beat", { exact: true })).toBeVisible();
    await expect(page.locator("article").first()).toContainText("4 of 4");
  });

  test("the meter changes every 2 bars and the staff draws each time signature", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(
      "/music/reading?activity=sight-reading&follower=tap&level=piano-9&clefs=treble&meter=changing&measures=8&climb=false",
    );
    await expect(page.getByText("Setup:").locator("..")).toContainText(
      "8 bars of 4/4, 3/4, 5/8 every 2 bars",
    );
    await expect(page.locator(".paper-wrap svg").first()).toBeVisible();
    await expect(page.getByText("can't draw")).toHaveCount(0);
    // 4/4 at the start, then 3/4, 5/8 and 4/4 again: four time signatures.
    await expect(page.locator(".paper-wrap .vf-timesignature")).toHaveCount(4);
    await page.screenshot({ path: `${SHOTS}/meter-changes-1280.png`, fullPage: true });
  });
});
