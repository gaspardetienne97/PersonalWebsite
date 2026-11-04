import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("$app/state", () => ({ page: { url: new URL("http://localhost/music/scales") } }));

const { practice, answered, routineInstrument } = await import("./practice.svelte");
const { page } = await import("$app/state");
const { db, input } = await import("./runtime");

const spec = {
  exerciseId: "technique.scale",
  setupKey: "test",
  skillIds: ["test.skill"],
  capabilities: ["technique" as const],
  modality: "played" as const,
  assistance: "guided" as const,
  difficulty: 0.4,
  instrument: "piano" as const,
};
const miss = {
  promptId: "p",
  correct: false,
  partialCredit: 0,
  source: "onscreen" as const,
  response: [],
};

async function fresh() {
  await db.sessions.clear();
  await db.scoringEvents.clear();
  await practice.reload();
}

describe("a run where nothing was heard", () => {
  beforeEach(fresh);

  it("opens no session and earns no XP", async () => {
    const run = practice.beginRun(spec);
    await run.attempt(miss);
    const fin = await run.finish({ score: 0, correct: false });
    expect(fin.heard).toBe(false);
    expect(fin.xp).toBe(0);
    expect(fin.run.score).toBeUndefined();
    expect(practice.sessions).toHaveLength(0);
    expect(practice.events).toHaveLength(0);
    expect(await db.sessions.count()).toBe(0);
  });

  it("stopped before any input leaves nothing behind", async () => {
    practice.beginRun(spec);
    expect(practice.sessions).toHaveLength(0);
    expect(await db.sessions.count()).toBe(0);
  });

  it("several empty runs never add up to a session", async () => {
    for (let i = 0; i < 3; i++) {
      const run = practice.beginRun(spec);
      await run.attempt(miss);
      await run.finish();
    }
    expect(practice.sessions).toHaveLength(0);
    expect(practice.xpTotal).toBe(0);
  });
});

describe("a run with input", () => {
  beforeEach(fresh);

  it("is saved when a note arrives, misses before it included", async () => {
    const run = practice.beginRun(spec);
    await run.attempt(miss);
    input.tap(60, true);
    input.tap(60, false);
    await run.attempt({ ...miss, promptId: "q", correct: true, partialCredit: 1, response: [60] });
    const fin = await run.finish();
    expect(fin.heard).toBe(true);
    expect(practice.sessions).toHaveLength(1);
    expect(practice.sessions[0].runs).toHaveLength(1);
    expect(practice.events.map((e) => e.promptId)).toEqual(["p", "q"]);
    expect(practice.events.every((e) => e.sessionId === practice.sessions[0].id)).toBe(true);
  });

  it("counts a clicked answer, or a drill's own input path", async () => {
    const quiz = practice.beginRun(spec);
    await quiz.attempt({
      promptId: "q",
      correct: false,
      partialCredit: 0,
      source: "click",
      response: "P5",
    });
    expect((await quiz.finish()).heard).toBe(true);
    const tapped = practice.beginRun(spec);
    await tapped.attempt({ ...miss, heard: true });
    expect((await tapped.finish()).heard).toBe(true);
    const silent = practice.beginRun(spec);
    await silent.attempt({ ...miss, source: "audio", response: "0 of 8", heard: false });
    expect((await silent.finish()).heard).toBe(false);
    const rated = practice.beginRun(spec);
    const fin = await rated.finish({ score: 1, correct: true, rated: true });
    expect(fin.heard).toBe(true);
    expect(fin.run.score).toBe(1);
  });
});

describe("editing a session", () => {
  beforeEach(fresh);

  it("keeps a journal note when the next run joins the same session", async () => {
    const click = {
      promptId: "q",
      correct: true,
      partialCredit: 1,
      source: "click" as const,
      response: "P5",
    };
    const first = practice.beginRun(spec);
    await first.attempt(click);
    await first.finish();
    const id = practice.sessions[0].id;
    await practice.editSession(id, { note: "slow the shifts", nextTime: "C major at 80" });
    const second = practice.beginRun(spec);
    await second.attempt(click);
    await second.finish();
    expect(practice.sessions).toHaveLength(1);
    expect(practice.sessions[0]).toMatchObject({
      note: "slow the shifts",
      nextTime: "C major at 80",
    });
    expect(await db.sessions.get(id)).toMatchObject({ note: "slow the shifts" });
  });
});

describe("the session's instrument", () => {
  beforeEach(fresh);
  const click = {
    promptId: "q",
    correct: true,
    partialCredit: 1,
    source: "click" as const,
    response: "P5",
  };

  it("reads a routine id's instrument", () => {
    expect(routineInstrument("routine-2026-11-04-voice-10")).toBe("voice");
    expect(routineInstrument("routine-2026-11-04-mpc-30-pass2")).toBe("mpc");
    expect(routineInstrument("routine-2026-11-04-kazoo-10")).toBeUndefined();
    expect(routineInstrument(undefined)).toBeUndefined();
  });

  it("is the routine's for a set, even when its runs report none", async () => {
    const url = page.url;
    page.url = new URL(
      "http://localhost/music/ear/scale-degrees?routine=routine-2026-11-04-voice-10&step=2",
    ) as typeof url;
    try {
      const run = practice.beginRun({ ...spec, instrument: undefined });
      await run.attempt(click);
      await run.finish();
      expect(practice.sessions[0].instrument).toBe("voice");
    } finally {
      page.url = url;
    }
  });

  it("is never blanked by a run with no instrument", async () => {
    const first = practice.beginRun(spec);
    await first.attempt(click);
    await first.finish();
    const second = practice.beginRun({ ...spec, instrument: undefined });
    await second.attempt(click);
    await second.finish();
    expect(practice.sessions).toHaveLength(1);
    expect(practice.sessions[0].instrument).toBe("piano");
  });
});

describe("answered", () => {
  it("reads evidence from the response, or the source when there is none", () => {
    expect(answered({ source: "onscreen", response: [] })).toBe(false);
    expect(answered({ source: "midi", response: [] })).toBe(false);
    expect(answered({ source: "click", response: "" })).toBe(false);
    expect(answered({ source: "onscreen", response: [60] })).toBe(true);
    expect(answered({ source: "click", response: 0 })).toBe(true);
    expect(answered({ source: "onscreen" })).toBe(false);
    expect(answered({ source: "midi" })).toBe(true);
    expect(answered({ source: "click" })).toBe(true);
  });
});
