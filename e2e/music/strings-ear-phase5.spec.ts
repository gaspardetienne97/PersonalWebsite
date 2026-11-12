// Phase 5 strings, phrases and ear items: the B.B. box and the ukulele positions
// by fret taps, harmonics, a 12/8 phrase and your licks in another key by fake
// MIDI, and sung answers in Bass lines and Scales by the synthetic microphone.
// Taps are scheduled in the page against the run's own downbeat; MIDI is
// stamped with each note's exact time.
import { expect, test, type Page } from "@playwright/test";
import { installFakeMidi, installSyntheticMic, PORTS, pickMode } from "./fixtures";

const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);

/** Saved settings: no count-in, MIDI on, the strip on `instrument`, and optional extra settings rows. */
async function settle(
  page: Page,
  url: string,
  instrument: string,
  rows: Record<string, unknown> = {},
) {
  await page.goto(url);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForTimeout(400);
  await page.evaluate(
    ({ instrument, rows }) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("woodshed");
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
                countInBars: 0,
                activeInstrument: instrument,
              },
            });
          for (const [id, value] of Object.entries(rows)) store.put({ id, value });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
        open.onerror = () => reject(open.error);
      }),
    { instrument, rows },
  );
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

const lastRun = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<{ exerciseId: string; params: Record<string, unknown>; score: number }>(
        (resolve) => {
          const open = indexedDB.open("woodshed");
          open.onsuccess = () => {
            const get = open.result.transaction("sessions").objectStore("sessions").getAll();
            get.onsuccess = () =>
              resolve(get.result.flatMap((s: { runs: unknown[] }) => s.runs).at(-1) as never);
          };
        },
      ),
  );

/** A fresh downbeat on the line drill after Start. */
async function downbeat(page: Page) {
  const el = page.locator("[data-step-ms]").first();
  await expect
    .poll(async () => Number((await el.getAttribute("data-downbeat")) ?? 0), { timeout: 10_000 })
    .toBeGreaterThan(0);
  return {
    downbeat: Number(await el.getAttribute("data-downbeat")),
    stepMs: Number(await el.getAttribute("data-step-ms")),
  };
}

/** Tap string and fret pairs, one a step, from the downbeat. */
async function tapLine(page: Page, taps: [string: number, fret: number][]) {
  const { downbeat: at0, stepMs } = await downbeat(page);
  await page.evaluate(
    ({ taps, at0, stepMs }) =>
      taps.forEach(([s, f], i) => {
        const el = () => document.querySelector(`button[aria-label^="String ${s} fret ${f},"]`)!;
        const at = at0 + i * stepMs - performance.now();
        const o = { bubbles: true, pointerId: 9, button: 0 };
        setTimeout(() => el().dispatchEvent(new PointerEvent("pointerdown", o)), at);
        setTimeout(() => el().dispatchEvent(new PointerEvent("pointerup", o)), at + 90);
      }),
    { taps, at0, stepMs },
  );
}

test.describe("phase 5 strings, phrases and ear", () => {
  test.beforeEach(async ({ page }) => {
    await page.routeWebSocket(
      () => true,
      () => {},
    );
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  test("Positions: the B.B. box in A, tapped clean in Check", async ({ page }) => {
    test.setTimeout(60_000);
    await settle(
      page,
      "/music/fretboard?mode=positions&pattern=bb-box&rootFret=5&instrument=guitar&bpm=80&perBeat=1",
      "guitar",
    );
    await expect(page.getByText("Setup:").locator("..")).toContainText("The B.B. box");
    await pickMode(page, "Check");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await tapLine(page, [
      [3, 11],
      [2, 10],
      [2, 12],
      [2, 13],
      [1, 10],
      [1, 12],
    ]);
    await expect(page.getByRole("article").getByText("6 of 6", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    expect((await lastRun(page)).params).toMatchObject({ pattern: "bb-box", rootFret: 5 });
  });

  test("Positions on ukulele: position 2 in A, string 4 to 1", async ({ page }) => {
    test.setTimeout(60_000);
    await settle(
      page,
      "/music/fretboard?mode=positions&pattern=ukulele-minor-pentatonic-2&rootFret=0&instrument=ukulele&bpm=90&perBeat=1",
      "ukulele",
    );
    await expect(page.getByText("Setup:").locator("..")).toContainText(
      "Minor pentatonic position 2",
    );
    await expect(page.getByText("Setup:").locator("..")).toContainText(
      "root A at fret 0 on string 1",
    );
    await pickMode(page, "Check");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await tapLine(page, [
      [4, 2],
      [4, 5],
      [3, 2],
      [3, 4],
      [2, 3],
      [2, 5],
      [1, 3],
      [1, 5],
    ]);
    await expect(page.getByRole("article").getByText("8 of 8", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    expect((await lastRun(page)).params).toMatchObject({ pattern: "ukulele-minor-pentatonic-2" });
  });

  test("Harmonics on ukulele: taps at 12, 7 and 5 stand for the harmonics", async ({ page }) => {
    test.setTimeout(60_000);
    await settle(page, "/music/fretboard?mode=harmonics&instrument=ukulele&bpm=90", "ukulele");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Harmonics");
    await pickMode(page, "Check");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await tapLine(
      page,
      [12, 7, 5].flatMap((f) => [4, 3, 2, 1].map((s) => [s, f] as [number, number])),
    );
    await expect(page.getByRole("article").getByText("12 of 12", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    expect((await lastRun(page)).exerciseId).toBe("technique.ukulele.harmonics");
  });

  /** Play `data-notes` over fake MIDI, stamped exactly, from the phrase's downbeat. */
  async function playPhrase(page: Page) {
    const stage = page.getByTestId("phrase");
    await expect(stage).toHaveAttribute("data-downbeat", /\d/, { timeout: 10_000 });
    const notes = JSON.parse((await stage.getAttribute("data-notes"))!) as [number, number][];
    const at0 = Number(await stage.getAttribute("data-downbeat"));
    const beatMs = Number(await stage.getAttribute("data-beat-ms"));
    await page.evaluate(
      ({ notes, at0, beatMs, port }) => {
        for (const [midi, beat] of notes) {
          const at = at0 + beat * beatMs;
          setTimeout(
            () => (window as any).__midi.send(port, [0x90, midi, 90], at),
            Math.max(0, at - performance.now() - 80),
          );
        }
      },
      { notes, at0, beatMs, port: PORTS.keys.id },
    );
    return notes;
  }

  test("Phrases: rock and roll triplets in 12/8, a click to each dotted quarter", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await installFakeMidi(page, [PORTS.keys]);
    await settle(page, "/music/phrases?phrase=piano.rock-triplets&bpm=90", "piano");
    await expect(page.getByTestId("phrase")).toContainText("Rock and roll triplets");
    await expect(page.getByTestId("line-staff").locator("svg")).toBeVisible();
    await pickMode(page, "Check");
    await page.getByRole("button", { name: /^Start/ }).click();
    const notes = await playPhrase(page);
    // Three notes a click: the second chord starts a third of a click in.
    expect(notes[4][1]).toBeCloseTo(1 / 3, 5);
    await expect(page.getByRole("status")).toContainText("All 24 steps", { timeout: 20_000 });
  });

  test("Phrases: your lick, moved up two semitones and played back", async ({ page }) => {
    test.setTimeout(60_000);
    await installFakeMidi(page, [PORTS.keys]);
    const lick = {
      id: "user.test",
      title: "My blues lick",
      from: "Learn by ear",
      bpm: 90,
      steps: [
        [60, 0.5],
        [63, 0.5],
        [65, 0.5],
        [67, 1.5],
        [null, 1],
      ],
    };
    await settle(page, "/music/phrases?phrase=user.test&transpose=2&bpm=90", "piano", {
      "music.user-licks": [lick],
    });
    await expect(page.getByTestId("phrase")).toContainText("My blues lick");
    await expect(page.getByText("Setup:").locator("..")).toContainText("moved up 2 semitones");
    await pickMode(page, "Check");
    await page.getByRole("button", { name: /^Start/ }).click();
    const notes = await playPhrase(page);
    expect(notes.map(([m]) => m)).toEqual([62, 65, 67, 69]);
    await expect(page.getByRole("status")).toContainText("All 4 notes", { timeout: 15_000 });
    expect((await lastRun(page)).params).toMatchObject({
      phrase: "user.test",
      user: true,
      transpose: 2,
    });
  });

  const prompt = (page: Page) => page.locator("article[data-drill]");
  const waitStep = (page: Page, step: string) =>
    expect(prompt(page)).toHaveAttribute("data-step", step, { timeout: 8000 });
  /** Sing `notes` one after another, silence between, waiting for each to lock. */
  async function sing(page: Page, notes: number[]) {
    for (const m of notes) {
      await page.evaluate((f) => (window as any).__mic.set(f, 0.4), hz(m));
      await page.waitForTimeout(700);
      await page.evaluate(() => (window as any).__mic.set(0));
      await page.waitForTimeout(250);
    }
  }

  test("Bass lines: the roots sung after the 1 fill the slots", async ({ page }) => {
    test.setTimeout(150_000);
    await installSyntheticMic(page, 0);
    await page.goto("/music/ear/bass-lines?answer=voice");
    await pickMode(page, "Check");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    for (let i = 0; i < 10; i++) {
      await expect(prompt(page)).toHaveAttribute("aria-label", `Question ${i + 1}`, {
        timeout: 12_000,
      });
      await page.evaluate(() => (window as any).__mic.set(0));
      await waitStep(page, "answer");
      const bass = (await prompt(page).getAttribute("data-expected"))!.split(",").map(Number);
      // An octave up, the way a voice sings a bass line.
      await sing(
        page,
        bass.slice(1).map((m) => m + 12),
      );
    }
    await expect(page.getByRole("status")).toContainText("All 10 right.", { timeout: 10_000 });
    expect((await lastRun(page)).params).toMatchObject({ answer: "voice", tune: 50 });
  });

  test("Scales: Dorian sung up and down from the tonic", async ({ page }) => {
    test.setTimeout(90_000);
    await installSyntheticMic(page, 0);
    await page.goto("/music/ear/scales?answer=voice&scales=dorian&scaleDirection=both");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(prompt(page)).toHaveAttribute("aria-label", "Question 1", { timeout: 12_000 });
    await page.evaluate(() => (window as any).__mic.set(0));
    await waitStep(page, "answer");
    await expect(page.getByRole("status")).toContainText("Sing the dorian scale up and down");
    const run = (await prompt(page).getAttribute("data-expected"))!.split(",").map(Number);
    expect(run).toHaveLength(15);
    await sing(page, run);
    await waitStep(page, "feedback");
    await expect(prompt(page)).toContainText("Right:");
  });
});
