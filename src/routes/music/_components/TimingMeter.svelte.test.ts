import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import TimingMeter from "./TimingMeter.svelte";

describe("TimingMeter", () => {
  test("renders ahead and behind labels", () => {
    render(TimingMeter, { offsetMs: 4 });
    expect(document.body.textContent).toContain("Ahead");
    expect(document.body.textContent).toContain("Behind");
  });
});
