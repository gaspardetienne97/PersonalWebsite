// Guitar and ukulele path drills from phase 3: ukulele strums in Rhythm and
// Strum a progression, campanella and chord melody in Phrases, triads, slides,
// speed bursts and the hardest five. Taps are scheduled in the page against the
// run's own downbeat; MIDI is stamped with each note's exact time.
import { expect, test, type Page } from "@playwright/test";
import { installFakeMidi, installSyntheticMic, PORTS, tap } from "./fixtures";

const SHOTS = "docs/screenshots/rebuild/strings";
const fret = (s: number, f: number) => `button[aria-label^="String ${s} fret ${f},"]`;

/** Saved settings for the run: no count-in, MIDI on, the strip on `instrument`. */
async function settle(page: Page, url: string, instrument: string) {
  await page.goto(url);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForTimeout(400);
  await page.evaluate(
    (instrument) =>
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
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
        open.onerror = () => reject(open.error);
      }),
    instrument,
  );
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

/** A fresh downbeat on `el` after Start (the attribute can hold the last run's). */
async function downbeatOf(page: Page, selector: string) {
  const el = page.locator(selector).first();
  await expect
    .poll(async () => Number((await el.getAttribute("data-downbeat")) ?? 0), { timeout: 10_000 })
    .toBeGreaterThan(0);
  return Number(await el.getAttribute("data-downbeat"));
}

test.describe("guitar and ukulele path drills", () => {
  test.beforeEach(async ({ page }) => {
    await page.routeWebSocket(
      () => true,
      () => {},
    );
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  for (const [pattern, bpm] of [
    ["ukulele-d-du", 90],
    ["ukulele-six-eight", 60],
  ] as const)
    test(`Rhythm: ${pattern} tapped in time hits every stroke`, async ({ page }) => {
      test.setTimeout(60_000);
      await settle(
        page,
        `/music/rhythm?mode=read-and-tap&instrument=ukulele&pattern=${pattern}&bpm=${bpm}`,
        "ukulele",
      );
      await expect(page.getByText("Setup:").locator("..")).toContainText(
        pattern === "ukulele-d-du" ? "D DU D DU" : "6/8",
      );
      await page.getByRole("button", { name: "Start", exact: true }).click();
      const downbeat = await downbeatOf(page, "[data-beat-ms]");
      const beatMs = Number(
        await page.locator("[data-beat-ms]").first().getAttribute("data-beat-ms"),
      );
      // Four bars of each, as the path writes them.
      const bar =
        pattern === "ukulele-d-du" ? [0, 1, 1.5, 2, 3, 3.5] : [0, 1 / 3, 2 / 3, 1, 4 / 3, 5 / 3];
      const per = pattern === "ukulele-d-du" ? 4 : 2;
      const beats = [0, 1, 2, 3].flatMap((b) => bar.map((x) => b * per + x));
      await page.evaluate(
        ({ beats, downbeat, beatMs }) => {
          const btn = document.querySelector<HTMLButtonElement>("button.tap")!;
          for (const b of beats)
            setTimeout(
              () =>
                btn.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 })),
              downbeat + b * beatMs - performance.now(),
            );
        },
        { beats, downbeat, beatMs },
      );
      await expect(page.getByRole("heading", { name: "Results" })).toBeAttached({
        timeout: 30_000,
      });
      // Every written note is green: none red (missed), one per stroke.
      const staff = page.getByTestId("rhythm-notation");
      await expect(staff.locator('[data-event][data-state="wrong"]')).toHaveCount(0);
      await expect(staff.locator('[data-event][data-state="correct"]')).toHaveCount(beats.length);
      await page.screenshot({ path: `${SHOTS}/rhythm-${pattern}-1280.png`, fullPage: true });
    });

  test("Strum a progression shows the chosen ukulele strum and records it", async ({ page }) => {
    await page.goto("/music/strum?instrument=ukulele&pattern=ukulele-calypso");
    await expect(page.getByText("Setup:").locator("..")).toContainText("calypso");
    // The pattern draws one arrow per stroke.
    await expect(page.locator('[data-pattern="ukulele-calypso"] svg').first()).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/strum-calypso-1280.png`, fullPage: true });
    // Back to any strum: the stroke row goes.
    await page.goto("/music/strum?instrument=ukulele&pattern=any");
    await expect(page.locator("[data-pattern]")).toHaveCount(0);
  });

  for (const [id, steps] of [
    ["ukulele.campanella-c-major", 15],
    ["ukulele.chord-melody-amazing-grace", 9],
  ] as const)
    test(`Phrases: ${id} played back in order`, async ({ page }) => {
      test.setTimeout(60_000);
      await installFakeMidi(page, [PORTS.keys]);
      await settle(page, `/music/phrases?phrase=${id}&bpm=80`, "ukulele");
      const stage = page.getByTestId("phrase");
      await expect(page.getByTestId("line-tab").locator("svg")).toBeVisible();
      await page.getByRole("button", { name: /^Start/ }).click();
      await expect(stage).toHaveAttribute("data-downbeat", /\d/, { timeout: 10_000 });
      const notes = JSON.parse((await stage.getAttribute("data-notes"))!) as [number, number][];
      const downbeat = Number(await stage.getAttribute("data-downbeat"));
      const beatMs = Number(await stage.getAttribute("data-beat-ms"));
      await page.evaluate(
        ({ notes, downbeat, beatMs, port }) => {
          for (const [midi, beat] of notes) {
            const at = downbeat + beat * beatMs;
            setTimeout(
              () => {
                (window as any).__midi.send(port, [0x90, midi, 90], at);
                (window as any).__midi.send(port, [0x80, midi, 0], at + beatMs * 0.4);
              },
              at - 80 - performance.now(),
            );
          }
        },
        { notes, downbeat, beatMs, port: PORTS.keys.id },
      );
      await expect(page.getByRole("status")).toContainText(`${steps} of ${steps} in order`, {
        timeout: 20_000,
      });
      await page.screenshot({ path: `${SHOTS}/${id}-1280.png`, fullPage: true });
    });

  test("Positions: major triads on strings 1 to 3 by synthetic microphone", async ({ page }) => {
    test.setTimeout(60_000);
    await installSyntheticMic(page, 110);
    await page.goto(
      "/music/fretboard?mode=positions&pattern=triads-major-strings-1-3&rootFret=5&instrument=guitar&bpm=60&perBeat=1",
    );
    await expect(page.getByText("Setup:").locator("..")).toContainText(
      "Major triads, strings 1 to 3",
    );
    await page.screenshot({ path: `${SHOTS}/triads-ready-1280.png`, fullPage: true });
    await page.getByRole("button", { name: "Turn on the microphone" }).first().click();
    await expect(page.getByText("Microphone on")).toBeVisible();
    await page.evaluate(() => (window as any).__mic.set(0));
    await page.getByRole("button", { name: "Start", exact: true }).click();
    const downbeat = await downbeatOf(page, "[data-step-ms]");
    // A major: C# E A, E A C#, A C# E, each inversion higher up the neck.
    await page.evaluate(
      ({ notes, downbeat }) => {
        const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);
        notes.forEach((m, i) =>
          setTimeout(
            () => (window as any).__mic.set(hz(m)),
            downbeat + i * 1000 - 50 - performance.now(),
          ),
        );
        setTimeout(
          () => (window as any).__mic.set(0),
          downbeat + notes.length * 1000 - performance.now(),
        );
      },
      { notes: [61, 64, 69, 64, 69, 73, 69, 73, 76], downbeat },
    );
    await expect(page.getByRole("heading", { name: "Results" })).toBeAttached({ timeout: 20_000 });
    const right = await page
      .getByText(/^\d+ of 9$/)
      .first()
      .textContent();
    expect(Number(right!.split(" ")[0])).toBeGreaterThanOrEqual(8);
  });

  test("Hammer-ons and pull-offs: the position shift slides by synthetic microphone", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await installSyntheticMic(page, 110);
    await page.goto(
      "/music/fretboard?mode=legato&pattern=slide-shift&string=3&startFret=5&instrument=guitar&bpm=60&perBeat=2",
    );
    await expect(page.getByText("Setup:").locator("..")).toContainText(
      "Position shift, 5 7/9h10p9\\7",
    );
    await page.getByRole("button", { name: "Turn on the microphone" }).first().click();
    await expect(page.getByText("Microphone on")).toBeVisible();
    await page.evaluate(() => (window as any).__mic.set(0));
    await page.getByRole("button", { name: "Start", exact: true }).click();
    const downbeat = await downbeatOf(page, "[data-step-ms]");
    const notes = Array.from({ length: 4 }, () => [60, 62, 64, 65, 64, 62]).flat();
    await page.evaluate(
      ({ notes, downbeat }) => {
        const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);
        notes.forEach((m, i) =>
          setTimeout(
            () => (window as any).__mic.set(hz(m)),
            downbeat + i * 500 - 30 - performance.now(),
          ),
        );
        setTimeout(
          () => (window as any).__mic.set(0),
          downbeat + notes.length * 500 - performance.now(),
        );
      },
      { notes, downbeat },
    );
    await expect(page.getByRole("heading", { name: "Results" })).toBeAttached({ timeout: 25_000 });
    const right = await page
      .getByText(/^\d+ of 24$/)
      .first()
      .textContent();
    expect(Number(right!.split(" ")[0])).toBeGreaterThanOrEqual(20);
    await expect(page.getByRole("article")).toContainText(
      "Hammered and pulled with no new pick attack",
    );
    await page.screenshot({ path: `${SHOTS}/slide-shift-results-1280.png`, fullPage: true });
  });

  test("Spider speed bursts: each cell, a rest as long, then the next", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto(
      "/music/fretboard?mode=spider&pattern=ascending-1234&tuning=guitar.standard&strings=5,6&startFret=5&crossing=0&instrument=guitar&bpm=60&perBeat=2&burst=true",
    );
    await expect(page.getByText("Setup:").locator("..")).toContainText("in bursts");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    const downbeat = await downbeatOf(page, "[data-step-ms]");
    const stepMs = Number(
      await page.locator("[data-step-ms]").first().getAttribute("data-step-ms"),
    );
    // String 6 frets 5 to 8, four steps of rest, then string 5.
    const taps = [
      [6, 5, 0],
      [6, 6, 1],
      [6, 7, 2],
      [6, 8, 3],
      [5, 5, 8],
      [5, 6, 9],
      [5, 7, 10],
      [5, 8, 11],
    ];
    await page.evaluate(
      ({ taps, downbeat, stepMs }) => {
        for (const [s, f, slot] of taps) {
          // Found when it fires: the neck redraws its range as the run starts.
          const el = () => document.querySelector(`button[aria-label^="String ${s} fret ${f},"]`)!;
          const at = downbeat + slot * stepMs - performance.now();
          const o = { bubbles: true, pointerId: 9, button: 0 };
          setTimeout(() => el().dispatchEvent(new PointerEvent("pointerdown", o)), at);
          setTimeout(() => el().dispatchEvent(new PointerEvent("pointerup", o)), at + 90);
        }
      },
      { taps, downbeat, stepMs },
    );
    await expect(page.getByRole("article").getByText("8 of 8", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("article")).toContainText("Clean at 60 BPM");
    // The last tap ends the run; it must not also move the spider's start fret.
    await expect(page.getByRole("article").getByText("8 of 8 taps")).toBeVisible();
    await expect(page.getByText("Setup:").locator("..")).toContainText("from fret 5");
    await page.screenshot({ path: `${SHOTS}/spider-bursts-1280.png`, fullPage: true });
  });

  test("Changes: a timed pair joins the hardest five, and ?hardest opens the slowest", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto(
      "/music/chords?mode=changes&shape=guitar.c-major&to=guitar.g-major&timed=0&trips=1&clock=0&instrument=guitar",
    );
    await page.getByRole("button", { name: "Practice", exact: true }).click();
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(page.getByRole("status")).toContainText(/Go\.|Play/, { timeout: 10_000 });
    const C = [
      [5, 3],
      [4, 2],
      [3, 0],
      [2, 1],
      [1, 0],
    ];
    const G = [
      [6, 3],
      [5, 2],
      [4, 0],
      [3, 0],
      [2, 0],
      [1, 3],
    ];
    for (const chord of [C, G, C]) {
      for (const [s, f] of chord) await tap(page, fret(s, f), 40);
      await page.waitForTimeout(700);
    }
    await expect(
      page
        .getByRole("article")
        .getByText(/2 changes/)
        .first(),
    ).toBeVisible({ timeout: 5000 });
    // Another pair is set up; the path's link opens the slowest pair instead.
    await page.goto(
      "/music/chords?mode=changes&instrument=guitar&chords=guitar.a-minor,guitar.e-minor&hardest=true",
    );
    await expect(page.getByText("Setup:").locator("..")).toContainText(
      "C and G, one of your hardest five",
    );
    await page.getByRole("button", { name: /C and G, one of your hardest five/ }).click();
    await expect(page.locator('[data-setup="hardest"]')).toContainText("C and G");
    await page.screenshot({ path: `${SHOTS}/changes-hardest-1280.png`, fullPage: true });
  });
});
