import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import PracticeActionCard from "./PracticeActionCard.svelte";

describe("PracticeActionCard", () => {
  test("renders title, description, and xp", () => {
    render(PracticeActionCard, {
      title: "Ear Training",
      description: "Interval ID · listening.",
      xp: 150,
      href: "/music/learn/ear",
    });
    expect(document.body.textContent).toContain("Ear Training");
    expect(document.body.textContent).toContain("+150 XP");
  });
});
