import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import CalibrationPanel, { type ClickRun } from "./CalibrationPanel.svelte";

const beatMs = 60_000 / 90;

/** Rendered text with layout whitespace collapsed, so a wrapped sentence still matches. */
function text(): string {
  return (document.body.textContent ?? "").replace(/\s+/g, " ");
}

function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
}

/**
 * A metronome that fires all its clicks at once and answers each with a tap
 * `biasMs` later, so a run finishes inside the test.
 */
function fakeInput(biasMs: number, jitter: readonly number[] = [0]) {
  let tap: ((atMs: number) => void) | undefined;
  return {
    subscribeTaps: (listener: (atMs: number) => void) => {
      tap = listener;
      return () => {
        tap = undefined;
      };
    },
    runClicks: async (input: { beats: number; onClick: (atMs: number) => void }) => {
      for (let beat = 0; beat < input.beats; beat += 1) {
        const at = 1_000 + beat * beatMs;
        input.onClick(at);
        tap?.(at + biasMs + jitter[beat % jitter.length]!);
      }
      return { stop: () => {}, done: Promise.resolve() };
    },
  };
}

const base = {
  label: "MIDI",
  offsetMs: 0,
  onSave: () => {},
  onReset: () => {},
};

describe("CalibrationPanel", () => {
  test("states the sign rule and that the estimate is not a measurement", () => {
    render(CalibrationPanel, { ...base, ...fakeInput(0) });

    expect(text()).toContain(
      "a positive offset means your hits arrive late and are pulled earlier",
    );
    expect(text()).toContain("not a hardware measurement");
    expect(text()).toContain("your speakers' own delay");
  });

  test("shows the saved offset and only offers Reset once there is one", async () => {
    const { rerender } = render(CalibrationPanel, { ...base, ...fakeInput(0), offsetMs: 0 });
    expect(button("Reset")).toBeUndefined();

    await rerender({ ...base, ...fakeInput(0), offsetMs: 42 });
    expect(text()).toContain("42 ms");
    expect(button("Reset")).toBeDefined();
  });

  test("a steady run offers to save the measured shift on top of the saved offset", async () => {
    const saved: number[] = [];
    render(CalibrationPanel, {
      ...base,
      ...fakeInput(35, [-4, 2, 6, -2, 0]),
      offsetMs: 10,
      onSave: (offsetMs: number) => {
        saved.push(offsetMs);
      },
    });

    button("Calibrate")!.click();
    await vi.waitFor(() => expect(button("Save offset")).toBeDefined());
    expect(text()).toContain("45 ms");

    button("Save offset")!.click();
    await vi.waitFor(() => expect(saved).toEqual([45]));
  });

  test("refuses a run whose taps are all over the place", async () => {
    render(CalibrationPanel, { ...base, ...fakeInput(10, [-90, 90, -70, 70]) });

    button("Calibrate")!.click();
    await vi.waitFor(() => expect(text()).toContain("Try again"));
    expect(text()).toContain("varied");
    expect(button("Save offset")).toBeUndefined();
  });

  test("the check run replays the click and reports what is left", async () => {
    render(CalibrationPanel, { ...base, ...fakeInput(3, [-2, 1, 4, 0]), offsetMs: 30 });

    button("Calibrate")!.click();
    await vi.waitFor(() => expect(button("Save offset")).toBeDefined());
    button("Save offset")!.click();
    await vi.waitFor(() => expect(button("Check it")).toBeDefined());

    button("Check it")!.click();
    // The fake taps do not move, so the check reads back the same shift.
    await vi.waitFor(() => expect(text()).toContain("Residual"));
    expect(text()).toContain("4 ms");
  });

  test("reports a metronome that will not start instead of a result", async () => {
    render(CalibrationPanel, {
      ...base,
      ...fakeInput(0),
      runClicks: async () => {
        throw new Error("Audio is blocked.");
      },
    });

    button("Calibrate")!.click();
    await vi.waitFor(() => expect(text()).toContain("Audio is blocked."));
    expect(button("Calibrate")).toBeDefined();
  });

  test("cannot be started when the input is unavailable", () => {
    render(CalibrationPanel, {
      ...base,
      ...fakeInput(0),
      disabledReason: "Stop the metronome first.",
    });

    expect(button("Calibrate")?.disabled).toBe(true);
    expect(text()).toContain("Stop the metronome first.");
  });

  test("Stop while the metronome is still starting stops the clock that arrives late", async () => {
    let start!: (run: ClickRun) => void;
    const stopped = vi.fn();
    render(CalibrationPanel, {
      ...base,
      subscribeTaps: () => () => {},
      runClicks: () => new Promise<ClickRun>((resolve) => (start = resolve)),
    });

    button("Calibrate")!.click();
    await vi.waitFor(() => expect(button("Stop")).toBeDefined());
    button("Stop")!.click();
    await vi.waitFor(() => expect(button("Calibrate")).toBeDefined());

    start({ stop: stopped, done: new Promise<void>(() => {}) });
    await vi.waitFor(() => expect(stopped).toHaveBeenCalledOnce());
  });

  test("a second Calibrate disposes the clock the abandoned one started", async () => {
    const starts: Array<(run: ClickRun) => void> = [];
    const stopped: number[] = [];
    render(CalibrationPanel, {
      ...base,
      subscribeTaps: () => () => {},
      runClicks: () => new Promise<ClickRun>((resolve) => starts.push(resolve)),
    });

    button("Calibrate")!.click();
    await vi.waitFor(() => expect(starts.length).toBe(1));
    button("Stop")!.click();
    await vi.waitFor(() => expect(button("Calibrate")).toBeDefined());
    button("Calibrate")!.click();
    await vi.waitFor(() => expect(starts.length).toBe(2));

    // The first clock finally comes up after it was abandoned.
    starts[0]!({ stop: () => stopped.push(0), done: new Promise<void>(() => {}) });
    await vi.waitFor(() => expect(stopped).toEqual([0]));
    // The run still on screen is untouched.
    expect(button("Stop")).toBeDefined();
  });

  test("saving does not re-derive the estimate against the offset it just wrote", async () => {
    const input = fakeInput(35, [-4, 2, 6, -2, 0]);
    const { rerender } = render(CalibrationPanel, { ...base, ...input, offsetMs: 10 });

    button("Calibrate")!.click();
    await vi.waitFor(() => expect(button("Save offset")).toBeDefined());
    expect(text()).toContain("Estimated offset: 45 ms");

    button("Save offset")!.click();
    // The page writes the new offset back down into the panel.
    await rerender({ ...base, ...input, offsetMs: 45 });
    expect(text()).toContain("Estimated offset: 45 ms");
    expect(text()).not.toContain("80 ms");
  });

  test("Stop during the tail window still detaches the taps and stops the clock", async () => {
    const unsubscribed = vi.fn();
    const stopped = vi.fn();
    let lastClick!: () => void;
    render(CalibrationPanel, {
      ...base,
      subscribeTaps: () => unsubscribed,
      runClicks: async () => ({
        stop: stopped,
        done: new Promise<void>((resolve) => (lastClick = resolve)),
      }),
    });

    button("Calibrate")!.click();
    await vi.waitFor(() => expect(button("Stop")).toBeDefined());
    // The clicks are done; the panel is now in its 700 ms tail, still "running".
    lastClick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(unsubscribed).not.toHaveBeenCalled();
    expect(button("Stop")).toBeDefined();

    button("Stop")!.click();
    await vi.waitFor(() => expect(unsubscribed).toHaveBeenCalledOnce());
    expect(stopped).toHaveBeenCalled();
  });
});
