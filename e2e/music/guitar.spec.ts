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

  test("Spider at the Rockschool Grade 3 click, two notes a click", async ({ page }) => {
    await page.goto(
      "/music/fretboard?mode=spider&pattern=ascending-1234&tuning=guitar.standard&string=6&span=single&startFret=5&crossing=0&instrument=guitar&bpm=90&perBeat=2&grade=rsl-grade-3",
    );
    await expect(page.getByText("Setup:").locator("..")).toContainText("90 BPM, two notes a click");
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
    await expect(page.getByText("Letters are the picking hand")).toBeVisible();
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
    for (const [st, f] of line) {
      await tap(page, fret(st, f));
      await page.waitForTimeout(240);
    }
    await expect(page.getByRole("heading", { name: "Results" })).toBeAttached({ timeout: 8000 });
    // Taps drift against the click in a headless browser; most of the line still lands.
    const right = await page
      .getByText(/^\d+ of 32$/)
      .first()
      .textContent();
    expect(Number(right!.split(" ")[0])).toBeGreaterThanOrEqual(26);
    await shoot(page, "fingerpick-results", 1280);
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
    // The microphone stops on results.
    await expect(page.locator("[data-mic]")).toHaveAttribute("data-mic", "off");
    await shoot(page, "positions-mic-results", 1280);
  });

  test("Note finder runs by tap", async ({ page }) => {
    await page.goto(
      "/music/fretboard?mode=note-finder&region=0&questions=5&tuning=guitar.standard&instrument=guitar",
    );
    await startDrill(page, "Practice");
    for (let i = 0; i < 5; i++) {
      await expect(page.getByRole("status")).toContainText(`Question ${i + 1}`);
      await tap(page, 'button[aria-label$=", target"]');
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
    // High-G C: C4 (3 open), E4 (2 open), G4 (4 open), C5 (1 fret 3), low to high by pitch.
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

  test("Strum and identify is honest about one oscillator", async ({ page }) => {
    await page.goto("/music/chords?mode=strum&shape=guitar.c-major&instrument=guitar");
    await expect(page.getByRole("button", { name: "Listen for a strum" })).toBeDisabled();
    await startMic(page);
    await startDrill(page, "Practice", "Listen for a strum");
    await expect(
      page.getByRole("article").getByText(/Not enough tones to name a chord/),
    ).toBeVisible({ timeout: 8000 });
    await expect(page.locator("[data-mic]")).toHaveAttribute("data-mic", "off");
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
    await expect(page.locator("[data-mic]")).toHaveAttribute("data-mic", "off");
    await shoot(page, "strum-results", 1280);
  });
});
