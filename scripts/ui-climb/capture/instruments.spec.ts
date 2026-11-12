// UI hill climb captures: the piano and string drills (scales on piano and guitar,
// two hands, pedal, chords and the fretboard on guitar and ukulele, strumming and
// the circle of fifths), every state from ready to results, at both widths.
import { expect, test, type Page } from "@playwright/test";
import {
  PORTS,
  WIDTHS,
  captureDemo,
  captureLesson,
  downbeatOf,
  goFlow,
  hasCheck,
  installChordMic,
  mode,
  nextRunButton,
  open,
  prep,
  runningShots,
  shot,
  startButton,
  startMic,
  tapChord,
  tapFretsAt,
  think,
  top,
  waitResults,
  waitSilent,
  type Step,
  type Width,
} from "./inst-helpers";

test.describe.configure({ mode: "parallel" });

/** Steps `beatMs` apart, one note each. */
const line = (notes: number[], beatMs: number, hold = 200): Step[] =>
  notes.map((m, i) => ({ at: i * beatMs, notes: [m], hold }));

const SCALE = [60, 62, 64, 65, 67, 69, 71, 72];
const scalesUrl =
  "/music/scales?pattern=scale&kind=major&tonic=60&span=one-octave&motion=up&hands=right&perBeat=1&grade=&bpm=40";
const scalesPoor: Step[] = [
  { at: 0, notes: [60], hold: 300 },
  { at: 2100, notes: [62], hold: 300 },
  { at: 3000, notes: [66], hold: 300 },
];

// ---- Fretted line drills (Spider): taps on the drawn neck at the run's own step times.

type Fret = [string: number, fret: number];

async function playLine(page: Page, taps: Fret[], extra: [number, number, number][] = []) {
  await startButton(page).click();
  const downbeat = await downbeatOf(page, "[data-step-ms]");
  const stepMs = Number(await page.locator("[data-step-ms]").first().getAttribute("data-step-ms"));
  await tapFretsAt(page, [
    ...taps.map(([s, f], i) => [s, f, downbeat + i * stepMs] as [number, number, number]),
    ...extra.map(([s, f, at]) => [s, f, downbeat + at * stepMs] as [number, number, number]),
  ]);
  return { downbeat, stepMs };
}

/** A wrong fret tapped over and over from step `at` for ~half a second. */
const wrongTaps = ([s, f]: Fret, at: number, stepMs: number): [number, number, number][] =>
  Array.from({ length: 4 }, (_, i) => [s, f, at + (i * 140) / stepMs]);

async function spiderFlow(
  page: Page,
  width: Width,
  F: string,
  url: string,
  taps: Fret[],
  wrong: Fret,
) {
  await open(page, url);
  await shot(page, F, "ready", width);
  await captureLesson(page, F, url, width);
  await open(page, url);
  await mode(page, "Practice");
  await captureDemo(page, F, width);

  // Step length from the ready page, so the wrong taps can be scheduled with the run.
  const stepMs = Number(await page.locator("[data-step-ms]").first().getAttribute("data-step-ms"));
  const a = await playLine(page, taps, [
    ...wrongTaps(wrong, 2.4, stepMs),
    ...wrongTaps(wrong, 5.4, stepMs),
  ]);
  await runningShots(page, F, width, a.downbeat, [2.4 * a.stepMs + 160, 5.4 * a.stepMs + 160]);
  await waitResults(page);
  await shot(page, F, "results-slip", width);

  for (let i = 0; i < 2; i++) {
    await playLine(page, taps);
    await waitResults(page);
    if (await nextRunButton(page).isVisible()) break;
  }
  await shot(page, F, "results", width);

  await startButton(page).click();
  const d = await downbeatOf(page, "[data-step-ms]");
  await tapFretsAt(page, [
    [taps[0][0], taps[0][1], d + 30],
    [taps[1][0], taps[1][1], d + stepMs * 1.45],
    [wrong[0], wrong[1], d + stepMs * 2.1],
  ]);
  await waitResults(page);
  await shot(page, F, "results-poor", width);

  if (await hasCheck(page)) {
    await mode(page, "Check");
    const c = await playLine(page, taps);
    await runningShots(page, F, width, c.downbeat, [3.3 * c.stepMs], "check");
    await waitResults(page);
    await mode(page, "Practice");
  }

  await startButton(page).click();
  await waitSilent(page);
  await shot(page, F, "silent", width);
}

// ---- Note finder: a named note, found by tapping the neck (untimed, one tap per question).

/**
 * Answer question `n` by tapping the neck: right taps a fret that sounds the asked note,
 * wrong taps one that does not. The note comes from the drill's status line and each
 * fret's own label, so it works in Check too, where nothing is lit.
 */
async function finderAnswer(page: Page, n: number, right: boolean) {
  await expect(page.locator('[role="status"]', { hasText: `Question ${n}: find` })).toBeAttached({
    timeout: 10_000,
  });
  const at = await page.evaluate((right) => {
    const pcOf = (name: string) =>
      ({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 })[name[0]]! +
      (name[1] === "#" ? 1 : name[1] === "b" ? -1 : 0) +
      12;
    const status = [...document.querySelectorAll('[role="status"]')]
      .map((s) => s.textContent ?? "")
      .find((t) => /Question \d+: find/.test(t))!;
    const want = pcOf(/find ([A-G]#?)\./.exec(status)![1]) % 12;
    for (const b of document.querySelectorAll<HTMLElement>("button[aria-label^='String ']")) {
      const m = /^String (\d+) fret (\d+), ([A-G]b?)/.exec(b.getAttribute("aria-label")!);
      if (m && b.offsetParent && (pcOf(m[3]) % 12 === want) === right) return [+m[1], +m[2]];
    }
    return null;
  }, right);
  await think(page, n);
  await tapChord(page, [at as Fret]);
}

async function finderFlow(page: Page, width: Width, F: string, instrument: string) {
  const url = `/music/fretboard?mode=note-finder&region=1&questions=5&instrument=${instrument}`;
  await open(page, url);
  await shot(page, F, "finder-ready", width);
  await mode(page, "Practice");

  // Run A: right, wrong (light shot in its reveal), right, wrong (dark shot), right.
  await startButton(page).click();
  if (width !== "phone") await top(page);
  for (const [n, right] of [
    [1, true],
    [2, false],
    [3, true],
    [4, false],
    [5, true],
  ] as const) {
    await finderAnswer(page, n, right);
    if (!right) {
      await page.waitForTimeout(80);
      await shot(page, F, "finder-running", width, { themes: [n === 2 ? "light" : "dark"] });
    }
  }
  await waitResults(page);

  // Clean runs until the next region is offered.
  for (let i = 0; i < 2; i++) {
    await startButton(page).click();
    for (let n = 1; n <= 5; n++) await finderAnswer(page, n, true);
    await waitResults(page);
    if (await nextRunButton(page).isVisible()) break;
  }
  await shot(page, F, "finder-results", width);

  // Check: nothing lit, the first note found, the second asked.
  await mode(page, "Check");
  await page
    .getByRole("button", { name: "Skip, I know this" })
    .click({ timeout: 1500 })
    .catch(() => {});
  await startButton(page).click();
  if (width !== "phone") await top(page);
  await finderAnswer(page, 1, true);
  await expect(page.locator('[role="status"]', { hasText: "Question 2: find" })).toBeAttached();
  await page.waitForTimeout(200);
  await shot(page, F, "finder-check", width);
}

// ---- Chord shapes (Build): untimed, tapped on the neck.

async function buildFlow(
  page: Page,
  width: Width,
  F: string,
  url: string,
  chord: Fret[],
  wrong: Fret,
) {
  await open(page, url);
  await shot(page, F, "ready", width);
  await captureLesson(page, F, url, width);
  await open(page, url);
  await mode(page, "Practice");
  await captureDemo(page, F, width);

  // Two strings right and one wrong, shot before the rest of the chord.
  await startButton(page).click();
  await page.waitForTimeout(600);
  await tapChord(page, [chord[0], chord[1], wrong]);
  await page.waitForTimeout(150);
  if (width !== "phone") await top(page);
  await shot(page, F, "running", width);
  await tapChord(page, chord.slice(2));
  await waitResults(page);
  await shot(page, F, "results-slip", width);

  for (let i = 0; i < 2; i++) {
    await startButton(page).click();
    await page.waitForTimeout(600);
    await tapChord(page, chord);
    await waitResults(page);
    if (await nextRunButton(page).isVisible()) break;
  }
  await shot(page, F, "results", width);

  await startButton(page).click();
  await page.waitForTimeout(600);
  await tapChord(page, [chord[0], wrong]);
  await page.getByRole("button", { name: "Stop", exact: true }).first().click();
  await waitResults(page);
  await shot(page, F, "results-poor", width);

  await mode(page, "Check");
  await page
    .getByRole("button", { name: "Skip, I know this" })
    .click({ timeout: 2000 })
    .catch(() => {});
  await startButton(page).click();
  await page.waitForTimeout(600);
  await tapChord(page, chord.slice(0, 2));
  await page.waitForTimeout(150);
  if (width !== "phone") await top(page);
  await shot(page, F, "check", width);
  await page.getByRole("button", { name: "Stop", exact: true }).first().click();
  await waitResults(page);
  await mode(page, "Practice");

  await startButton(page).click();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "Stop", exact: true }).first().click();
  await waitSilent(page);
  await shot(page, F, "silent", width);
}

const GUITAR_C: Fret[] = [
  [5, 3],
  [4, 2],
  [3, 0],
  [2, 1],
  [1, 0],
];
const GUITAR_G: Fret[] = [
  [6, 3],
  [5, 2],
  [4, 0],
  [3, 0],
  [2, 0],
  [1, 3],
];

for (const width of WIDTHS) {
  test(`scales-piano ${width}`, async ({ page }) => {
    test.setTimeout(240_000);
    await prep(page, width, { midi: [PORTS.keys], instrument: "piano" });
    await goFlow(page, {
      F: "scales-piano",
      width,
      url: scalesUrl,
      steps: line(SCALE, 1500, 700),
      wrong: { midi: 66, at: 4650, ms: 1200 },
      poor: scalesPoor,
      checkAt: 4700,
    });
  });

  test(`scales-guitar ${width}`, async ({ page }) => {
    test.setTimeout(240_000);
    await prep(page, width, { midi: [PORTS.keys], instrument: "guitar" });
    await goFlow(page, {
      F: "scales-guitar",
      width,
      url: scalesUrl,
      steps: line(SCALE, 1500, 700),
      wrong: { midi: 66, at: 4650, ms: 1200 },
      poor: scalesPoor,
      checkAt: 4700,
    });
  });

  test(`two-hand ${width}`, async ({ page }) => {
    test.setTimeout(240_000);
    await prep(page, width, { midi: [PORTS.keys], instrument: "piano" });
    // 50 BPM is the strip's floor: a beat every 1200 ms.
    const rh = [60, 62, 64, 65, 67, 65, 64, 62];
    const lh = [48, 47, 45, 43, 41, 43, 45, 47];
    await goFlow(page, {
      F: "two-hand",
      width,
      url: "/music/two-hand?pattern=contrary-five&hand=both&tonic=C4&bpm=50",
      steps: rh.map((m, i) => ({ at: i * 1200, notes: [lh[i], m], hold: 700 })),
      wrong: { midi: 70, at: [2600, 5000], ms: 500 },
      poor: rh.slice(0, 3).map((m, i) => ({ at: i * 1200 + (i ? 260 : 0), notes: [m], hold: 500 })),
      checkAt: 4000,
    });
  });

  test(`pedal ${width}`, async ({ page }) => {
    test.setTimeout(240_000);
    await prep(page, width, { midi: [PORTS.keys], instrument: "piano" });
    const chords = [
      [48, 60, 64, 67],
      [41, 60, 65, 69],
      [43, 59, 62, 67],
      [48, 60, 64, 67],
    ];
    const steps: Step[] = chords.flatMap((notes, k) => {
      const at = k * 4000;
      const s: Step[] = [{ at, notes, hold: 3500 }];
      if (k === 0) s.push({ at: at + 150, notes: [], cc: [64, 127] });
      else
        s.push({ at: at + 80, notes: [], cc: [64, 0] }, { at: at + 200, notes: [], cc: [64, 127] });
      return s;
    });
    // A weak run: the pedal never lifted, so the chords blur.
    const poor: Step[] = [
      { at: 0, notes: chords[0], hold: 3500 },
      { at: 50, notes: [], cc: [64, 127] },
      { at: 4300, notes: chords[1], hold: 3000 },
    ];
    await goFlow(page, {
      F: "pedal",
      width,
      url: "/music/pedal?progression=I-IV-V-I&key=0&rounds=1&bpm=60",
      steps,
      runningAt: 6500,
      poor,
      checkAt: 6500,
    });
  });

  test(`fretboard-guitar ${width}`, async ({ page }) => {
    test.setTimeout(240_000);
    await prep(page, width, { instrument: "guitar" });
    await spiderFlow(
      page,
      width,
      "fretboard-guitar",
      "/music/fretboard?mode=spider&pattern=ascending-1234&tuning=guitar.standard&strings=6,5&startFret=5&crossing=0&instrument=guitar&bpm=60",
      [
        [6, 5],
        [6, 6],
        [6, 7],
        [6, 8],
        [5, 5],
        [5, 6],
        [5, 7],
        [5, 8],
      ],
      [4, 9],
    );
  });

  test(`fretboard-ukulele ${width}`, async ({ page }) => {
    test.setTimeout(240_000);
    await prep(page, width, { instrument: "ukulele" });
    await spiderFlow(
      page,
      width,
      "fretboard-ukulele",
      "/music/fretboard?mode=spider&pattern=ascending-1234&strings=4,3&startFret=5&crossing=0&instrument=ukulele&bpm=60",
      [
        [4, 5],
        [4, 6],
        [4, 7],
        [4, 8],
        [3, 5],
        [3, 6],
        [3, 7],
        [3, 8],
      ],
      [2, 9],
    );
  });

  for (const instrument of ["guitar", "ukulele"] as const)
    test(`fretboard-${instrument} finder ${width}`, async ({ page }) => {
      test.setTimeout(240_000);
      await prep(page, width, { instrument });
      await finderFlow(page, width, `fretboard-${instrument}`, instrument);
    });

  test(`chords-guitar ${width}`, async ({ page }) => {
    test.setTimeout(240_000);
    await prep(page, width, { instrument: "guitar" });
    await buildFlow(
      page,
      width,
      "chords-guitar",
      "/music/chords?mode=build&shape=guitar.c-major&position=0&instrument=guitar",
      GUITAR_C,
      [1, 2],
    );
    // Chord changes, C to G and back, untimed.
    const F = "chords-guitar";
    const url =
      "/music/chords?mode=changes&chords=guitar.c-major,guitar.g-major,guitar.a-minor&positions=0,0,0&timed=0&trips=1&clock=0&instrument=guitar";
    await open(page, url);
    await shot(page, F, "changes-ready", width);
    await mode(page, "Practice");
    await startButton(page).click();
    await page.waitForTimeout(600);
    await tapChord(page, GUITAR_C);
    await page.waitForTimeout(700);
    await tapChord(page, GUITAR_G.slice(0, 4));
    if (width !== "phone") await top(page);
    await shot(page, F, "changes-running", width);
    await tapChord(page, GUITAR_G.slice(4));
    await page.waitForTimeout(700);
    await tapChord(page, [
      [5, 0],
      [4, 2],
      [3, 2],
      [2, 1],
      [1, 0],
    ]);
    await page.waitForTimeout(700);
    await tapChord(page, GUITAR_C);
    await waitResults(page);
    await shot(page, F, "changes-results", width);
  });

  test(`chords-ukulele ${width}`, async ({ page }) => {
    test.setTimeout(240_000);
    await prep(page, width, { instrument: "ukulele" });
    // High-G C: string 3 open (C4), 2 open (E4), 4 open (G4), 1 fret 3 (C5).
    await buildFlow(
      page,
      width,
      "chords-ukulele",
      "/music/chords?mode=build&shape=ukulele.c-major&position=0&instrument=ukulele",
      [
        [3, 0],
        [2, 0],
        [4, 0],
        [1, 3],
      ],
      [2, 2],
    );
  });

  test(`strum ${width}`, async ({ page }) => {
    test.setTimeout(240_000);
    await installChordMic(page);
    await prep(page, width, { instrument: "guitar" });
    const F = "strum";
    const url =
      "/music/strum?progression=guitar-g-d-em-c&choruses=1&strictness=relaxed&instrument=guitar&bpm=96";
    await open(page, url);
    await shot(page, F, "ready", width);
    await captureLesson(page, F, url, width);
    await open(page, url);
    await captureDemo(page, F, width);
    await startMic(page);
    await top(page);
    await shot(page, F, "mic-on", width);

    const G = [43, 47, 50, 55, 59, 67];
    const D = [50, 57, 62, 66];
    const Em = [40, 47, 52, 55, 59, 64];
    const C = [48, 52, 55, 60, 64];
    /** Strums at `beats` of each bar from "Go.", the chords in `bars`. The default is the starter
     *  pattern's strokes (D DU UDU), a good run; [0, 2] strums only beats 1 and 3, a poor one. */
    const strumRun = async (bars: (number[] | null)[], beats = [0, 1, 1.5, 2.5, 3, 3.5]) => {
      await page.evaluate(
        ([bars, beats]) => {
          const w = window as any;
          w.__capGo = 0;
          // Watch every status region: the calibration offer adds one above the drill's own.
          const goSaid = () =>
            [...document.querySelectorAll('[role="status"]')].some(
              (s) => s.textContent?.trim() === "Go.",
            );
          const obs = new MutationObserver(() => {
            if (!goSaid()) return;
            obs.disconnect();
            w.__capGo = performance.now();
            const beat = 60000 / 96;
            bars.forEach((ch, b) => {
              if (!ch) return;
              for (const k of beats) setTimeout(() => w.__chordMic.strum(ch), (b * 4 + k) * beat);
            });
          });
          obs.observe(document.body, { childList: true, characterData: true, subtree: true });
        },
        [bars, beats] as const,
      );
      await startButton(page).click();
      await expect
        .poll(() => page.evaluate(() => (window as any).__capGo), { timeout: 15_000 })
        .toBeGreaterThan(0);
      return page.evaluate(() => (window as any).__capGo as number);
    };

    const go = await strumRun([G, D, Em, C]);
    await expect(page.getByText(/Heard now:/).first()).toBeVisible();
    await runningShots(page, F, width, go, [3600]);
    await waitResults(page);
    await shot(page, F, "results", width);

    await strumRun([G, null, null, null], [0, 2]);
    await waitResults(page);
    await shot(page, F, "results-poor", width);

    await strumRun([null, null, null, null]);
    await waitSilent(page);
    await shot(page, F, "silent", width);
  });

  test(`circle ${width}`, async ({ page }) => {
    test.setTimeout(480_000);
    await prep(page, width, {});
    const F = "circle";
    const url = "/music/circle?mode=count&band=two";
    await open(page, url);
    await shot(page, F, "ready", width);
    await captureLesson(page, F, url, width);
    await open(page, url);

    const card = page.locator("article[data-mode]");
    const answers = page.getByRole("group", { name: "Answers" }).getByRole("button");
    const esc = (a: string) => a.replace(/[#♯♭]/g, (m) => `\\${m}`);
    let asked = 0;
    const answer = async (right: boolean) => {
      await expect(card).toHaveAttribute("data-step", "answer");
      const a = (await card.getAttribute("data-answer"))!;
      // The drill's clock runs ~0.6 s ahead of this wait: shown times land at ~1.1 to 1.8 s,
      // inside its 2 s mark, so a clean run stays clean.
      await think(page, asked++, [500, 1200]);
      if (right)
        await answers
          .filter({ hasText: new RegExp(`^${esc(a)}\\d?$`) })
          .first()
          .click();
      else
        await answers
          .filter({ hasNotText: new RegExp(`^${esc(a)}\\d?$`) })
          .first()
          .click();
    };
    const results = page.getByRole("heading", { name: "Results" });
    /** Answer prompts until the results show; `wrongAt` lists the prompts to miss. */
    const finishRun = async (wrong: (i: number) => boolean, from = 0) => {
      for (let i = from; i < 60 && !(await results.count()); i++) {
        await answer(!wrong(i));
        await page.keyboard.press("Enter");
        await page.waitForTimeout(120);
      }
    };

    await mode(page, "Practice");
    await startButton(page).click();
    await answer(true);
    await page.waitForTimeout(300);
    await shot(page, F, "running-right", width);
    await page.keyboard.press("Enter");
    await answer(false);
    await expect(card).toContainText("It was");
    await page.waitForTimeout(300);
    await shot(page, F, "running", width);
    await page.keyboard.press("Enter");
    await finishRun(() => false, 2);
    await waitResults(page);
    await shot(page, F, "results-slip", width);

    for (let i = 0; i < 2; i++) {
      await startButton(page).click();
      await finishRun(() => false);
      await waitResults(page);
      if (await nextRunButton(page).isVisible()) break;
    }
    await shot(page, F, "results", width);

    await startButton(page).click();
    await finishRun((i) => i % 3 !== 0);
    await waitResults(page);
    await shot(page, F, "results-poor", width);

    // The wheel to tap, in the signature exercise.
    await open(page, "/music/circle?mode=signature&band=four&clefs=treble");
    await startButton(page).click();
    await expect(card).toHaveAttribute("data-step", "answer");
    await page.waitForTimeout(300);
    await shot(page, F, "signature-running", width);

    await open(page, url);
    if (await hasCheck(page)) {
      await mode(page, "Check");
      await page
        .getByRole("button", { name: "Skip, I know this" })
        .click({ timeout: 1500 })
        .catch(() => {});
      await startButton(page).click();
      await expect(card).toHaveAttribute("data-step", "answer");
      await shot(page, F, "check", width);
    }
  });
}
