import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import MusicNavigation from "./MusicNavigation.svelte";

describe("MusicNavigation", () => {
  test("renders the four hubs and the utility links", () => {
    render(MusicNavigation, { currentPath: "/music" });
    for (const label of [
      "Practice",
      "Library",
      "Create",
      "Progress",
      "Connect",
      "Tuner",
      "Settings",
      "Guide",
    ]) {
      expect(document.body.textContent).toContain(label);
    }
  });

  test("marks Practice as current on /music", () => {
    render(MusicNavigation, { currentPath: "/music" });
    const current = document.querySelector('a[aria-current="page"]');
    expect(current?.getAttribute("href")).toBe("/music");
  });

  test("a drill sub-route lights up the Practice hub, not other hubs", () => {
    render(MusicNavigation, { currentPath: "/music/play/scales" });
    const activeHrefs = [...document.querySelectorAll('a[aria-current="page"]')].map((a) =>
      a.getAttribute("href"),
    );
    expect(activeHrefs).toContain("/music");
    expect(activeHrefs).not.toContain("/music/library");
    expect(activeHrefs).not.toContain("/music/progress");
  });

  test("a song detail lights up the Library hub", () => {
    render(MusicNavigation, { currentPath: "/music/songs/song-1" });
    const activeHrefs = [...document.querySelectorAll('a[aria-current="page"]')].map((a) =>
      a.getAttribute("href"),
    );
    expect(activeHrefs).toContain("/music/library");
    expect(activeHrefs).not.toContain("/music");
  });
});
