import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";

describe("/music/jam/+page.svelte", () => {
  test("renders the current chord, progression, and solo keyboard", () => {
    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("Jam / Improv");
    expect(document.body.textContent).toContain("Now playing");
    // ii–V–I default starts on Dm7
    expect(document.body.textContent).toContain("Dm7");
    expect(document.body.textContent).toContain("Target tones");
    expect(
      document.querySelector('[role="group"][aria-label="On-screen keyboard"]'),
    ).not.toBeNull();
  });

  test("advances to the next chord", async () => {
    render(Page);
    const nextChord = [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
      button.textContent?.includes("Next chord"),
    );
    expect(nextChord).not.toBeUndefined();
    nextChord?.click();
    // After advancing from Dm7, the V chord (G7) is now current.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.body.textContent).toContain("G7");
  });
});
