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

  test("renders a token-gradient band from the hue prop when no cover is provided", () => {
    render(MusicToolCard, { ...base, hue: "ear" });

    const band = document.querySelector('[data-testid="music-tool-card-band"]');
    expect(band).not.toBeNull();
    // The band lives inside the link, above the text body.
    expect(band?.closest('a[href="/music/learn/rhythm"]')).not.toBeNull();
    // No cover image; the fallback is a token gradient driven by the hue prop.
    expect(band?.querySelector("img")).toBeNull();
    expect(band?.querySelector("[aria-hidden]")?.className).toContain("from-skill-ear");
  });

  test("renders a full-bleed cover image when coverSrc is provided", () => {
    render(MusicToolCard, {
      ...base,
      hue: "ear",
      coverSrc: "/images/music/covers/rhythm.webp",
    });

    const band = document.querySelector('[data-testid="music-tool-card-band"]');
    const img = band?.querySelector<HTMLImageElement>("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe("/images/music/covers/rhythm.webp");
    expect(img?.className).toContain("object-cover");
    // Decorative: empty alt keeps the link's accessible name from its text.
    expect(img?.getAttribute("alt")).toBe("");
  });

  test("falls back to the hue gradient when the cover image fails to load", async () => {
    render(MusicToolCard, {
      ...base,
      hue: "ear",
      coverSrc: "/images/music/covers/does-not-exist.webp",
    });

    const band = document.querySelector('[data-testid="music-tool-card-band"]');
    const img = band?.querySelector<HTMLImageElement>("img");
    expect(img).not.toBeNull();

    img?.dispatchEvent(new Event("error"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(band?.querySelector("img")).toBeNull();
    expect(band?.querySelector("[aria-hidden]")?.className).toContain("from-skill-ear");
  });
});
