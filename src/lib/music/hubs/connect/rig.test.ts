import { describe, expect, it } from "vitest";
import { hitLabel, micOptions, tileFor } from "./rig";

describe("connect rig", () => {
  it("gives the MPC and the Aerophone their own tile, everything else the keyboard", () => {
    expect(tileFor("mpc")).toBe("mpc");
    expect(tileFor("aerophone")).toBe("aerophone");
    expect(tileFor("piano")).toBe("keyboard");
    expect(tileFor(undefined)).toBe("keyboard");
  });

  it("reads MPC hits as bank A pads and other notes by name", () => {
    expect(hitLabel("mpc", 36)).toBe("A01");
    expect(hitLabel("mpc", 51)).toBe("A16");
    expect(hitLabel("mpc", 60)).toBe(hitLabel("keyboard", 60));
    expect(hitLabel("keyboard", 60)).toMatch(/^C/);
  });

  it("keeps the saved microphone listed by name before the browser shows names", () => {
    const unnamed = [{ deviceId: "", label: "Microphone 1" }];
    expect(micOptions(unnamed, "brio", "Logitech BRIO")).toEqual([
      { value: "", label: "Default input" },
      { value: "brio", label: "Logitech BRIO" },
    ]);
  });

  it("marks the saved microphone not connected once names are known", () => {
    const named = [
      { deviceId: "default", label: "Default" },
      { deviceId: "mbp", label: "MacBook Pro Microphone" },
    ];
    expect(micOptions(named, "brio", "Logitech BRIO").map((o) => o.label)).toEqual([
      "Default input",
      "MacBook Pro Microphone",
      "Logitech BRIO (not connected)",
    ]);
    expect(micOptions(named, "mbp", "MacBook Pro Microphone")).toHaveLength(2);
    expect(micOptions(named, undefined, "Default input")).toHaveLength(2);
  });
});
