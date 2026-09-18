import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import type { RawMidiEvent } from "@repo/music-core/engines/midi";

import MpcHardwareDiagnostic from "./MpcHardwareDiagnostic.svelte";

function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
    b.textContent?.includes(label),
  );
}

describe("MpcHardwareDiagnostic", () => {
  test("lights a pad with the captured MPC One+ color frame", () => {
    const send = vi.fn(() => true);
    render(MpcHardwareDiagnostic, {
      outputs: [
        {
          id: "mpc-out",
          name: "MPC One+ Public",
          manufacturer: "Akai Professional",
          type: "output",
        },
      ],
      sysexEnabled: true,
      send,
      subscribeRaw: vi.fn(() => vi.fn()),
    });

    button("Light pad 1 red")?.click();
    // F0 47 7F 56 65 00 04 [pad=0] [R=3F] [G=00] [B=00] F7
    expect(send).toHaveBeenCalledWith(
      "mpc-out",
      [0xf0, 0x47, 0x7f, 0x56, 0x65, 0x00, 0x04, 0x00, 0x3f, 0x00, 0x00, 0xf7],
    );
  });

  test("Keep linked replays the init handshake once and hands the link to the app", () => {
    const send = vi.fn(() => true);
    const onLink = vi.fn();
    render(MpcHardwareDiagnostic, {
      outputs: [{ id: "mpc-out", name: "MPC", type: "output" }],
      sysexEnabled: true,
      send,
      subscribeRaw: vi.fn(() => vi.fn()),
      onLink,
    });

    button("Keep linked")?.click();
    // Init handshake: identity request first, enter-controller-mode third.
    expect(send).toHaveBeenCalledWith("mpc-out", [0xf0, 0x7e, 0x00, 0x06, 0x01, 0xf7]);
    expect(send).toHaveBeenCalledWith(
      "mpc-out",
      [0xf0, 0x47, 0x7f, 0x56, 0x62, 0x00, 0x01, 0x61, 0xf7],
    );
    // The heartbeat is the runtime's job (see _runtime.svelte.test.ts), so the
    // component only records the choice.
    expect(onLink).toHaveBeenCalledWith("mpc-out");
  });

  test("a linked output shows as linked and Unlink clears it", () => {
    const onLink = vi.fn();
    render(MpcHardwareDiagnostic, {
      outputs: [{ id: "mpc-out", name: "MPC", type: "output" }],
      sysexEnabled: true,
      send: vi.fn(() => true),
      subscribeRaw: vi.fn(() => vi.fn()),
      linkedOutputId: "mpc-out",
      onLink,
    });
    expect(button("Linked")?.disabled).toBe(true);
    expect(document.body.textContent).toContain("keeps this output in Controller Mode");
    button("Unlink")?.click();
    expect(onLink).toHaveBeenCalledWith(undefined);
  });

  test("displays inbound SysEx from the device", async () => {
    let rawListener: ((event: RawMidiEvent) => void) | undefined;
    render(MpcHardwareDiagnostic, {
      outputs: [{ id: "mpc-out", name: "MPC", type: "output" }],
      sysexEnabled: true,
      send: vi.fn(() => true),
      subscribeRaw: (listener: (event: RawMidiEvent) => void) => {
        rawListener = listener;
        return vi.fn();
      },
    });

    rawListener?.({ data: [0xf0, 0x7e, 0x00, 0x06, 0x02, 0xf7], timestamp: 1, deviceId: "mpc-in" });
    await vi.waitFor(() => expect(document.body.textContent).toContain("F0 7E 00 06 02 F7"));
  });

  test("explains when SysEx permission is unavailable", () => {
    render(MpcHardwareDiagnostic, {
      outputs: [],
      sysexEnabled: false,
      send: vi.fn(() => false),
      subscribeRaw: vi.fn(() => vi.fn()),
    });

    expect(document.body.textContent).toContain("SysEx permission is required");
    expect(button("Light pad 1 red")?.disabled).toBe(true);
  });
});
