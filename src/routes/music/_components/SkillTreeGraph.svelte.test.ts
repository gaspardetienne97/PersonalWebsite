import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import SkillTreeGraph from "./SkillTreeGraph.svelte";

describe("SkillTreeGraph", () => {
  test("renders the root and child node labels with connectors", () => {
    render(SkillTreeGraph, {
      root: { label: "Musicality", percent: 80 },
      nodes: [
        { label: "Rhythm", percent: 92 },
        { label: "Harmony", percent: 78 },
        { label: "Melody", percent: 85 },
      ],
    });
    expect(document.body.textContent).toContain("Musicality");
    expect(document.body.textContent).toContain("Rhythm");
    expect(document.body.textContent).toContain("Harmony");
    // one connector path per child node
    expect(document.querySelectorAll("svg path").length).toBe(3);
  });

  test("caps children at six nodes", () => {
    render(SkillTreeGraph, {
      root: { label: "Root", percent: 50 },
      nodes: Array.from({ length: 9 }, (_, index) => ({ label: `n${index}`, percent: 10 })),
    });
    expect(document.querySelectorAll("svg path").length).toBe(6);
  });
});
