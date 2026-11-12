// Rhythm and reading captures. One test per drill and width: the intro lesson (lessons
// on), the ready page, a run mid-way with live feedback showing (taps landing over the
// fake MIDI keyboard, one of them off), a good run's results, and a silent run where
// nothing was played. Timed taps are stamped against the stage's own data-downbeat.
import { expect, test, type Page } from "@playwright/test";
import { shot, type Width } from "./lib";
import {
  midiNote,
  openWithMidi,
  pickMode,
  armTaps,
  PORTS,
  rhythmDownbeat,
  setup,
  shootLesson,
  skipLesson,
  startBtn,
  toResults,
  toStage,
  toTop,
  waitUntil,
  WIDTHS,
} from "./hub-drills";

/** Lesson (if any), then the ready page. */
async function intro(page: Page, flow: string, width: Width, url: string) {
  await setup(page, width, { lessons: true });
  await openWithMidi(page, url, { countInBars: 1 });
  if (!(await shootLesson(page, flow, width))) console.log(`${flow}: no lesson`);
  await skipLesson(page);
  await toTop(page);
  await expect(startBtn(page)).toBeVisible();
  await shot(page, flow, "ready", width);
}

/** A silent run: Again, play nothing, wait for "Nothing was heard". */
async function silent(page: Page, flow: string, width: Width) {
  await startBtn(page).click();
  await expect(
    page.getByText("Nothing was heard, so this run wasn't scored.").first(),
  ).toBeVisible({
    timeout: 45_000,
  });
  await toResults(page);
  await shot(page, flow, "silent", width);
}

/**
 * A played rhythm run: tap `beats` (in beats from the stage's downbeat); `off` shifts
 * some taps by ms so live feedback shows a miss; shoot `running` at beat `shootAt`.
 */
async function tapRun(
  page: Page,
  flow: string,
  width: Width,
  beats: number[] | "onsets",
  off: Record<number, number>,
  shootAt: (b: number[]) => number,
) {
  await pickMode(page, "Practice");
  const before = await armTaps(page, beats, { off });
  await startBtn(page).click();
  const { downbeat, beatMs, onsets } = await rhythmDownbeat(page, before);
  await waitUntil(page, downbeat + shootAt(beats === "onsets" ? onsets : beats) * beatMs);
  await toStage(page);
  await shot(page, flow, "running", width);
  await toResults(page);
  await shot(page, flow, "results", width, { full: true });
}

test.describe.configure({ mode: "parallel" });

for (const width of WIDTHS) {
  test(`rhythm-pulse ${width}`, async ({ page }) => {
    test.setTimeout(180_000);
    const flow = "rhythm-pulse";
    await intro(page, flow, width, "/music/rhythm?mode=pulse&beats=16&bpm=80");
    // Sixteen beats, the seventh a touch late: shot just after it lands.
    await tapRun(
      page,
      flow,
      width,
      Array.from({ length: 16 }, (_, i) => i),
      { 6: 95 },
      () => 6.45,
    );
    await silent(page, flow, width);
  });

  test(`rhythm-read ${width}`, async ({ page }) => {
    test.setTimeout(180_000);
    const flow = "rhythm-read";
    await intro(
      page,
      flow,
      width,
      "/music/rhythm?mode=read-and-tap&pattern=dotted-quarters&bpm=60",
    );
    // Dotted quarters over two bars; the third stroke early.
    await tapRun(page, flow, width, [0, 1.5, 3, 4.5, 6, 7.5], { 2: -150 }, () => 4.8);
    await silent(page, flow, width);
  });

  test(`rhythm-echo ${width}`, async ({ page }) => {
    test.setTimeout(180_000);
    const flow = "rhythm-echo";
    await intro(page, flow, width, "/music/rhythm?mode=echo&earLevel=quarters-eighths&bpm=80");
    // The rhythm heard, then tapped back in the response bar; one stroke late.
    await tapRun(
      page,
      flow,
      width,
      "onsets",
      { 1: 110 },
      (b) => (b[Math.floor(b.length / 2)] ?? 2) + 0.3,
    );
    await silent(page, flow, width);
  });

  for (const [flow, url, group, check] of [
    [
      "rhythm-dictation",
      "/music/rhythm?mode=dictation&earLevel=rests-halves&bpm=80",
      "Your rhythm",
      "Check my rhythm",
    ],
    [
      "rhythm-groove",
      "/music/rhythm?mode=groove&grooveLevel=offbeats&bpm=80",
      "Your groove",
      "Check my groove",
    ],
  ] as const)
    test(`${flow} ${width}`, async ({ page }) => {
      test.setTimeout(180_000);
      await intro(page, flow, width, url);
      await pickMode(page, "Practice");
      await startBtn(page).click();
      await expect(page.getByRole("status")).toContainText("Mark every note", { timeout: 30_000 });
      const stage = page.locator("[data-beat-ms]").first();
      const cells = page.getByRole("group", { name: group }).locator("button.cell");
      // Every mark the answer needs, as [row or null, cell index].
      let marks: [string | null, number][];
      if (flow === "rhythm-groove") {
        const lanes = JSON.parse((await stage.getAttribute("data-groove"))!) as Record<
          string,
          number[]
        >;
        marks = Object.entries(lanes).flatMap(([lane, beats]) =>
          beats.map((b) => [lane, b * 2] as [string, number]),
        );
      } else {
        const written = (await stage.getAttribute("data-written"))!.split(",").map(Number);
        marks = written.map((b) => [null, Math.round(b * 2)]);
      }
      const mark = async ([row, i]: [string | null, number]) =>
        (row ? cells.and(page.locator(`[data-row="${row}"]`)) : cells).nth(i).click();
      // Writing: about half the notes down.
      const half = Math.ceil(marks.length / 2);
      for (const m of marks.slice(0, half)) await mark(m);
      await toStage(page, `[role=group][aria-label="${group}"]`);
      await shot(page, flow, "running", width);
      for (const m of marks.slice(half)) await mark(m);
      await page.getByRole("button", { name: check }).click();
      await toResults(page);
      await shot(page, flow, "results", width, { full: true });
    });

  test(`reading-flashcards ${width}`, async ({ page }) => {
    test.setTimeout(180_000);
    const flow = "reading-flashcards";
    await intro(
      page,
      flow,
      width,
      "/music/reading?activity=flashcards&instrument=piano&answer=play&clefs=treble&low=60&high=72",
    );
    await pickMode(page, "Practice");
    await startBtn(page).click();
    const card = page.locator(".card[data-midi]");
    for (let i = 0; i < 10; i++) {
      await expect(page.getByRole("status")).toContainText(`Card ${i + 1} of 10`, {
        timeout: 10_000,
      });
      await expect(card).toHaveAttribute("data-state", "open");
      await page.waitForTimeout(300);
      const midi = Number((await card.getAttribute("data-midi"))!.split(",")[0]);
      // The second card played a whole step off: shown beside the right note until Next.
      await midiNote(page, PORTS.keys.id, i === 1 ? midi + 2 : midi);
      if (i === 1) {
        await expect(card).toHaveAttribute("data-state", "wrong");
        await page.waitForTimeout(400);
        await toStage(page);
        await shot(page, flow, "running", width);
        await page.getByRole("button", { name: "Next card" }).click();
      }
    }
    await toResults(page);
    await shot(page, flow, "results", width, { full: true });
  });

  test(`reading-sight ${width}`, async ({ page }) => {
    test.setTimeout(200_000);
    const flow = "reading-sight";
    await intro(
      page,
      flow,
      width,
      "/music/reading?activity=sight-reading&instrument=piano&follower=wait&level=primer&measures=2&clefs=treble",
    );
    await pickMode(page, "Practice");
    await startBtn(page).click();
    const paper = page.locator(".paper-wrap[data-expected]");
    await expect(paper).not.toHaveAttribute("data-group", "-1", { timeout: 20_000 });
    for (let i = 0; i < 32; i++) {
      const expected = (await paper.getAttribute("data-expected")) ?? "";
      if (!expected || (await page.getByRole("heading", { name: "Results" }).count())) break;
      // The first note missed by a whole step, then played right.
      if (i === 0) await midiNote(page, PORTS.keys.id, Number(expected.split(",")[0]) + 2);
      for (const m of expected.split(","))
        await midiNote(page, PORTS.keys.id, Number(m), 100, 1, 60);
      await page.waitForTimeout(150);
      if (i === 1) {
        await toStage(page);
        await shot(page, flow, "running", width);
      }
    }
    await toResults(page);
    await shot(page, flow, "results", width, { full: true });

    // Silent: a performance run (the music moves on its own) with nothing played.
    await page.goto(
      "/music/reading?activity=sight-reading&instrument=piano&follower=performance&level=primer&measures=2&clefs=treble",
    );
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(600);
    await silent(page, flow, width);
  });
}
