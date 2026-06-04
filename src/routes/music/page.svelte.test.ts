import { describe, expect, it } from "vite-plus/test";
import { render } from "vitest-browser-svelte";
import Page from "./+page.svelte";

describe("/music/+page.svelte", () => {
  it("renders the music practice app on its own route", async () => {
    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("Musicianship OS");
    expect(document.body.textContent).toContain("MIDI devices");
    expect(document.body.textContent).toContain("Live MIDI events");
    expect(
      document.querySelector('[role="group"][aria-label="On-screen keyboard"]'),
    ).not.toBeNull();

    const c4 = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "C4",
    );
    c4?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(document.body.textContent).toContain("MIDI 60 from onscreen");
  });
});
