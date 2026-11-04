import { describe, expect, it } from "vitest";
import { pairStrums, slotAt, strokeVerdict, strumSlots, timingCounts } from "./strum-slots";

const row = (r: ReturnType<typeof strumSlots>) =>
  r.slots.map((s) => (s.stroke ? { down: "D", up: "U", mute: "X" }[s.stroke] : "-")).join("");

describe("strum slots", () => {
  it("draws D DU UDU on eight slots with its counts", () => {
    const r = strumSlots(
      [0, 1, 1.5, 2.5, 3, 3.5].map((beat, i) => ({
        beat,
        stroke: (["down", "down", "up", "up", "down", "up"] as const)[i],
      })),
    );
    expect(r.step).toBe(0.5);
    expect(row(r)).toBe("D-DU-UDU");
    expect(r.slots.map((s) => s.count).join(" ")).toBe("1 & 2 & 3 & 4 &");
  });

  it("keeps eighths for quarter-note strums, and finer grids for triplets and sixteenths", () => {
    expect(row(strumSlots([0, 1, 2, 3].map((beat) => ({ beat, stroke: "down" as const }))))).toBe(
      "D-D-D-D-",
    );
    const trip = strumSlots([0, 1 / 3, 2 / 3].map((beat) => ({ beat })));
    expect(trip.slots).toHaveLength(12);
    expect(trip.slots.slice(0, 3).map((s) => s.count)).toEqual(["1", "&", "a"]);
    expect(strumSlots([0, 0.25, 0.5, 0.75].map((beat) => ({ beat }))).slots).toHaveLength(16);
    // Triplets on 1 and eighths on 2 need sixths of a beat.
    expect(strumSlots([0, 1 / 3, 2 / 3, 1, 1.5].map((beat) => ({ beat }))).slots).toHaveLength(24);
  });

  it("lights the slot sounding now, bar after bar", () => {
    expect(slotAt(null, 0.5)).toBeNull();
    expect(slotAt(-0.2, 0.5)).toBeNull();
    expect(slotAt(0, 0.5)).toBe(0);
    expect(slotAt(1.6, 0.5)).toBe(3);
    expect(slotAt(5.6, 0.5)).toBe(3);
  });

  it("judges each strum against its nearest stroke, once, within half a beat", () => {
    expect(strokeVerdict(25, 40)).toEqual({ kind: "ontime", text: "On time" });
    expect(strokeVerdict(-62.4, 40)).toEqual({ kind: "early", text: "Early 62 ms" });
    expect(strokeVerdict(90, 40)).toEqual({ kind: "late", text: "Late 90 ms" });
    // Strokes at 0, 500, 1000 ms; strums at 20, 30 (a double), 1400 (too far), 1460.
    const offs = pairStrums([0, 500, 1000], [20, 30, 1400, 1460], 1000);
    expect(offs).toEqual([20, undefined, 400]);
    expect(timingCounts(offs, 40)).toEqual({ onTime: 1, early: 0, late: 1, missed: 1 });
  });
});
