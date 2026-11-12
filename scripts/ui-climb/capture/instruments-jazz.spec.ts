// UI hill climb captures: piano and jazz vocabulary (voicings, licks, chord scales,
// comping, accompaniment, jam, call and response), learning by ear and phrases,
// every state from ready to results at both widths, over the fake MIDI keyboard.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  KEYS,
  PORTS,
  WIDTHS,
  attrFlow,
  attrRun,
  burst,
  captureDemo,
  captureLesson,
  goFlow,
  keep,
  mode,
  open,
  pickInstrument,
  playNow,
  prep,
  runningShots,
  shot,
  startButton,
  top,
  waitResults,
  waitSilent,
  type Attrs,
  type Note,
  type Step,
  type Width,
} from "./inst-helpers";

test.describe.configure({ mode: "parallel" });

const line = (notes: number[], stepMs: number, hold = 200): Step[] =>
  notes.map((m, i) => ({ at: i * stepMs, notes: [m], hold }));

/** Notes `[midi, beat]` from a stage's `data-notes`, at its beat length, stamped from the downbeat. */
const fromBeats = (pairs: [number, number][], d: number, beatMs: number): Note[] =>
  pairs.map(([m, b]) => [m, d + b * beatMs, beatMs * 0.4] as Note);

/** Keys the piano marks as this chord's targets. */
async function shownChord(page: Page) {
  const keys = page.locator(".piano [data-target]");
  await expect(keys.first()).toBeVisible();
  return (
    await keys.evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-midi"))))
  ).sort((a, b) => a - b);
}

for (const width of WIDTHS) {
  test(`voicings ${width}`, async ({ page }) => {
    test.setTimeout(240_000);
    await prep(page, width, { midi: [PORTS.keys], instrument: "piano" });
    const F = "voicings";
    const url = "/music/changes/voicings?variant=major&key=0&keys=1&strict=1";
    await open(page, url);
    await shot(page, F, "ready", width);
    await captureLesson(page, F, url, width);
    await open(page, url);
    await mode(page, "Practice");
    await captureDemo(page, F, width);

    const status = page.getByRole("status");
    const start = async () => {
      await startButton(page).click();
      await expect(status).toContainText("Play", { timeout: 10_000 });
    };
    const chord = async (notes: number[]) => {
      await playNow(page, [{ at: 0, notes, hold: 300 }]);
      await page.waitForTimeout(700);
    };

    // First chord right, then the second held with a wrong note and one note short.
    await start();
    await chord(await shownChord(page));
    const g7 = await shownChord(page);
    await page.evaluate(
      ({ notes, port }) => notes.forEach((n) => (window as any).__midi.send(port, [0x90, n, 90])),
      { notes: [...g7.slice(0, -1), g7.at(-1)! + 1], port: KEYS },
    );
    await page.waitForTimeout(300);
    if (width !== "phone") await top(page);
    await shot(page, F, "running", width);
    await page.evaluate(
      ({ notes, port }) => notes.forEach((n) => (window as any).__midi.send(port, [0x80, n, 0])),
      { notes: [...g7.slice(0, -1), g7.at(-1)! + 1], port: KEYS },
    );
    await page.waitForTimeout(700);
    await chord(await shownChord(page));
    await waitResults(page);
    await shot(page, F, "results-slip", width);

    await start();
    for (let i = 0; i < 3; i++) await chord(await shownChord(page));
    await waitResults(page);
    await shot(page, F, "results", width);

    await start();
    for (let i = 0; i < 3; i++) await chord([61, 66, 68]);
    await waitResults(page);
    await shot(page, F, "results-poor", width);

    await mode(page, "Check");
    await page
      .getByRole("button", { name: "Skip, I know this" })
      .click({ timeout: 1500 })
      .catch(() => {});
    await start();
    await page.waitForTimeout(300);
    if (width !== "phone") await top(page);
    await shot(page, F, "check", width);
    await page.keyboard.press("Escape");
    await mode(page, "Practice");

    await start();
    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: "Grade what I played" }).click();
      await page.waitForTimeout(600);
    }
    await waitSilent(page);
    await shot(page, F, "silent", width);
  });

  test(`licks ${width}`, async ({ page }) => {
    test.setTimeout(240_000);
    await prep(page, width, { midi: [PORTS.keys], instrument: "piano" });
    const lick = [
      62, 65, 69, 72, 69, 65, 62, 65, 67, 71, 74, 77, 74, 71, 67, 71, 72, 71, 67, 64, 67, 72, 76,
    ];
    await goFlow(page, {
      F: "licks",
      width,
      url: "/music/changes/licks?lick=1&key=C&bpm=80",
      steps: line(lick, 375, 250),
      wrong: { midi: 61, at: [2440, 5440], ms: 560 },
      poor: line(lick.slice(0, 5), 520, 250),
      checkAt: 3300,
    });
  });

  test(`chord-scales ${width}`, async ({ page }) => {
    test.setTimeout(240_000);
    await prep(page, width, { midi: [PORTS.keys], instrument: "piano" });
    const run = [
      62, 64, 65, 69, 69, 65, 64, 62, 67, 69, 71, 74, 74, 71, 69, 67, 60, 62, 64, 67, 67, 64, 62,
      60,
    ];
    await goFlow(page, {
      F: "chord-scales",
      width,
      url: "/music/changes/chord-scales?changes=major&key=C&pattern=1235&keys=1&bpm=80",
      steps: line(run, 375, 250),
      wrong: { midi: 61, at: [2440, 5440], ms: 560 },
      poor: line(run.slice(0, 4), 375, 250),
      checkAt: 3300,
    });
  });

  test(`comping ${width}`, async ({ page }) => {
    test.setTimeout(240_000);
    await prep(page, width, { midi: [PORTS.keys], instrument: "piano" });
    const beat = 60000 / 90;
    const lick: [number, number][] = [
      [67, 0],
      [70, 0.5],
      [72, 1],
      [70, 2],
      [67, 2.5],
      [64, 3],
      [63, 4],
      [64, 4.5],
      [67, 5],
      [60, 6],
    ];
    const comp = [0, 1.5, 4, 5.5];
    const steps: Step[] = [
      ...lick.map(([m, b]) => ({ at: b * beat, notes: [m], hold: 200 })),
      ...comp.map((b) => ({ at: b * beat + 3, notes: [48, 58], hold: 300 })),
    ].sort((a, b) => a.at - b.at);
    await goFlow(page, {
      F: "comping",
      width,
      url: "/music/changes/comping?pattern=blue-third-c7&bpm=90",
      steps,
      wrong: { midi: 73, at: [2.1 * beat, 4.6 * beat], ms: 420 },
      poor: steps.filter((_, i) => i % 3 === 0),
      checkAt: 3 * beat,
    });
  });

  test(`accompany ${width}`, async ({ page }) => {
    test.setTimeout(300_000);
    await prep(page, width, { midi: [PORTS.keys], instrument: "piano" });
    const build = (a: Attrs, d: number) => {
      const beatMs = Number(a["data-beat-ms"]);
      return (JSON.parse(a["data-slots"]) as [number, number[]][]).flatMap(([b, notes]) =>
        notes.map((m, k) => [m, d + b * beatMs + k * 3, beatMs * 0.4] as Note),
      );
    };
    await attrFlow(page, {
      F: "accompany",
      width,
      url: "/music/changes/accompany?mode=patterns&pattern=root-fifth-octave&progression=pop-axis&transpose=2&hands=both&bpm=100",
      testId: "accompany",
      build,
      poor: keep(4),
      runningAt: (a) => 6.3 * Number(a["data-beat-ms"]),
      wrong: {
        midi: 61,
        at: (a) => [5.2 * Number(a["data-beat-ms"]), 9.2 * Number(a["data-beat-ms"])],
      },
      check: true,
      after: async () => {
        // Comping over the blues, and a lead sheet: the other two tabs, ready.
        await open(
          page,
          "/music/changes/accompany?mode=comping&voicing=shells&rhythm=charleston&feel=swing&progression=blues&transpose=0&bpm=140",
        );
        await shot(page, "accompany", "comping-ready", width);
        await open(
          page,
          "/music/changes/accompany?mode=lead-sheet&tune=twinkle&lh=roots&hands=both&transpose=0&bpm=140",
        );
        await shot(page, "accompany", "lead-sheet-ready", width);
      },
    });
  });

  test(`jam ${width}`, async ({ page }) => {
    test.setTimeout(300_000);
    await prep(page, width, { midi: [PORTS.keys], instrument: "piano", countIn: 0 });
    const F = "jam";
    const url =
      "/music/changes/jam?progression=blues&transpose=0&backing=both&game=three-notes&choruses=1&bpm=160";
    // C and Eb on beats 1 and 2 of every bar of the blues.
    const notes = Array.from({ length: 12 }, (_, b) => [
      [60, b * 4],
      [63, b * 4 + 1],
    ]).flat() as [number, number][];
    const build = (a: Attrs, d: number) => fromBeats(notes, d, Number(a["data-beat-ms"]));
    await open(page, url);
    await shot(page, F, "ready", width);

    // Practice is open play: the tone roles on the keys, no score. Shot with a wrong note held.
    await mode(page, "Practice");
    const r = await attrRun(page, "jam-clock", (a, d) => [
      ...build(a, d),
      ...burst(66, d + 6.2 * Number(a["data-beat-ms"])),
      ...burst(66, d + 14.2 * Number(a["data-beat-ms"])),
    ]);
    const beat = Number(r.a["data-beat-ms"]);
    await runningShots(page, F, width, r.downbeat, [6.2 * beat + 160, 14.2 * beat + 160]);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    // Check grades the chorus against the game; its lesson comes first.
    await captureLesson(page, F, url, width);
    await open(page, url);
    await mode(page, "Check");
    await page
      .getByRole("button", { name: "Skip, I know this" })
      .click({ timeout: 1500 })
      .catch(() => {});
    const c = await attrRun(page, "jam-clock", build);
    await runningShots(page, F, width, c.downbeat, [9.3 * beat], "check");
    await waitResults(page, 90_000);
    await shot(page, F, "results", width);
    await attrRun(page, "jam-clock", (a, d) => keep(5)(build(a, d)));
    await waitResults(page, 90_000);
    await shot(page, F, "results-poor", width);
    await attrRun(page, "jam-clock", () => []);
    await waitSilent(page, 90_000);
    await shot(page, F, "silent", width);

    // A standard's lead sheet, trading fours.
    await open(
      page,
      "/music/changes/jam?progression=tune-jazz-blues&transpose=0&backing=both&game=chord-tones&choruses=1&trade=4&bpm=160",
    );
    await shot(page, F, "lead-sheet-ready", width);
  });

  test(`call-response ${width}`, async ({ page }) => {
    test.setTimeout(300_000);
    await prep(page, width, { midi: [PORTS.keys], countIn: 0, settings: { bpm: 150 } });
    // Every call echoed an octave up in the bar after it.
    const build = (a: Attrs, d: number) => {
      const beatMs = Number(a["data-beat-ms"]);
      const bars = Number(a["data-bars"]);
      const calls = JSON.parse(a["data-calls"]) as [number, number][][];
      return calls.flatMap((call, k) =>
        call.map(([m, b]) => [m + 12, d + ((k * 2 * bars + bars) * 4 + b) * beatMs, 120] as Note),
      );
    };
    await attrFlow(page, {
      F: "call-response",
      width,
      url: "/music/changes/call-response?mode=echo&groove=blues&bars=1",
      testId: "call-response",
      build,
      poor: (n) => n.slice(0, 3),
      runningAt: (a) => 5.5 * Number(a["data-beat-ms"]),
      check: true,
      demo: false,
    });
  });

  test(`phrases ${width}`, async ({ page }) => {
    test.setTimeout(300_000);
    await prep(page, width, { midi: [PORTS.keys], instrument: "piano", countIn: 0 });
    await attrFlow(page, {
      F: "phrases",
      width,
      url: "/music/phrases?phrase=piano.ode-to-joy&bpm=100",
      testId: "phrase",
      build: (a, d) => fromBeats(JSON.parse(a["data-notes"]), d, Number(a["data-beat-ms"])),
      poor: (n) => n.slice(0, 4),
      runningAt: (a) => 6.3 * Number(a["data-beat-ms"]),
      wrong: {
        midi: 61,
        at: (a) => [3.4 * Number(a["data-beat-ms"]), 8.4 * Number(a["data-beat-ms"])],
      },
      check: true,
      after: async () => {
        // The same drill on the other instruments: tab on guitar, fingering on the Aerophone.
        await open(page, "/music/phrases");
        await pickInstrument(page, "Guitar");
        await expect(page.getByTestId("line-tab").locator("svg")).toBeVisible();
        await shot(page, "phrases", "ready-guitar", width);
        await pickInstrument(page, "Aerophone");
        await expect(page.getByTestId("aerophone-fingering")).toBeVisible();
        await shot(page, "phrases", "ready-aerophone", width);
      },
    });
  });

  test(`by-ear ${width}`, async ({ page }) => {
    test.setTimeout(240_000);
    await prep(page, width, {});
    const F = "by-ear";
    // Not in the test's output folder: other capture runs clear that while this one runs.
    const wav = resolve(import.meta.dirname, `../../../.ui-climb/by-ear-${width}.wav`);
    aMinorWav(wav);
    const url = "/music/by-ear?mode=home";
    await open(page, url);
    await shot(page, F, "ready", width);
    await captureLesson(page, F, url, width);
    await open(page, url);
    await page.getByLabel("Import a recording file").setInputFiles(wav);
    await expect(page.getByRole("slider", { name: "Position in the recording" })).toBeVisible();
    await shot(page, F, "loaded", width);

    // Loop and mark a section while it plays.
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.waitForTimeout(800);
    await page.getByRole("button", { name: "Start loop" }).click();
    await page.waitForTimeout(1200);
    await page.getByRole("button", { name: "End loop" }).click();
    await page.getByRole("button", { name: "Verse", exact: true }).click();
    await page.waitForTimeout(300);
    await shot(page, F, "running", width);
    await page.getByRole("button", { name: "Pause" }).click();

    const home = (note: string) =>
      page
        .getByRole("group", { name: "Home note" })
        .getByRole("button", { name: note, exact: true });
    await startButton(page).click();
    await home("A").click();
    await expect(page.getByLabel("This run")).toContainText("Right: home is A.");
    await shot(page, F, "results", width);
    await startButton(page).click();
    await home("D").click();
    await page.waitForTimeout(400);
    await shot(page, F, "results-poor", width);

    // Learn a part: play along slowed down, then rate it.
    await open(page, "/music/by-ear?mode=learn&speed=0.75");
    // The recording stays picked from before; load it.
    const load = page.getByRole("button", { name: "Load and play" });
    if (await load.isVisible()) {
      await load.click();
      await page.getByRole("button", { name: "Pause" }).click();
    }
    await expect(page.getByRole("slider", { name: "Position in the recording" })).toBeVisible();
    await startButton(page).click();
    await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
    for (const m of [57, 60, 64]) {
      const el = page.locator(`[data-midi="${m}"]`).first();
      await el.dispatchEvent("pointerdown", { pointerId: 9, button: 0, bubbles: true });
      await page.waitForTimeout(90);
      await el.dispatchEvent("pointerup", { pointerId: 9, button: 0, bubbles: true });
    }
    await page.waitForTimeout(300);
    await shot(page, F, "learn-running", width);
    await page.getByRole("button", { name: /^Stop/ }).click();
    await shot(page, F, "learn-rate", width);
    await page.getByRole("button", { name: "I got it" }).click();
    await expect(page.getByLabel("This run")).toContainText("Saved as got it");
    await shot(page, F, "learn-results", width);
  });
}

/** Nine seconds of i-iv-V-i in A minor as a mono 16-bit WAV (as e2e/music/by-ear.spec.ts writes it). */
function aMinorWav(path: string) {
  const rate = 22050;
  const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);
  const chords = [
    [45, 57, 60, 64],
    [50, 62, 65, 69],
    [52, 56, 59, 64],
    [45, 57, 60, 64],
  ];
  const per = Math.round(rate * 0.75);
  const n = per * 12;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const ch = chords[Math.floor(i / per) % 4];
    const k = i % per;
    const env = Math.min(1, k / 200) * Math.exp((-k / rate) * 1.5);
    const v =
      (ch.reduce((s, m) => s + Math.sin((2 * Math.PI * hz(m) * k) / rate), 0) / ch.length) *
      0.5 *
      env;
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  writeFileSync(path, buf);
}
