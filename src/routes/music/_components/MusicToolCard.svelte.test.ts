import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import MusicToolCard from "./MusicToolCard.svelte";

const base = {
  href: "/music/learn/rhythm",
  title: "Rhythm Trainer",
  description: "Tap pulse, read timing, and tighten groove.",
  eyebrow: "Learn",
  meta: "Timing",
  action: "Start rhythm practice",
};

describe("MusicToolCard", () => {
  test("renders a themed route card with metadata and a call to action", () => {
    render(MusicToolCard, { ...base, hue: "rhythm" });

    const link = document.querySelector<HTMLAnchorElement>('a[href="/music/learn/rhythm"]');

    expect(link).not.toBeNull();
    expect(link?.textContent).toContain("Learn");
    expect(link?.textContent).toContain("Rhythm Trainer");
    expect(link?.textContent).toContain("Tap pulse, read timing, and tighten groove.");
    expect(link?.textContent).toContain("Timing");
    expect(link?.textContent).toContain("Start rhythm practice");
    expect(link?.querySelector('[data-testid="music-tool-card-action"]')).not.toBeNull();
  });

  test("renders a hue plate with a motif from the hue prop", () => {
    render(MusicToolCard, { ...base, hue: "ear" });

    const band = document.querySelector('[data-testid="music-tool-card-band"]');
    expect(band).not.toBeNull();
    // The band lives inside the link, above the text body.
    expect(band?.closest('a[href="/music/learn/rhythm"]')).not.toBeNull();
    // A token gradient driven by the hue prop, with the hue's motif drawn on it.
    expect(band?.querySelector("img")).toBeNull();
    expect(band?.querySelector("[aria-hidden]")?.className).toContain("from-skill-ear");
    expect(band?.querySelector("svg")).not.toBeNull();
  });
});
