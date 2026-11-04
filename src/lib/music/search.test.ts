import { describe, expect, it } from "vitest";
import { drillsFor, recentDrills, searchIndex, searchItems, splitMatch } from "./search";

describe("palette search", () => {
  it("ranks drills above the reference page and tells the two scales drills apart", () => {
    const hits = searchItems("scal");
    const at = (label: string) => hits.findIndex((h) => h.label === label);
    expect(at("Scales")).toBeLessThan(at("Chord and scale reference"));
    expect(at("Scales and modes")).toBeLessThan(at("Chord and scale reference"));
    const hint = (label: string) => hits.find((h) => h.label === label)!.hint;
    expect(hint("Scales")).toBe("Technique drill");
    expect(hint("Scales and modes")).toBe("Ear training drill");
  });

  it("puts an exact label first and keyword-only matches last", () => {
    expect(searchItems("progress")[0].label).toBe("Progress");
    const hits = searchItems("tuner");
    expect(hits[0].label).toBe("Tuner");
    // Intonation and Drone only match on their hint.
    expect(hits.slice(1).map((h) => h.label)).toEqual(
      expect.arrayContaining(["Intonation", "Drone"]),
    );
  });

  it("shows the first dozen items with no query", () => {
    expect(searchItems("  ")).toEqual(searchIndex().slice(0, 12));
  });

  it("drops matches on a description once two titles match", () => {
    const labels = searchItems("interv")
      .filter((h) => h.kind !== "all")
      .map((h) => h.label);
    expect(labels.slice(0, 2)).toEqual(expect.arrayContaining(["Intervals"]));
    expect(labels).not.toContain("Fretboard");
    expect(labels).not.toContain("Aerophone");
    expect(labels.every((l) => l.toLowerCase().includes("interv"))).toBe(true);
  });

  it("says what a description-only match matched", () => {
    expect(searchItems("sequencer")[0]).toMatchObject({
      label: "Beat grid",
      match: "sequencer drums song backing track",
    });
    // Titles and hints are shown already.
    expect(searchItems("tuner").every((h) => h.match === undefined)).toBe(true);
  });

  it("leads the empty palette with the given items, then pages, each place once", () => {
    const next = {
      label: "Rhythm",
      href: "/music/rhythm?routine=r&step=1",
      hint: "Next in today's set",
    };
    const recent = recentDrills([
      { exerciseId: "rhythm.pulse", startedAt: 3 },
      { exerciseId: "technique.scale", startedAt: 2 },
      { exerciseId: "technique.scale", startedAt: 1 },
    ]);
    const hits = searchItems("", searchIndex(), [next, ...recent]);
    expect(hits[0]).toBe(next);
    // The rhythm drill is the next block, so it is not listed again as recent.
    expect(hits.slice(0, 2).map((h) => h.href.split("?")[0])).toEqual([
      "/music/rhythm",
      "/music/scales",
    ]);
    expect(hits.at(-1)!.group).toBe("Pages");
    // Four pages, then a row that opens the rest.
    expect(hits.filter((h) => h.group === "Pages")).toHaveLength(5);
    expect(hits.at(-1)).toMatchObject({ kind: "more", label: "More pages" });
    const every = searchItems("", searchIndex(), [next, ...recent], true);
    expect(every.some((h) => h.kind === "more")).toBe(false);
    expect(every.filter((h) => h.group === "Pages").length).toBeGreaterThan(5);
  });

  it("lists recent drills newest first, once each, ukulele runs under their drill", () => {
    const recent = recentDrills([
      { exerciseId: "technique.scale", startedAt: 1 },
      { exerciseId: "technique.scale", startedAt: 5 },
      { exerciseId: "nothing.known", startedAt: 9 },
    ]);
    expect(recent.map((r) => r.href)).toEqual(["/music/scales"]);
  });

  it("suggests drills for the instrument before there is any history", () => {
    const drills = drillsFor("piano");
    expect(drills).toHaveLength(3);
    expect(drills.every((d) => d.drill)).toBe(true);
  });

  it("labels pages with their real place and ends drill results with a Show all row", () => {
    const hint = (label: string) => searchIndex().find((h) => h.label === label)!.hint;
    expect(hint("All drills")).toBe("Drills");
    expect(hint("Learning paths")).toBe("Paths");
    const hits = searchItems("interv");
    expect(hits.at(-1)).toMatchObject({ kind: "all", href: "/music?tab=drills&q=interv" });
    expect(searchItems("journal").some((h) => h.kind === "all")).toBe(false);
  });

  it("splits a label around the match for bold", () => {
    expect(splitMatch("Interval comparison", "comp")).toEqual(["Interval ", "comp", "arison"]);
    expect(splitMatch("Tuner", "zz")).toEqual(["Tuner", "", ""]);
  });
});
