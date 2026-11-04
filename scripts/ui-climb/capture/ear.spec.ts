// Ear training captures: intervals, chord qualities, scale degrees, melody dictation and
// the mixed review. One test per drill and width: the intro lesson (lessons on), the
// ready page, a question waiting, feedback right and wrong, a good run's results and a
// poor run's results. Choice answers are read from the card's data attributes; melody
// dictation is played back over the fake MIDI keyboard.
import { expect, test, type Page } from "@playwright/test";
import { open, shot, type Width } from "./lib";
import {
  answerEar,
  earCard,
  earContinue,
  earQuestion,
  midiNote,
  openWithMidi,
  pickMode,
  PORTS,
  setup,
  shootLesson,
  skipLesson,
  startBtn,
  toResults,
  toStage,
  toTop,
  WIDTHS,
} from "./hub-drills";

interface EarFlow {
  id: string;
  url: string;
  midi?: boolean;
}

const FLOWS: EarFlow[] = [
  {
    id: "ear-intervals",
    url: "/music/ear/intervals?answer=choice&intervals=m3,M3,P4,P5,P8&direction=ascending",
  },
  {
    id: "ear-chords",
    url: "/music/ear/chord-qualities?answer=choice&qualities=major,minor,diminished,augmented",
  },
  { id: "ear-degrees", url: "/music/ear/scale-degrees?answer=choice&level=major-diatonic" },
  {
    id: "ear-melody",
    url: "/music/ear/melody-dictation?answer=play-back&level=major-pentachord",
    midi: true,
  },
  {
    id: "ear-mixed",
    url: "/music/ear/mixed?answer=choice&drill=interval,chord-quality,scale-degree,cadence,chord-function,scale,inversion",
  },
];

/** Answer the current question: a click, or the phrase played back over MIDI. */
async function answer(page: Page, flow: EarFlow, right: boolean) {
  if (!flow.midi) return answerEar(page, right);
  const notes = (await earCard(page).getAttribute("data-expected"))!.split(",").map(Number);
  for (const [i, m] of notes.entries()) {
    const wrong = !right && i === notes.length - 2;
    await midiNote(page, PORTS.keys.id, wrong ? m + 2 : m, 90, 1, 160);
    await page.waitForTimeout(220);
  }
}

async function feedback(page: Page) {
  await expect(earCard(page)).toHaveAttribute("data-step", "feedback", { timeout: 10_000 });
  await page.waitForTimeout(500);
}

/** A run of ten in Practice; `pattern[i]` says whether question i+1 is answered right. */
async function run(page: Page, flow: EarFlow, width: Width, pattern: boolean[], shots: boolean) {
  for (let i = 0; i < pattern.length; i++) {
    await earQuestion(page, i + 1);
    if (shots && i === 0) {
      await page.waitForTimeout(400);
      await toStage(page);
      await shot(page, flow.id, "question", width);
    }
    await answer(page, flow, pattern[i]);
    await feedback(page);
    if (shots && i === 0) {
      await toStage(page, "article[data-drill] > button:last-child");
      await shot(page, flow.id, "feedback-right", width);
    }
    if (shots && i === 1) {
      await toStage(page, "article[data-drill] > button:last-child");
      await shot(page, flow.id, "feedback-wrong", width);
    }
    await earContinue(page);
  }
}

test.describe.configure({ mode: "parallel" });

for (const flow of FLOWS)
  for (const width of WIDTHS)
    test(`${flow.id} ${width}`, async ({ page }) => {
      test.setTimeout(240_000);
      await setup(page, width, { lessons: true });
      if (flow.midi) await openWithMidi(page, flow.url, { countInBars: 0 });
      else await open(page, flow.url);

      if (!(await shootLesson(page, flow.id, width))) console.log(`${flow.id}: no lesson`);
      await skipLesson(page);
      await toTop(page);
      await expect(startBtn(page)).toBeVisible();
      await shot(page, flow.id, "ready", width);

      // A good run: the second question missed, every other one right.
      await pickMode(page, "Practice");
      await startBtn(page).click();
      const good = Array.from({ length: 10 }, (_, i) => i !== 1);
      await run(page, flow, width, good, true);
      await toResults(page);
      await shot(page, flow.id, "results", width, { full: true });

      // A poor run: three right of ten.
      await page.getByRole("button", { name: "Again", exact: true }).click();
      const poor = Array.from({ length: 10 }, (_, i) => i === 0 || i === 4 || i === 7);
      await run(page, flow, width, poor, false);
      await toResults(page);
      await shot(page, flow.id, "results-poor", width, { full: true });
    });

// Studio ears (/music/listening): find the boost on pink noise, Flat then Changed.
const hzLabel = (a: string) => (Number(a) >= 1000 ? `${Number(a) / 1000} kHz` : `${a} Hz`);

for (const width of WIDTHS)
  test(`studio-ears ${width}`, async ({ page }) => {
    test.setTimeout(240_000);
    const flow = "studio-ears";
    await setup(page, width, { lessons: true });
    await open(page, "/music/listening");
    if (!(await shootLesson(page, flow, width))) console.log(`${flow}: no lesson`);
    await skipLesson(page);
    await toTop(page);
    await expect(startBtn(page)).toBeVisible();
    await shot(page, flow, "ready", width);

    await pickMode(page, "Practice");
    await startBtn(page).click();
    const card = page.locator("article[data-exercise]");
    const answers = page.getByRole("group", { name: "Answers" }).getByRole("button");
    for (let i = 0; i < 10; i++) {
      await expect(card).toHaveAttribute("aria-label", `Prompt ${i + 1}`, { timeout: 20_000 });
      await expect(card).toHaveAttribute("data-step", "answer", { timeout: 20_000 });
      if (i === 0) {
        await page.waitForTimeout(1500); // Flat, then Changed
        await toStage(page);
        await shot(page, flow, "question", width);
      }
      const a = (await card.getAttribute("data-answer"))!;
      const labels = (await answers.allTextContents()).map((t) => t.trim());
      const right = labels.indexOf(hzLabel(a));
      // The fourth prompt missed: one step off.
      await answers.nth(i === 3 ? (right + 1) % labels.length : right).click();
      await expect(card).toHaveAttribute("data-step", "feedback");
      if (i === 0 || i === 3) {
        await page.waitForTimeout(400);
        await toStage(page, "article[data-exercise] > button:last-child");
        await shot(page, flow, i === 0 ? "feedback" : "feedback-wrong", width);
      }
      await page.getByRole("button", { name: /^(Continue|See results)$/ }).click();
    }
    await toResults(page);
    await shot(page, flow, "results", width, { full: true });
  });
