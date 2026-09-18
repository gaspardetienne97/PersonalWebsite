import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import TodayPlan from "./TodayPlan.svelte";
import { MusicRuntime } from "../_runtime.svelte";
import { unixMs } from "@repo/music-core/domain";

function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
}

describe("TodayPlan", () => {
  it("rebuilds idle plans for the current instrument and time budget", async () => {
    const runtime = new MusicRuntime();
    runtime.setActiveInstrument("guitar");
    runtime.routineBudgetMinutes = 10;
    render(TodayPlan, { runtime });
    await vi.waitFor(() => expect(button("Start routine")?.disabled).toBe(false));
    const steps = () => document.querySelector('[aria-label="Routine steps"]')?.textContent ?? "";
    expect(steps()).toContain("String Independence");
    expect(steps()).toContain("Ear training review");
    expect(steps()).not.toContain("Note Reading");
    runtime.setActiveInstrument("mpc");
    runtime.routineBudgetMinutes = 5;
    await vi.waitFor(() => expect(steps()).toContain("MPC Rudiments"));
    expect(steps()).not.toContain("Chord Work");
    expect(steps()).not.toContain("Rhythm");
    runtime.dispose();
  });
  it("opens the journal after a completed routine", async () => {
    const runtime = new MusicRuntime();
    runtime.startDailyRoutine(
      [
        {
          id: "rhythm",
          label: "Rhythm",
          href: "/music/learn/rhythm",
          description: "Pulse",
          minutes: 5,
        },
      ],
      unixMs(1000),
    );
    await runtime.recordPractice({
      source: "drill",
      tags: ["rhythm"],
      startedAt: unixMs(1000),
      endedAt: unixMs(2000),
      xpEarned: 0,
      scoringEvents: [],
    });
    render(TodayPlan, { runtime });
    const journal = [...document.querySelectorAll("a")].find((link) =>
      link.textContent?.includes("Open journal"),
    );
    expect(journal?.getAttribute("href")).toBe("/music/track");
    runtime.dispose();
  });
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("starts the routine and navigates to its first step", async () => {
    const navigate = vi.fn();
    render(TodayPlan, { navigate });

    await vi.waitFor(() => expect(button("Start routine")?.disabled).toBe(false));
    button("Start routine")?.click();

    // The first step depends on stored history (the plan is adaptive), so assert the
    // shape of the navigation and that Today's Continue button points at the same step.
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledOnce());
    const href = navigate.mock.calls[0]![0] as string;
    expect(new URL(href, "https://practice.test").searchParams.get("routine")).toBe("1");
    expect(href).toMatch(/^\/music\/(learn|play)\//);
    await vi.waitFor(() => expect(document.body.textContent).toContain("Up first"));
    expect(document.querySelector(`a[href="${href}"]`)?.textContent).toContain("Continue routine");
    expect(document.body.textContent).not.toContain("Results are logged only after");
  });
});
