import { describe, expect, it } from "vitest";
import { CATALOG } from "@repo/music-core/content/catalog";
import { DRILL_GROUPS } from "./drills-layout";

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
          r.modes.length ? r.modes : [new URL(r.href, "http://x").searchParams.get("mode")!],
        );
      expect([...shown].sort(), id).toEqual(
        CATALOG.find((e) => e.id === id)!
          .modes.map((m) => m.id)
          .sort(),
      );
    }
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  });
});
