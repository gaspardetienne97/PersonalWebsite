import { beforeEach, describe, expect, it } from "vite-plus/test";
import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import "../../../../app.css";
import "../../../../routes/music/woodshed.css";
import type { PracticeSession, ScoringEvent } from "@repo/music-core";
import { ingestEvents } from "@repo/music-core/progress/mastery";
import { ingestAnalytics } from "@repo/music-core/progress/analytics";
import { practice } from "../../practice.svelte";
import SkillsView from "./SkillsView.svelte";
import NextView from "./NextView.svelte";
import JournalView from "../journal/JournalView.svelte";

const now = Date.now();
const HOUR = 3_600_000;

function ev(i: number, over: Partial<ScoringEvent>): ScoringEvent {
  return {
    id: `ev-${over.runId}-${i}`,
    sessionId: "s1",
    runId: "r1",
    exerciseId: "ear.intervals",
    promptId: `p${i}`,
    at: now - HOUR + i * 1000,
    skillIds: ["pitch.interval.m3"],
    capabilities: ["pitch"],
    correct: i !== 2,
    partialCredit: i !== 2 ? 1 : 0,
    difficulty: 0.4,
    modality: "choice",
    source: "midi",
    instrument: "piano",
    assistance: "independent",
    metrics: [],
    target: "m3",
    ...over,
  } as ScoringEvent;
}

// Six checked interval answers and two practice-mode reading answers, all on piano.
const intervals = Array.from({ length: 6 }, (_, i) => ev(i, { runId: "r1" }));
const reading = Array.from({ length: 2 }, (_, i) =>
  ev(i, {
    runId: "r2",
    exerciseId: "reading.flashcards",
    skillIds: ["reading.treble.landmarks"],
    capabilities: ["reading"],
    assistance: "guided",
    source: "onscreen",
    target: "E4",
  }),
);
const events = [...intervals, ...reading];

const session: PracticeSession = {
  id: "s1",
  startTime: now - HOUR,
  endTime: now - HOUR + 20 * 60_000,
  instrument: "piano",
  source: "drill",
  runs: [
    {
      id: "r1",
      exerciseId: "ear.intervals",
      setupKey: "asc",
      promptIds: intervals.map((e) => e.promptId),
      skillIds: ["pitch.interval.m3"],
      difficulty: 0.4,
      instrument: "piano",
      params: {},
      startedAt: now - HOUR,
      endedAt: now - HOUR + 10 * 60_000,
      score: 5 / 6,
      assistance: "independent",
      xp: 180,
    },
    {
      id: "r2",
      exerciseId: "reading.flashcards",
      setupKey: "treble",
      promptIds: reading.map((e) => e.promptId),
      skillIds: ["reading.treble.landmarks"],
      difficulty: 0.4,
      instrument: "piano",
      params: {},
      startedAt: now - HOUR + 10 * 60_000,
      endedAt: now - HOUR + 20 * 60_000,
      score: 1,
      assistance: "guided",
      xp: 60,
    },
  ],
  eventIds: events.map((e) => e.id),
  xp: 240,
  tags: ["intervals"],
};

beforeEach(async () => {
  // Let the store's own IndexedDB load settle first so it cannot overwrite the seed.
  await practice.ready;
  practice.events = events;
  practice.sessions = [session];
  practice.mastery = ingestEvents({}, [], events).state;
  practice.stats = ingestAnalytics({}, [], events).stats;
});

describe("Progress", () => {
  it("shows one row per touched skill with honest evidence", async () => {
    render(SkillsView, { now });
    // A table on a laptop, a card per skill on a phone: read whichever this viewport shows.
    const shown = (id: string) =>
      [...document.querySelectorAll<HTMLElement>(`[data-skill="${id}"]`)].find(
        (el) => el.offsetParent !== null,
      ) ?? null;
    await expect.poll(() => shown("pitch.interval.m3")).not.toBeNull();
    const m3 = shown("pitch.interval.m3")!;
    expect(m3.textContent).toContain("Minor 3rd");
    // The table counts checked answers in a column; the phone card says it in a line.
    expect(m3.textContent).toMatch(/6 checked|83% right on 6 answers/);
    expect(m3.textContent).toContain("83%"); // accuracy, 5 of 6
    expect(m3.textContent).toContain("Mastery");
    // Practice-mode answers count as attempts but never move the estimate.
    const landmarks = shown("reading.treble.landmarks")!;
    expect(landmarks.textContent).toMatch(/0 checked|it grows with Check runs/);
    expect(landmarks.textContent).toContain("No mastery yet");
    // Untouched skills stay hidden until asked for.
    expect(shown("pitch.interval.P5")).toBeNull();
    await page.getByRole("button", { name: /Show all \d+ skills/ }).click();
    await expect.poll(() => shown("pitch.interval.P5")?.textContent).toContain("Perfect 5th");
  });

  it("splits What next into measured and not measured yet", async () => {
    render(NextView, { now });
    await expect
      .element(page.getByRole("heading", { name: "Where your skills stand" }))
      .toBeVisible();
    await expect.element(page.getByRole("link", { name: /Minor 3rd/ })).toBeVisible();
    await expect.element(page.getByRole("link", { name: /Treble Landmark Notes/ })).toBeVisible();
    expect(document.body.textContent).toContain("2 tries in Practice, none in Check mode");
  });
});

describe("Journal", () => {
  it("expands a session to its runs and attempt evidence", async () => {
    render(JournalView, { now });
    const toggle = page.getByRole("button", { name: "Show every answer" });
    await expect.element(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect
      .element(page.getByRole("button", { name: "Hide answers" }))
      .toHaveAttribute("aria-expanded", "true");
    const detail = document.getElementById("s1-detail")!;
    const text = detail.textContent!;
    expect(text).toContain("Intervals");
    expect(text).toContain("Reading flashcards");
    // Assistance in words, input source, instrument, credit and target.
    for (const word of [
      "Checked",
      "Practice",
      "MIDI",
      "On screen",
      "Piano",
      "100%",
      "0%",
      "m3",
      "E4",
    ])
      expect(text).toContain(word);
    // One line per attempt behind each run's details, and the misses spelled out up front.
    expect(detail.querySelectorAll("details li")).toHaveLength(8);
    expect(detail.querySelectorAll('[aria-label="Missed"] li').length).toBeGreaterThan(0);
    // Named for what was practised, and Delete only behind More, with a confirm.
    expect(document.getElementById("s1-title")!.textContent).toBe(
      "Intervals and Reading flashcards",
    );
    expect(page.getByRole("button", { name: "Delete session" }).elements()).toHaveLength(0);
    await page.getByRole("button", { name: "More for this session" }).click();
    await page.getByRole("button", { name: "Delete session" }).click();
    await expect
      .poll(() => page.getByRole("group", { name: "Confirm delete" }).elements().length)
      .toBe(1);
  });
});
