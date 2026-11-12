import { describe, expect, it } from "vitest";
import { backFor, DRILL_ROUTES, noteNavigation, ownerOf } from "./came-from.svelte";

describe("back links", () => {
  it("default to the hub that owns the page", () => {
    expect(DRILL_ROUTES).toContain("/music/phrases");
    expect(DRILL_ROUTES).toContain("/music/ear/intervals");
    expect(DRILL_ROUTES).not.toContain("/music/library");
    expect(ownerOf("/music/phrases")).toEqual({ href: "/music?tab=drills", label: "Drills" });
    expect(ownerOf("/music/songs/abc")).toEqual({ href: "/music/studio", label: "Studio" });
    expect(ownerOf("/music/create/kits")).toEqual({ href: "/music/studio", label: "Studio" });
    expect(ownerOf("/music/tuner")).toEqual({ href: "/music", label: "Today" });
    expect(backFor("/music/circle").label).toBe("Drills");
  });
  it("remember where a page was opened from", () => {
    noteNavigation(new URL("http://x/music?tab=paths"), new URL("http://x/music/circle"));
    expect(backFor("/music/circle")).toEqual({ href: "/music?tab=paths", label: "Paths" });
    noteNavigation(
      new URL("http://x/music/progress?view=journal"),
      new URL("http://x/music/scales"),
    );
    expect(backFor("/music/scales")).toEqual({
      href: "/music/progress?view=journal",
      label: "Journal",
    });
    noteNavigation(new URL("http://x/music/studio"), new URL("http://x/music/songs/abc"));
    expect(backFor("/music/songs/abc").label).toBe("Studio");
  });
});
