import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import { unixMs } from "@repo/music-core/domain";
import { buildLearningPath } from "@repo/music-core/engines/learning-path";

import LearningPathScreen from "./LearningPathScreen.svelte";

describe("LearningPathScreen", () => {
  test("renders numbered steps with status, mastery, links, and a Continue target", async () => {
    const path = buildLearningPath(
      [
        {
          id: "a",
          order: 1,
          title: "First",
          summary: "Adds one.",
          detail: "One clean run.",
          href: "/music/x?a=1",
          skillIds: ["s"],
        },
        {
          id: "b",
          order: 2,
          title: "Second",
          summary: "Adds two.",
          href: "/music/y",
          kind: "reference",
          links: [{ label: "Also", href: "/music/z" }],
        },
        {
          id: "c",
          order: 3,
          title: "Third",
          summary: "Adds three.",
          href: "/music/w",
          skillIds: ["t"],
        },
      ],
      {
        events: [
          {
            id: "e",
            sessionId: "s",
            exerciseId: "e",
            skillIds: ["s"],
            capabilities: [],
            at: unixMs(1),
            correct: true,
            partialCredit: 0.9,
            difficulty: 0.5,
            metrics: [],
            assistance: "independent",
          },
        ],
      },
    );
    render(LearningPathScreen, { title: "Test Path", subtitle: "Sub", path });

    expect(document.querySelector("h1")?.textContent).toContain("Test Path");
    expect(document.body.textContent).toContain("1 / 2 done");
    const steps = [...document.querySelectorAll('[data-testid="learning-path-steps"] li')];
    expect(steps.map((li) => li.textContent?.includes("Done when: One clean run."))).toEqual([
      true,
      false,
      false,
    ]);
    expect(document.querySelector('[data-step-status="done"]')).not.toBeNull();
    expect(document.querySelector('[data-step-next="true"]')?.textContent).toContain("Third");
    expect(
      document.querySelector('[data-testid="learning-path-continue"]')?.getAttribute("href"),
    ).toBe("/music/w");
    expect(document.querySelector('a[href="/music/x?a=1"]')?.textContent?.trim()).toBe("Practice");
    expect(document.querySelector('a[href="/music/y"]')?.textContent?.trim()).toBe("Open");
    expect(document.querySelector('a[href="/music/z"]')).not.toBeNull();
    expect(document.body.textContent).toContain("90% independent score");
  });
  test("locks a step behind its prerequisite and badges the open one Next", async () => {
    const path = buildLearningPath([
      {
        id: "one",
        order: 1,
        title: "Open shapes",
        summary: "Adds one.",
        href: "/music/play/chord-perfect",
        skillIds: ["s"],
      },
      {
        id: "two",
        order: 2,
        title: "Change on the bar",
        summary: "Adds two.",
        href: "/music/play/chord-perfect?mode=changes",
        skillIds: ["t"],
        requires: ["one"],
      },
    ]);
    render(LearningPathScreen, { title: "Guitar Path", path });

    const next = document.querySelector('[data-step-status="next"]');
    expect(next?.textContent).toContain("Open shapes");
    expect(next?.textContent).toContain("Next");
    expect(next?.querySelector('a[href="/music/play/chord-perfect"]')).not.toBeNull();

    const locked = document.querySelector('[data-step-status="locked"]');
    expect(locked?.textContent).toContain("Locked");
    expect(locked?.querySelector("a")).toBeNull();
    expect(locked?.querySelector('[data-testid="learning-path-lock-two"]')).not.toBeNull();
    // Announced as unavailable, but still reachable by keyboard.
    const control = locked?.querySelector('[aria-disabled="true"]');
    expect(control).not.toBeNull();
    expect(control?.hasAttribute("disabled")).toBe(false);
    expect(control?.getAttribute("tabindex")).toBe("0");
  });
});
