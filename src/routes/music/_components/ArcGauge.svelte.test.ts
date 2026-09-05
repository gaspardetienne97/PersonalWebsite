import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import ArcGauge from "./ArcGauge.svelte";

describe("ArcGauge", () => {
  test("names the reading and the neighbours", () => {
    render(ArcGauge, { cents: -12, zone: "flat", flatNeighbor: "D#", sharpNeighbor: "F" });
    const svg = document.querySelector('[data-testid="arc-gauge"]');
    expect(svg?.getAttribute("aria-label")).toBe("-12 cents, flat");
    expect(svg?.textContent).toContain("D#");
    expect(svg?.textContent).toContain("F");
    document.body.replaceChildren();
    render(ArcGauge, { active: false });
    expect(document.querySelector('[data-testid="arc-gauge"]')?.getAttribute("aria-label")).toBe(
      "No pitch yet",
    );
  });
});
