import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import DrillProgressRail from "./DrillProgressRail.svelte";

describe("DrillProgressRail", () => {
  test("renders a title and labelled stat items", () => {
    render(DrillProgressRail, {
      title: "Progress",
      items: [
        { label: "Rep", value: "3 / 10" },
        { label: "Avg offset", value: 12, hint: "ms" },
      ],
    });

    expect(document.body.textContent).toContain("Progress");
    expect(document.body.textContent).toContain("Rep");
    expect(document.body.textContent).toContain("3 / 10");
    expect(document.body.textContent).toContain("Avg offset");
    expect(document.body.textContent).toContain("12");
    expect(document.body.textContent).toContain("ms");
  });

  test("renders without a title and with no items", () => {
    render(DrillProgressRail, { items: [] });
    // Nothing to assert beyond not throwing; the container renders empty.
    expect(document.querySelector("div")).not.toBeNull();
  });
  test("renders each item as a compact stat tile", () => {
    render(DrillProgressRail, {
      items: [
        { label: "Rep", value: "3 / 10" },
        { label: "Avg offset", value: 12, hint: "ms" },
      ],
    });
    const tiles = document.querySelectorAll('[data-hud-tile="sm"]');
    expect(tiles).toHaveLength(2);
    expect(tiles[1]?.textContent).toContain("Avg offset");
    expect(tiles[1]?.textContent).toContain("12");
  });
});
