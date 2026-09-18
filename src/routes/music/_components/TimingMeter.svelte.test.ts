import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import TimingMeter from "./TimingMeter.svelte";

const meter = () => document.querySelector("[aria-label]")!;

describe("TimingMeter", () => {
  test("labels the early and late ends of the scale", () => {
    render(TimingMeter, { offsetMs: 4 });
    expect(document.body.textContent).toContain("Early");
    expect(document.body.textContent).toContain("Late");
    expect(document.body.textContent).toContain("On beat");
  });

  test("calls a +40 ms error late, because a positive error arrived after the beat", () => {
    render(TimingMeter, { offsetMs: 40 });
    expect(meter().getAttribute("aria-label")).toBe("Timing offset: 40 ms late");
  });

  test("calls a -40 ms error early", () => {
    render(TimingMeter, { offsetMs: -40 });
    expect(meter().getAttribute("aria-label")).toBe("Timing offset: 40 ms early");
  });

  test("reads a hit inside the pocket as on the beat", () => {
    render(TimingMeter, { offsetMs: 4 });
    expect(meter().getAttribute("aria-label")).toBe("Timing offset: 4 ms, on the beat");
  });
});
