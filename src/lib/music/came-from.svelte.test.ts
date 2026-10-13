import { describe, expect, it } from "vitest";
import { backFor, DRILL_ROUTES, noteNavigation, ownerOf } from "./came-from.svelte";

describe("back links", () => {
  it("default to the hub that owns the page", () => {
    expect(DRILL_ROUTES).toContain("/music/phrases");
    expect(DRILL_ROUTES).toContain("/music/ear/intervals");
    expect(DRILL_ROUTES).not.toContain("/music/library");
    expect(ownerOf("/music/phrases")).toEqual({ href: "/music?tab=drills", label: "Drills" });
    expect(ownerOf("/music/songs/abc")).toEqual({ href: "/music/library", label: "Library" });
    expect(ownerOf("/music/journal")).toEqual({ href: "/music/progress", label: "Progress" });
    expect(ownerOf("/music/tuner")).toEqual({ href: "/music", label: "Today" });
    expect(backFor("/music/circle").label).toBe("Drills");
  });
  it("remember where a page was opened from", () => {
    noteNavigation(new URL("http://x/music?tab=paths"), new URL("http://x/music/circle"));
    expect(backFor("/music/circle")).toEqual({ href: "/music?tab=paths", label: "Paths" });
  });
});
