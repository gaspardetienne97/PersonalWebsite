import { describe, expect, it } from "vite-plus/test";
import { advance, type AdvancePlan, type AdvanceState } from "./advance";

const clean = { score: 0.95, correct: true };
const poor = { score: 0.5, correct: false };
const steps = [{ label: "One a click" }, { label: "Two a click", goal: 90 }];

/** Play `runs` at the plan, following each offer, and return the plans visited. */
function follow(plan: AdvancePlan, runs: { score: number; correct: boolean }[]) {
  let state: AdvanceState | undefined;
  const seen: string[] = [];
  for (const run of runs) {
    const r = advance(plan, state, run);
    state = r.state;
    seen.push(`${r.next.kind}:${r.next.label}`);
    plan = { ...plan, bpm: r.next.bpm ?? plan.bpm, step: r.next.step ?? plan.step };
  }
  return seen;
}

describe("advance", () => {
  it("climbs the tempo, then moves to the harder variation at a reset tempo", () => {
    const plan = { bpm: 110, tempo: { min: 40, goal: 120 }, steps, step: 0 };
    expect(follow(plan, [clean, clean, clean, clean, clean, clean])).toEqual([
      "same:110 BPM",
      "faster:116 BPM",
      "same:116 BPM",
      "faster:120 BPM",
      "same:120 BPM",
      // The harder variation starts at 75% of its own goal.
      "harder:Two a click at 68 BPM",
    ]);
  });

  it("steps back after a clearly failed run and offers the easier version only at the floor", () => {
    const plan = { bpm: 42, tempo: { min: 40, goal: 120 }, steps, step: 1 };
    expect(follow(plan, [poor, poor, poor])).toEqual([
      "slower:40 BPM",
      "same:40 BPM",
      "easier:One a click at 40 BPM",
    ]);
    // A middling run holds.
    expect(advance(plan, undefined, { score: 0.8, correct: false }).next.kind).toBe("same");
  });

  it("moves untimed drills through variations only", () => {
    expect(follow({ steps, step: 0 }, [clean, clean])).toEqual([
      "same:Same again",
      "harder:Two a click",
    ]);
    expect(follow({ steps, step: 1 }, [clean, clean]).at(-1)).toBe("top:Same again");
  });
});
