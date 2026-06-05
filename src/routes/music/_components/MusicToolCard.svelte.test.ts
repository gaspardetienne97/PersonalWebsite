import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import MusicToolCard from "./MusicToolCard.svelte";

describe("MusicToolCard", () => {
  test("renders a themed route card with metadata and a call to action", () => {
    render(MusicToolCard, {
      href: "/music/learn/rhythm",
      title: "Rhythm Trainer",
      description: "Tap pulse, read timing, and tighten groove.",
      eyebrow: "Learn",
      meta: "Timing",
      action: "Start rhythm practice",
    });

    const link = document.querySelector<HTMLAnchorElement>('a[href="/music/learn/rhythm"]');

    expect(link).not.toBeNull();
    expect(link?.textContent).toContain("Learn");
    expect(link?.textContent).toContain("Rhythm Trainer");
    expect(link?.textContent).toContain("Tap pulse, read timing, and tighten groove.");
    expect(link?.textContent).toContain("Timing");
    expect(link?.textContent).toContain("Start rhythm practice");
    expect(link?.querySelector('[data-testid="music-tool-card-action"]')).not.toBeNull();
  });
});
