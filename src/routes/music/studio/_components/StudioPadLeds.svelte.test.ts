import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import StudioPadLeds from "./StudioPadLeds.svelte";

afterEach(() => {
  document.body.replaceChildren();
});

function makeRuntime(send = vi.fn(() => true), enable = vi.fn(async () => true)) {
  return {
    midi: {
      state: {
        outputs: [
          { id: "mpc-priv", name: "MPC One+ Private", manufacturer: "Akai", type: "output" },
        ],
      },
      subscribeState: () => () => {},
      enable,
      send,
    },
  } as unknown as Parameters<typeof render<typeof StudioPadLeds>>[1]["runtime"];
}

const KIT = {
  kitId: "k1",
  name: "Boom Bap",
  pads: [
    { midiNote: 36, padId: "pad-36", label: "Kick", status: "playable" as const },
    { midiNote: 38, padId: "pad-38", label: "Snare", status: "playable" as const },
    { midiNote: 40, padId: "pad-40", label: "Gone", status: "missing" as const },
  ],
};

function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
    b.textContent?.includes(label),
  );
}

describe("StudioPadLeds", () => {
  test("lights the active kit's assigned pads via the captured protocol", async () => {
    vi.useFakeTimers();
    try {
      const send = vi.fn(() => true);
      const enable = vi.fn(async () => true);
      render(StudioPadLeds, { runtime: makeRuntime(send, enable), activeKit: KIT });

      button("Light pads")?.click();
      await vi.waitFor(() => expect(enable).toHaveBeenCalled());

      const frames = send.mock.calls.map(([, frame]) => frame as number[]);
      // Init handshake went out (identity request is the first frame).
      expect(frames).toContainEqual([0xf0, 0x7e, 0x00, 0x06, 0x01, 0xf7]);
      // Assigned pad 0 (note 36) lit green: kitPadColors -> {0,110,60}.
      expect(frames).toContainEqual([
        0xf0, 0x47, 0x7f, 0x56, 0x65, 0x00, 0x04, 0x00, 0x00, 110, 60, 0xf7,
      ]);
      // Missing pad 4 (note 40) stays dim: {12,12,20}.
      expect(frames).toContainEqual([
        0xf0, 0x47, 0x7f, 0x56, 0x65, 0x00, 0x04, 0x04, 12, 12, 20, 0xf7,
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  test("Pads off sends an all-black layout", async () => {
    vi.useFakeTimers();
    try {
      const send = vi.fn(() => true);
      render(StudioPadLeds, { runtime: makeRuntime(send), activeKit: KIT });

      button("Light pads")?.click();
      await vi.waitFor(() => expect(send).toHaveBeenCalled());
      button("Pads off")?.click();

      const frames = send.mock.calls.map(([, frame]) => frame as number[]);
      expect(frames).toContainEqual([
        0xf0, 0x47, 0x7f, 0x56, 0x65, 0x00, 0x04, 0x00, 0x00, 0x00, 0x00, 0xf7,
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  test("does nothing destructive without an active kit", () => {
    const send = vi.fn(() => true);
    render(StudioPadLeds, { runtime: makeRuntime(send), activeKit: undefined });
    expect(button("Light pads")?.disabled).toBe(true);
    expect(document.body.textContent).toContain("Activate a sample kit");
  });
});
