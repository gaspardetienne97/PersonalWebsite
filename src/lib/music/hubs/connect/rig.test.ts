import { describe, expect, it } from "vite-plus/test";
import { describeMidi, hitLabel, isDetail, micOptions, strength, tileFor, velocityOf } from "./rig";

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

  it("reads raw MIDI bytes in words", () => {
    expect(describeMidi("90 3C 5A")).toBe("C4 played, medium");
    expect(describeMidi("90 3C 64")).toBe("C4 played, hard");
    expect(describeMidi("90 3C 20")).toBe("C4 played, soft");
    expect(describeMidi("90 3C 00")).toBe("C4 released");
    expect(describeMidi("89 2A 00", (n) => `Pad ${n}`)).toBe("Pad 42 released");
    expect(describeMidi("B0 02 50")).toBe("Breath 80");
    expect(describeMidi("B0 07 64")).toBe("Controller 7 set to 100");
    expect(describeMidi("E0 00 40")).toBe("Pitch bend 0");
    expect(describeMidi("F0 47 7F 3B F7")).toBe("System message (SysEx, 5 bytes)");
    expect(describeMidi("")).toBe("Unreadable message");
  });

  it("reads velocity as a word and keeps the number for details", () => {
    expect([1, 49, 50, 95, 96, 127].map(strength)).toEqual([
      "Soft",
      "Soft",
      "Medium",
      "Medium",
      "Hard",
      "Hard",
    ]);
    expect(velocityOf("99 25 64")).toBe(100);
    expect(velocityOf("90 3C 00")).toBe(null);
    expect(velocityOf("B0 02 50")).toBe(null);
  });

  it("keeps releases, clock and keep-alives for the details view", () => {
    expect(isDetail("90 3C 5A")).toBe(false);
    expect(isDetail("90 3C 00")).toBe(true);
    expect(isDetail("80 3C 40")).toBe(true);
    expect(isDetail("F8")).toBe(true);
    expect(isDetail("FE")).toBe(true);
    expect(isDetail("B0 02 50")).toBe(false);
  });
});
