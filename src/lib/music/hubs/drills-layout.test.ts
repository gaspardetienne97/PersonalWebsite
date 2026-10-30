import { describe, expect, it } from "vitest";
import { CATALOG } from "@repo/music-core/content/catalog";
import { DRILL_GROUPS, withInstrument } from "./drills-layout";

describe("drills layout", () => {
  const rows = DRILL_GROUPS.flatMap((g) => g.rows);
  it("places every drill, and every Pads and Aerophone mode exactly once", () => {
    expect(CATALOG.filter((e) => !rows.some((r) => r.entry.id === e.id)).map((e) => e.id)).toEqual(
      [],
    );
    for (const id of ["pads", "aerophone"]) {
      // A one-mode row shows no chips; its link opens that mode.
      const shown = rows
        .filter((r) => r.entry.id === id)
        .flatMap((r) =>
          r.modes.length
            ? r.modes.map((m) => m.id)
            : [new URL(r.href, "http://x").searchParams.get("mode")!],
        );
      expect([...shown].sort(), id).toEqual(
        CATALOG.find((e) => e.id === id)!
          .modes.map((m) => m.id)
          .sort(),
      );
    }
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  });

  it("gives the ear drills and Scales chips that open each mode", () => {
    const intervals = rows.find((r) => r.key === "ear-intervals")!;
    expect(intervals.modes.find((m) => m.id === "voice")).toEqual({
      id: "voice",
      label: "Sing it",
      href: "/music/ear/intervals?answer=voice",
    });
    // One answer style: no chips, the row opens it.
    expect(rows.find((r) => r.key === "ear-fine-pitch")!.modes).toEqual([]);
    const scales = rows.find((r) => r.key === "scales")!;
    expect(scales.modes.map((m) => m.label)).toContain("Arpeggio");
    expect(scales.modes.find((m) => m.id === "arpeggio")!.href).toBe(
      "/music/scales?pattern=arpeggio",
    );
  });

  it("carries the filter's instrument on a row link, after any mode query", () => {
    expect(withInstrument("/music/scales", "ukulele")).toBe("/music/scales?instrument=ukulele");
    expect(withInstrument("/music/pads?mode=rudiments", "mpc")).toBe(
      "/music/pads?mode=rudiments&instrument=mpc",
    );
    expect(withInstrument("/music/scales")).toBe("/music/scales");
  });
});
