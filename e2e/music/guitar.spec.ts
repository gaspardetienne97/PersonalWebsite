// Guitar and ukulele drills end to end: on-screen fret taps and the synthetic
// microphone through the real getUserMedia path.
import { expect, test, type Page } from "@playwright/test";
import { expectNoHorizontalOverflow, installSyntheticMic, tap } from "./fixtures";

const SHOTS = "docs/screenshots/rebuild/guitar";
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
const fret = (s: number, f: number) => `button[aria-label^="String ${s} fret ${f},"]`;

async function shoot(page: Page, name: string, width: number, dark = false) {
  await page.setViewportSize({ width, height: 900 });
  await page.evaluate((d) => document.documentElement.classList.toggle("dark", d), dark);
  await page.waitForTimeout(150);
  await page.screenshot({
    path: `${SHOTS}/${name}-${width}-${dark ? "dark" : "light"}.png`,
    fullPage: true,
  });
}

/** One strum's worth of taps as a single in-page burst, so harness latency never splits a chord. */
async function tapChord(page: Page, frets: [number, number][]) {
  await page.evaluate(
    async (sels) => {
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      for (const sel of sels) {
        const el = document.querySelector(sel)!;
        const o = { bubbles: true, pointerId: 9, button: 0 };
        el.dispatchEvent(new PointerEvent("pointerdown", o));
        await sleep(40);
        el.dispatchEvent(new PointerEvent("pointerup", o));
        await sleep(20);
      }
    },
    frets.map(([s, f]) => fret(s, f)),
  );
}

/** Like the shared startDrill, but exact: "Start microphone" also begins with Start. */
async function startDrill(
  page: Page,
  mode: "Practice" | "Check" | null = "Practice",
  label = "Start",
) {
  if (mode) await page.getByRole("button", { name: mode, exact: true }).click();
  await page.getByRole("button", { name: label, exact: true }).click();
  await expect(page.getByRole("status")).toContainText(/Go\.|Play|Question/, { timeout: 10_000 });
}

async function startMic(page: Page) {
  await page.getByRole("button", { name: "Start microphone" }).click();
  await expect(page.getByText("Microphone on")).toBeVisible();
  await expect(page.getByRole("meter", { name: "Input level" })).toBeVisible();
}

test.describe("guitar drills", () => {
  test.beforeEach(async ({ page }) => {
    // On a shared dev server, other edits trigger HMR full reloads mid-run; the app
    // itself opens no sockets, so every WebSocket (the HMR one) is held silent.
    await page.routeWebSocket(
      () => true,
      () => {},
    );
    await installSyntheticMic(page, 110);
  });

  const ROUTES = [
    ["/music/fretboard?instrument=guitar", "Spider", "fretboard-spider"],
    ["/music/fretboard?mode=positions&instrument=guitar", "Positions", "fretboard-positions"],
    ["/music/fretboard?mode=note-finder&instrument=guitar", "Note finder", "fretboard-note-finder"],
    [
      "/music/fretboard?mode=interval-recall&instrument=guitar",
      "Interval recall",
      "fretboard-interval-recall",
    ],
    ["/music/chords?instrument=guitar", "Build the chord", "chords-build"],
    ["/music/chords?mode=pick&instrument=guitar", "Pick it clean", "chords-pick"],
    ["/music/chords?mode=strum&instrument=guitar", "Strum and identify", "chords-strum"],
    ["/music/chords?mode=changes&instrument=guitar", "Chord changes", "chords-changes"],
    ["/music/strum?instrument=guitar", "Strum a progression", "strum"],
    ["/music/fretboard?instrument=ukulele", "Spider", "ukulele-spider"],
  ] as const;

  for (const [url, h1, shot] of ROUTES) {
    test(`${shot} loads without overflow`, async ({ page }) => {
      await page.goto(url);
      await expect(page.getByRole("heading", { level: 1, name: h1 })).toBeVisible();
      for (const w of [375, 1280]) {
        await page.setViewportSize({ width: w, height: 900 });
        await expectNoHorizontalOverflow(page);
      }
      await shoot(page, shot, 1280);
      await shoot(page, shot, 375, true);
    });
  }

  test("tab above the fretboard wherever notes are played in time", async ({ page }) => {
    for (const url of [
      "/music/fretboard?mode=spider&instrument=guitar",
      "/music/fretboard?mode=positions&instrument=guitar",
      "/music/fretboard?mode=legato&instrument=ukulele",
      "/music/chords?mode=fingerpick&instrument=guitar",
      "/music/chords?mode=pick&shape=guitar.g-major&instrument=guitar",
      "/music/licks?lick=30&instrument=guitar&bpm=96",
    ]) {
      await page.goto(url);
      await expect(page.getByTestId("line-tab").locator("svg"), url).toBeVisible();
    }
    // Check mode hides it, like the targets.
    await page.goto("/music/fretboard?mode=spider&instrument=guitar");
    await page.getByRole("button", { name: "Check", exact: true }).click();
    await expect(page.getByTestId("line-tab")).toHaveCount(0);
  });

  test("Spider runs by fret taps to results", async ({ page }) => {
    await page.goto(
      "/music/fretboard?mode=spider&pattern=ascending-1234&tuning=guitar.standard&string=6&span=single&startFret=5&crossing=0&instrument=guitar&bpm=80",
    );
    await startDrill(page, "Practice");
    for (const f of [5, 6, 7, 8]) {
      await tap(page, fret(6, f));
      await page.waitForTimeout(660);
    }
    await expect(
      page.getByRole("article").getByText(/Clean at 80 BPM|notes right|spacing wandered/),
    ).toBeVisible({ timeout: 8000 });
    await expect(page.getByRole("article").getByText("4 of 4", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("article").getByText("On the written string and fret"),
    ).toBeVisible();
    await shoot(page, "spider-results", 1280);
    await shoot(page, "spider-results", 375, true);
  });

  test("Spider setup: any strings, any finger order, three notes a click", async ({ page }) => {
    await page.goto("/music/fretboard?mode=spider&instrument=guitar&startFret=5&crossing=0");
    await page.getByRole("button", { name: "Setup", exact: true }).click();
    // Strings as toggles: keep 1, 3 and 6.
    const strings = page.getByRole("group", { name: "Strings" });
    for (let n = 1; n <= 6; n++) {
      const b = strings.getByRole("button", { name: new RegExp(`^String ${n},`) });
      const want = [1, 3, 6].includes(n);
      if ((await b.getAttribute("aria-pressed")) !== String(want)) await b.click();
    }
    // The finger order, tapped: 4, 1, 2, 3.
    const fingers = page.getByRole("group", { name: "Tap the fingers in order" });
    for (const f of ["4 pinky", "1 index", "2 middle", "3 ring"])
      await fingers.getByRole("button", { name: f }).click();
    await page
      .getByRole("group", { name: "Notes a click" })
      .getByRole("button", { name: /^3/ })
      .click();
    const setupLine = page.getByText("Setup:").locator("..");
    await expect(setupLine).toContainText("4-1-2-3");
    await expect(setupLine).toContainText("strings 1, 3 and 6");
    await expect(setupLine).toContainText("three notes a click");
    await page.getByRole("button", { name: "Hide setup" }).click();
    // On each string the dots read the order: fret 5 (index) is played second.
    await expect(page.locator(fret(6, 5))).toHaveAttribute(
      "aria-label",
      /note 2 of the pattern, index finger/,
    );
    await expect(page.locator(fret(6, 8))).toHaveAttribute(
      "aria-label",
      /note 1 of the pattern, little finger/,
    );
    await expect(page.locator(fret(5, 5)).locator(".dot")).toHaveCount(0);
    // Triplets are written in 12/8.
    await expect(page.getByTestId("line-tab").locator("svg")).toBeVisible();
    await shoot(page, "spider-setup", 1280);
  });

  test("Spider at the Rockschool Grade 3 click, two notes a click", async ({ page }) => {
    await page.goto(
      "/music/fretboard?mode=spider&pattern=ascending-1234&tuning=guitar.standard&string=6&span=single&startFret=5&crossing=0&instrument=guitar&bpm=90&perBeat=2&grade=rsl-grade-3",
    );
    await expect(page.getByText("Setup:").locator("..")).toContainText(
      "two notes a click, aiming for Rockschool Grade 3",
    );
    await startDrill(page, "Practice");
    for (const f of [5, 6, 7, 8]) {
      await tap(page, fret(6, f));
      await page.waitForTimeout(333);
    }
    await expect(
      page.getByRole("article").getByText("Rockschool Grade 3 click, 90 BPM"),
    ).toBeVisible({
      timeout: 8000,
    });
  });

  test("Fingerpicking: Travis over C and Am by fret taps", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto(
      "/music/chords?mode=fingerpick&pattern=travis&shape=guitar.c-major&to=guitar.a-minor&instrument=guitar&bpm=120&perBeat=2",
    );
    await expect(page.getByText("Setup:").locator("..")).toContainText(
      "Travis picking, alternating bass, C then Am",
    );
    await expect(page.getByText(/colours the fretting hand/)).toBeVisible();
    // The picking order above the neck; C's fret 3 on string 5 is the ring finger's.
    const order = page.getByRole("list", { name: "Picking order" });
    await expect(order.getByRole("listitem")).toHaveCount(8);
    await expect(order.getByRole("listitem").first()).toHaveText("pbass");
    await expect(page.locator(fret(5, 3))).toHaveAttribute("aria-label", /, ring finger$/);
    // The chords drawn above, and the key for both hands under the neck.
    await expect(
      page.getByRole("list", { name: "The chords in order" }).getByRole("listitem"),
    ).toHaveCount(2);
    const key = page.getByLabel("Finger key");
    await expect(key).toContainText("Fretting hand");
    await expect(key).toContainText("Picking hand");
    await startDrill(page, "Practice");
    const C: [number, number][] = [
      [5, 3],
      [3, 0],
      [4, 2],
      [2, 1],
    ];
    const Am: [number, number][] = [
      [5, 0],
      [3, 2],
      [4, 2],
      [2, 1],
    ];
    const line = [...C, ...C, ...Am, ...Am, ...C, ...C, ...Am, ...Am];
    // Every tap scheduled in the page from one start, a note every 250 ms (120 BPM, two a
    // click), so a busy machine delays single taps but never lets them drift.
    await page.evaluate(
      (sels) => {
        const t0 = performance.now();
        sels.forEach((sel, i) => {
          const o = { bubbles: true, pointerId: 9, button: 0 };
          setTimeout(
            () => {
              const el = document.querySelector(sel)!;
              el.dispatchEvent(new PointerEvent("pointerdown", o));
              setTimeout(() => el.dispatchEvent(new PointerEvent("pointerup", o)), 40);
            },
            t0 + i * 250 - performance.now(),
          );
        });
      },
      line.map(([st, f]) => fret(st, f)),
    );
    await expect(page.getByRole("heading", { name: "Results" })).toBeAttached({ timeout: 8000 });
    // Taps drift against the click in a headless browser; most of the line still lands.
    const right = await page
      .getByText(/^\d+ of 32$/)
      .first()
      .textContent();
    expect(Number(right!.split(" ")[0])).toBeGreaterThanOrEqual(26);
    await shoot(page, "fingerpick-results", 1280);
  });

  test("Bends by synthetic microphone: one in tune, one flat", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto(
      "/music/fretboard?mode=bends&exercise=whole&string=3&fret=7&reps=2&instrument=guitar",
    );
    await expect(page.getByText("Setup:").locator("..")).toContainText(
      "Bend a whole step, string 3, fret 7 (D4 to E4)",
    );
    // Bends have no Check: the string, fret and target are always shown.
    await expect(page.getByRole("button", { name: "Check", exact: true })).toHaveCount(0);
    await startMic(page);
    const set = (midi: number, cents = 0) =>
      page.evaluate(
        (f) => (window as any).__mic.set(f),
        440 * 2 ** ((midi - 69 + cents / 100) / 12),
      );
    await set(62);
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("1 of 2: pick D4");
    await page.waitForTimeout(300);
    await set(62, 190); // 10 cents short of E4: in tune
    await expect(page.getByRole("status")).toContainText("In tune", { timeout: 6000 });
    await set(62);
    await expect(page.getByRole("status")).toContainText("2 of 2: pick D4", { timeout: 4000 });
    await page.waitForTimeout(300);
    await set(62, 160); // 40 cents short: flat
    await expect(page.getByRole("status")).toContainText("1 of 2 in tune", { timeout: 8000 });
    await expect(page.getByRole("article")).toContainText(/flat, -\d+ cents/);
    await page.evaluate(() => (window as any).__mic.set(0));
    await shoot(page, "bends-results", 1280);
  });

  test("Vibrato by synthetic microphone: rate and width measured", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto(
      "/music/fretboard?mode=bends&exercise=vibrato&string=2&fret=8&reps=2&instrument=guitar",
    );
    await startMic(page);
    // G4 on string 2 fret 8, wobbling 30 cents either way at 5 a second.
    await page.evaluate(() => {
      const t0 = performance.now();
      (window as any).__wobble = setInterval(() => {
        const c = 30 * Math.sin((2 * Math.PI * 5 * (performance.now() - t0)) / 1000);
        (window as any).__mic.set(440 * 2 ** ((67 - 69 + c / 100) / 12));
      }, 20);
    });
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(page.getByRole("status")).toContainText(/Vibrato at about \d\.\d a second/, {
      timeout: 15_000,
    });
    await page.evaluate(() => {
      clearInterval((window as any).__wobble);
      (window as any).__mic.set(0);
    });
  });

  test("Hammer-ons and pull-offs by synthetic microphone: no new attack reads as legato", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto(
      "/music/fretboard?mode=legato&pattern=hammer-pull&string=3&startFret=5&instrument=guitar&bpm=60&perBeat=2",
    );
    await expect(page.getByText("Setup:").locator("..")).toContainText(
      "Hammer on, pull off: 0 2 0, on string 3 from fret 5",
    );
    await startMic(page);
    await page.evaluate(() => (window as any).__mic.set(0));
    await startDrill(page, "Practice");
    // One unbroken tone moving C4 D4 C4 four times, a note every 500 ms: no new attacks.
    await page.evaluate(() => {
      const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);
      const notes = [60, 62, 60, 60, 62, 60, 60, 62, 60, 60, 62, 60];
      notes.forEach((m, i) => setTimeout(() => (window as any).__mic.set(hz(m)), i * 500));
      setTimeout(() => (window as any).__mic.set(0), notes.length * 500);
    });
    await expect(page.getByRole("heading", { name: "Results" })).toBeAttached({ timeout: 15_000 });
    await expect(page.getByRole("article")).toContainText(
      "Hammered and pulled with no new pick attack",
    );
    await shoot(page, "legato-results", 1280);
  });

  test("Positions box 1 runs by synthetic microphone", async ({ page }) => {
    await page.goto(
      "/music/fretboard?mode=positions&pattern=minor-pentatonic-box-1&rootFret=5&instrument=guitar&bpm=60",
    );
    await startMic(page);
    await page.evaluate(() => (window as any).__mic.set(0));
    await startDrill(page, "Practice");
    for (const m of [45, 48, 50, 52, 55, 57, 60, 62, 64, 67, 69, 72]) {
      await page.evaluate((f) => (window as any).__mic.set(f), hz(m));
      await page.waitForTimeout(1000);
    }
    await page.evaluate(() => (window as any).__mic.set(0));
    await expect(page.getByRole("heading", { name: "Results" })).toBeAttached({ timeout: 10_000 });
    const notes = await page
      .getByText(/^\d+ of 12$/)
      .first()
      .textContent();
    expect(Number(notes!.split(" ")[0])).toBeGreaterThanOrEqual(10);
    // The microphone stays on between runs.
    await expect(page.locator("[data-mic]")).toHaveAttribute("data-mic", "on");
    await shoot(page, "positions-mic-results", 1280);
  });

  test("Note finder runs by tap", async ({ page }) => {
    await page.goto(
      "/music/fretboard?mode=note-finder&region=0&questions=5&tuning=guitar.standard&instrument=guitar",
    );
    await startDrill(page, "Practice");
    for (let i = 0; i < 5; i++) {
      await expect(page.getByRole("status")).toContainText(`Question ${i + 1}`);
      await tap(page, "button[data-target]");
      await page.waitForTimeout(1100);
    }
    await expect(page.getByRole("article").getByText(/All 5 found/)).toBeVisible({ timeout: 5000 });
    await shoot(page, "note-finder-results", 1280);
  });

  test("Chord Build runs by taps", async ({ page }) => {
    await page.goto("/music/chords?mode=build&shape=guitar.c-major&position=0&instrument=guitar");
    await startDrill(page, "Practice");
    await tapChord(page, [
      [5, 3],
      [4, 2],
      [3, 0],
      [2, 1],
      [1, 0],
    ]);
    await expect(
      page.getByRole("article").getByText(/All 5 target notes of C matched/),
    ).toBeVisible({ timeout: 5000 });
    await expect(
      page.getByRole("article").getByText("Which string each note came from"),
    ).toBeVisible();
    await expect(page.getByText(/rang clean/)).toHaveCount(0);
    await shoot(page, "build-results", 1280);
    await shoot(page, "build-results", 375, true);
  });

  test("Ukulele Build runs by taps with ukulele strings", async ({ page }) => {
    await page.goto("/music/chords?mode=build&shape=ukulele.c-major&position=0&instrument=ukulele");
    await expect(page.getByRole("group", { name: /on the ukulele neck/ })).toBeVisible();
    await startDrill(page, "Check");
    // High-G C: C4 (3 open), E4 (2 open), G4 (4 open), C5 (1 fret 3); Build matches by pitch, in any order.
    await tapChord(page, [
      [3, 0],
      [2, 0],
      [4, 0],
      [1, 3],
    ]);
    await expect(
      page.getByRole("article").getByText(/All 4 target notes of C matched from memory/),
    ).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("article").getByText(/counts toward mastery/)).toBeVisible();
  });

  test("Ukulele G7, one of the London College syllabus chords, builds by taps", async ({
    page,
  }) => {
    await page.goto("/music/chords?mode=build&shape=ukulele.g7&position=0&instrument=ukulele");
    await startDrill(page, "Check");
    // G7 on high-G: D4 (3 fret 2), F4 (2 fret 1), G4 (4 open), B4 (1 fret 2).
    await tapChord(page, [
      [3, 2],
      [2, 1],
      [4, 0],
      [1, 2],
    ]);
    await expect(
      page.getByRole("article").getByText(/All 4 target notes of G7 matched from memory/),
    ).toBeVisible({ timeout: 5000 });
  });

  test("Changes, untimed, one round trip, by taps", async ({ page }) => {
    await page.goto(
      "/music/chords?mode=changes&shape=guitar.c-major&to=guitar.g-major&timed=0&trips=1&clock=0&instrument=guitar",
    );
    await startDrill(page, "Practice");
    const C: [number, number][] = [
      [5, 3],
      [4, 2],
      [3, 0],
      [2, 1],
      [1, 0],
    ];
    const G: [number, number][] = [
      [6, 3],
      [5, 2],
      [4, 0],
      [3, 0],
      [2, 0],
      [1, 3],
    ];
    await tapChord(page, C);
    await page.waitForTimeout(700);
    await tapChord(page, G);
    await page.waitForTimeout(700);
    await tapChord(page, C);
    await expect(
      page.getByRole("article").getByText(/2 changes, 2 with every target note/),
    ).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("changes per minute").first()).toBeVisible();
    await shoot(page, "changes-results", 1280);
    await shoot(page, "changes-results", 375, true);
  });

  test("Changes round three chords, each drawn above the neck, with a chosen position", async ({
    page,
  }) => {
    await page.goto(
      "/music/chords?mode=changes&chords=guitar.c-major,guitar.g-major,guitar.a-minor&timed=0&trips=1&clock=0&instrument=guitar",
    );
    const strip = page.getByRole("list", { name: "The chords in order" });
    await expect(strip.getByRole("listitem")).toHaveCount(3);
    await expect(page.getByText("Setup:").locator("..")).toContainText("C, G, Am");
    // The setup: add a fourth chord, then move the first one up the neck.
    await page.getByRole("button", { name: "Setup", exact: true }).click();
    await page.getByRole("button", { name: "Add chord" }).click();
    await expect(page.getByRole("button", { name: /^Chord \d: / })).toHaveCount(4);
    await page.getByRole("button", { name: /^Chord 1: C,/ }).click();
    const necks = page.getByRole("group", { name: "Neck position" });
    await necks.getByRole("button").nth(1).click();
    await expect(page.getByRole("button", { name: /^Chord 1: C,/ })).not.toHaveAccessibleName(
      /Open/,
    );
    await page.getByRole("button", { name: "Remove C" }).click();
    await page
      .getByRole("button", { name: /^Remove / })
      .last()
      .click();
    await page.getByRole("button", { name: "Hide setup" }).click();
    await shoot(page, "changes-cycle-ready", 1280);

    // A fresh three-chord run by taps: C, G, Am and back to C is three changes.
    await page.goto(
      "/music/chords?mode=changes&chords=guitar.c-major,guitar.g-major,guitar.a-minor&positions=0,0,0&timed=0&trips=1&clock=0&instrument=guitar",
    );
    await startDrill(page, "Practice");
    const C: [number, number][] = [
      [5, 3],
      [4, 2],
      [3, 0],
      [2, 1],
      [1, 0],
    ];
    const G: [number, number][] = [
      [6, 3],
      [5, 2],
      [4, 0],
      [3, 0],
      [2, 0],
      [1, 3],
    ];
    const Am: [number, number][] = [
      [5, 0],
      [4, 2],
      [3, 2],
      [2, 1],
      [1, 0],
    ];
    for (const chord of [C, G, Am, C]) {
      await tapChord(page, chord);
      await page.waitForTimeout(700);
    }
    await expect(
      page.getByRole("article").getByText(/3 changes, 3 with every target note/),
    ).toBeVisible({ timeout: 5000 });
  });

  test("Fingerpicking with a pinch and a hold, and a pattern in three", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto(
      "/music/chords?mode=fingerpick&pattern=dust-pinch&chords=guitar.c-major,guitar.a-minor&instrument=guitar&bpm=120&perBeat=2",
    );
    const order = page.getByRole("list", { name: "Picking order" });
    await expect(order.getByRole("listitem").first()).toHaveText("pmbass + 2");
    await expect(order.getByRole("listitem").nth(1)).toHaveText("hold");
    await startDrill(page, "Practice");
    // A bar of eight steps: the pinch (bass and string 2 together), a hold, then single notes.
    const bar = (
      b: [number, number],
      two: [number, number],
      alt: [number, number],
      three: [number, number],
    ) => [[b, two], [], [alt], [three], [b], [two], [alt], [three]];
    const C = bar([5, 3], [2, 1], [4, 2], [3, 0]);
    const Am = bar([5, 0], [2, 1], [4, 2], [3, 2]);
    const steps = [...C, ...Am, ...C, ...Am];
    await page.evaluate(
      (sels) => {
        const t0 = performance.now();
        sels.forEach((step, i) =>
          step.forEach((sel, j) => {
            const o = { bubbles: true, pointerId: 9 + j, button: 0 };
            setTimeout(
              () => {
                const el = document.querySelector(sel)!;
                el.dispatchEvent(new PointerEvent("pointerdown", o));
                setTimeout(() => el.dispatchEvent(new PointerEvent("pointerup", o)), 40);
              },
              t0 + i * 250 - performance.now(),
            );
          }),
        );
      },
      steps.map((st) => st.map(([str, f]) => fret(str, f))),
    );
    await expect(page.getByRole("heading", { name: "Results" })).toBeAttached({ timeout: 10_000 });
    const right = await page
      .getByText(/^\d+ of 32$/)
      .first()
      .textContent();
    expect(Number(right!.split(" ")[0])).toBeGreaterThanOrEqual(26);

    // Six steps are a bar of three: 3/4 at two notes a click.
    await page.goto("/music/chords?mode=fingerpick&pattern=rolling&instrument=guitar&perBeat=2");
    await expect(page.getByText("Setup:").locator("..")).toContainText("a bar each");
    await expect(page.getByTestId("line-tab").locator("svg")).toBeVisible();
    await page.getByRole("button", { name: "Setup", exact: true }).click();
    await expect(page.getByRole("group", { name: "In three (3/4 or 6/8)" })).toBeVisible();
    await shoot(page, "fingerpick-patterns", 1280);
  });

  test("Fingerpicking from a song: pattern, chords and tempo in one tap", async ({ page }) => {
    await page.goto("/music/chords?mode=fingerpick&instrument=guitar");
    await page.getByRole("button", { name: "Setup", exact: true }).click();
    await page
      .getByRole("group", { name: "Start from a song" })
      .getByRole("button", { name: /^House of the Rising Sun/ })
      .click();
    const setupLine = page.getByText("Setup:").locator("..");
    await expect(setupLine).toContainText("House of the Rising Sun (The Animals)");
    await expect(setupLine).toContainText("Am then C then D then F then Am then E");
    await expect(setupLine).toContainText("three notes a click");
    await expect(page.getByRole("button", { name: /^Tempo 58 BPM/ })).toBeVisible();
    await expect(page.getByText(/no capo\. Tempo 58\./)).toBeVisible();
    await page.getByRole("button", { name: "Hide setup" }).click();
    await expect(
      page.getByRole("list", { name: "The chords in order" }).getByRole("listitem"),
    ).toHaveCount(6);
    await shoot(page, "fingerpick-song", 1280);
  });

  test("Fingerpicking over three chords, each with its diagram", async ({ page }) => {
    await page.goto(
      "/music/chords?mode=fingerpick&pattern=pima&chords=guitar.c-major,guitar.a-minor,guitar.g-major&instrument=guitar",
    );
    await expect(page.getByText("Setup:").locator("..")).toContainText("C then Am then G");
    await expect(
      page.getByRole("list", { name: "The chords in order" }).getByRole("listitem"),
    ).toHaveCount(3);
    await page.getByRole("button", { name: "Setup", exact: true }).click();
    await expect(page.getByRole("button", { name: /^Chord \d: / })).toHaveCount(3);
    await shoot(page, "fingerpick-cycle", 1280);
  });

  test("Strum and identify is honest about one oscillator", async ({ page }) => {
    await page.goto("/music/chords?mode=strum&shape=guitar.c-major&instrument=guitar");
    await expect(page.getByRole("button", { name: "Listen for a strum" })).toBeDisabled();
    await startMic(page);
    await startDrill(page, "Practice", "Listen for a strum");
    await expect(
      page.getByRole("article").getByText(/Not enough tones to name a chord/),
    ).toBeVisible({ timeout: 8000 });
    await expect(page.locator("[data-mic]")).toHaveAttribute("data-mic", "on");
    await shoot(page, "strum-identify-results", 1280);
  });

  test("Strum a progression follows the synthetic microphone", async ({ page }) => {
    await page.goto(
      "/music/strum?progression=guitar-g-d-em-c&choruses=1&strictness=relaxed&instrument=guitar&bpm=160",
    );
    await startMic(page);
    await startDrill(page, null);
    await expect(page.getByText(/Heard now:/)).toBeVisible();
    await expect(page.getByRole("meter", { name: "Input level" })).toBeVisible();
    await shoot(page, "strum-running", 1280);
    await expect(
      page
        .getByRole("article")
        .getByText(/chords followed|No strums were heard/)
        .first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("article").getByText(/does not count toward any skill/),
    ).toBeVisible();
    await expect(page.locator("[data-mic]")).toHaveAttribute("data-mic", "on");
    await shoot(page, "strum-results", 1280);
  });
});
