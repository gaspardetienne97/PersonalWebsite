import { render } from "vitest-browser-svelte";
import { describe, expect, test } from "vitest";

import type { DailyRoutineState } from "@repo/music-core/engines/daily-routine";

import RoutineContinueAction from "./RoutineContinueAction.svelte";

describe("RoutineContinueAction", () => {
  test("links back to the runner for an active routine", () => {
    render(RoutineContinueAction, { routine: routineState("active") });

    const link = document.querySelector<HTMLAnchorElement>('a[href="/music/routine"]');
    expect(link?.textContent).toContain("Continue routine");
    expect(document.body.textContent).toContain("Note Reading");
  });

  test("shows the combined summary action when the routine is complete", () => {
    render(RoutineContinueAction, { routine: routineState("summary") });

    expect(document.body.textContent).toContain("View routine summary");
  });
});

function routineState(status: "active" | "summary"): DailyRoutineState {
  return {
    id: "routine-1",
    status,
    startedAt: 1_000,
    currentIndex: status === "active" ? 1 : 2,
    currentStep:
      status === "active"
        ? {
            id: "reading",
            label: "Note Reading",
            href: "/music/learn/reading",
            description: "Read notes.",
            status: "active",
          }
        : undefined,
    steps: [],
    summary:
      status === "summary"
        ? {
            completedSteps: 2,
            totalSteps: 2,
            totalXp: 20,
            accuracy: 0.8,
            durationMs: 2_000,
            scoringEvents: [],
            runs: [],
            tags: [],
          }
        : undefined,
  };
}
