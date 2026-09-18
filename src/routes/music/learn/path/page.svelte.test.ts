import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";

const click = async (label: string, option: string) => {
  const button = [...document.querySelectorAll(`[aria-label="${label}"] button`)].find(
    (candidate) => candidate.textContent?.trim() === option,
  );
  (button as HTMLButtonElement).click();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

describe("/music/learn/path/+page.svelte", () => {
  test("opens on the instrument progression with its steps chained", async () => {
    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("Piano Path");

    const instruments = [...document.querySelectorAll('[aria-label="Instrument"] button')].map(
      (button) => button.textContent?.trim(),
    );
    expect(instruments).toEqual(["Piano", "Guitar", "Ukulele", "Aerophone", "MPC / Pads"]);

    const steps = [...document.querySelectorAll('[data-testid="instrument-path-steps"] li')];
    expect(steps).toHaveLength(9);
    expect(steps[0]?.textContent).toContain("Five-finger pattern, one hand");
    expect(steps[0]?.querySelector('[data-step-status="next"]')).not.toBeNull();
    expect(steps[1]?.querySelector('[data-step-status="locked"]')).not.toBeNull();
  });

  test("selecting MPC shows M-B1 as Next and M-B2 locked", async () => {
    render(Page);
    await click("Instrument", "MPC / Pads");

    expect(document.querySelector("h1")?.textContent).toContain("MPC Path");
    const steps = [...document.querySelectorAll('[data-testid="instrument-path-steps"] li')];
    expect(steps).toHaveLength(8);
    expect(steps[0]?.textContent).toContain("Two pads on the click");
    expect(steps[0]?.querySelector('[data-step-status="next"]')).not.toBeNull();
    expect(steps[0]?.textContent).toContain("Next");
    expect(steps[1]?.textContent).toContain("Singles at sixteenths");
    expect(steps[1]?.querySelector('[data-step-status="locked"]')).not.toBeNull();
    expect(steps[1]?.textContent).toContain("Locked");
    // A locked step offers no way in.
    expect(steps[1]?.querySelector("a")).toBeNull();

    const links = steps.map((li) => li.querySelector("a")?.getAttribute("href"));
    expect(links[0]).toBe(
      "/music/play/mpc?mode=rudiment&pattern=single-strokes&sub=2&hits=16&bpm=60",
    );
    // The MPC has no jazz progression, so it gets no path toggle.
    expect(document.querySelector('[aria-label="Path"]')).toBeNull();
  });

  test("keeps the ten ordered jazz steps behind the path toggle", async () => {
    render(Page);
    await click("Path", "Jazz");

    expect(document.querySelector("h1")?.textContent).toContain("Jazz Path");
    const steps = document.querySelectorAll('[data-testid="jazz-path-steps"] li');
    expect(steps).toHaveLength(10);
    expect(steps[0]?.textContent).toContain("Memorize your intervals");
    expect(steps[7]?.textContent).toContain("Play the licks over ii-V-I");
    expect(steps[9]?.textContent).toContain("Learn repertoire from a Real Book");

    const links = [...document.querySelectorAll('[data-testid="jazz-path-steps"] a')].map((a) =>
      a.getAttribute("href"),
    );
    expect(links).toContain("/music/learn/ear/intervals");
    expect(links).toContain("/music/play/voicings");
    expect(links).toContain("/music/play/chord-scales?changes=major");
    expect(links).toContain("/music/play/licks?category=major-ii-V-I");
    // Reference steps stay in the list and link the drill that hears them.
    expect(links).toContain("/music/learn/ear/chord-qualities");
    expect(document.body.textContent).toContain("Reference");
  });
});
