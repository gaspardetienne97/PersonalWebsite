import { afterEach, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";
import { Capability, unixMs, type ScoringEvent } from "@repo/music-core/domain";
import { PracticeDatabase, PracticeStore } from "@repo/music-core/engines/store";
import { MusicRuntime } from "../_runtime.svelte";
import LastRunDelta from "./LastRunDelta.svelte";

const databases: PracticeDatabase[] = [];
afterEach(async () => {
  document.body.replaceChildren();
  await Promise.all(databases.map((db) => db.delete()));
  databases.length = 0;
});

test("compares captured setup and input, preserves the visit cutoff, and explains missing matches", async () => {
  const db = new PracticeDatabase(`run-comparison-${crypto.randomUUID()}`);
  databases.push(db);
  const store = new PracticeStore(db);
  const runtime = new MusicRuntime();
  runtime.attachJournal(store);
  const evidence = (
    id: string,
    partialCredit: number,
    source: ScoringEvent["source"] = "midi",
  ): ScoringEvent => ({
    id,
    sessionId: id,
    exerciseId: "scales",
    skillIds: [],
    capabilities: [Capability.Technique],
    at: unixMs(1),
    correct: partialCredit === 1,
    partialCredit,
    difficulty: 0.5,
    metrics: [],
    source,
    instrument: "piano",
    assistance: "independent",
  });
  const comparison = {
    variantKey: "v1:scales:piano:major:up:octave",
    bpm: 60,
    dimensions: "instrument, scale, motion and span",
  };
  await runtime.recordPractice({
    source: "drill",
    tags: ["scales"],
    startedAt: unixMs(1),
    endedAt: unixMs(2),
    comparison,
    scoringEvents: [evidence("old", 0.6)],
    xpEarned: 1,
  });
  const prior = (await store.sessions.all())[0]!;
  expect(prior.tags).toContain(comparison.variantKey);
  expect(prior.tags).toContain("comparison:bpm:60");
  const complete = async (setup = comparison, source: ScoringEvent["source"] = "midi") =>
    runtime.recordPractice({
      source: "drill",
      tags: ["scales"],
      startedAt: unixMs(10),
      endedAt: unixMs(11),
      comparison: setup,
      scoringEvents: [evidence(crypto.randomUUID(), 0.8, source)],
      xpEarned: 1,
    });
  await complete();
  render(LastRunDelta, { tags: ["scales"], before: unixMs(5), runtime, store });
  await vi.waitFor(() => expect(document.body.textContent).toContain("+20%"));
  expect(document.body.textContent).toContain("Baseline: 60 BPM");
  expect(document.body.textContent).toContain("MIDI / Piano / independent");
  expect(document.body.textContent).toContain("Matched instrument, scale, motion and span");
  await complete(); // Again does not shift the baseline to the previous in-visit run.
  await vi.waitFor(() => expect(document.body.textContent).toContain("+20%"));
  for (const setup of [
    { ...comparison, bpm: 120 },
    { ...comparison, variantKey: "minor" },
  ]) {
    await complete(setup);
    await vi.waitFor(() => expect(document.body.textContent).toContain("different setup"));
    expect(document.body.textContent).not.toContain("+20%");
  }
  await complete(comparison, "onscreen");
  await vi.waitFor(() => expect(document.body.textContent).toContain("different setup"));
  await store.sessions.put({ ...prior, tags: ["scales"] });
  await complete();
  await vi.waitFor(() =>
    expect(document.body.textContent).toContain("no comparable setup metadata"),
  );
  expect(document.body.textContent).toContain("Comparisons update on a later visit");
  runtime.dispose();
});
