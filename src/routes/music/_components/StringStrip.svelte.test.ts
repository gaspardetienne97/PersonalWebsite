import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import StringStrip from "./StringStrip.svelte";

describe("StringStrip", () => {
  test("lists strings low to high, lights the nearest, and targets on tap", () => {
    const onTarget = vi.fn();
    render(StringStrip, { openStrings: [64, 59, 55, 50, 45, 40], nearestMidi: 45, onTarget });
    const chips = [
      ...document.querySelectorAll<HTMLButtonElement>('[aria-label="Strings"] button'),
    ];
    expect(chips.map((chip) => chip.textContent?.trim())).toEqual([
      "E2",
      "A2",
      "D3",
      "G3",
      "B3",
      "E4",
    ]);
    expect(chips[1]?.getAttribute("aria-label")).toContain("sounding");
    chips[0]?.click();
    expect(onTarget).toHaveBeenCalledWith(40);
  });
});
