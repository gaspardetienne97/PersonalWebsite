import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

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
      { mastery: (id) => (id === "s" ? 0.9 : 0.1) },
    );
    render(LearningPathScreen, { title: "Test Path", subtitle: "Sub", path });

    expect(document.querySelector("h1")?.textContent).toContain("Test Path");
    expect(document.body.textContent).toContain("1 / 3 done");
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
    expect(document.body.textContent).toContain("90% mastery");
  });
});
