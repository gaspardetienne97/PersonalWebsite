import { beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";
import { setTestUrl } from "../../_components/test-url";

describe("/music/learn/ear/+page.svelte (Ear Training Path)", () => {
  beforeEach(() => setTestUrl("/music/learn/ear"));

  test("renders the six steps in order, each opening one drill with its setup", async () => {
    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("Ear Training Path");
    const titles = [
      ...document.querySelectorAll('[data-testid="ear-path-steps"] li [role="heading"]'),
    ].map((el) => el.textContent?.trim());
    expect(titles.length).toBe(6);
    expect(titles[0]).toBe("Anchor the tonic");
    expect(titles[5]).toBe("Attach harmony and interval vocabulary");

    const practice = [...document.querySelectorAll('[data-testid="ear-path-steps"] a')].map((a) =>
      a.getAttribute("href"),
    );
    expect(practice).toContain("/music/learn/ear/scale-degrees?answer=listen-along&level=anchor");
    expect(practice).toContain("/music/learn/ear/mixed");
    expect(practice).toContain("/music/learn/ear/cadences");
    expect(document.body.textContent).toContain("Done when:");
    expect(document.querySelector('[data-testid="ear-path-continue"]')?.getAttribute("href")).toBe(
      "/music/learn/ear/scale-degrees?answer=choice&level=major-diatonic",
    );

    // Every drill is listed below the path as its own card.
    for (const slug of [
      "intervals",
      "chord-qualities",
      "cadences",
      "scale-degrees",
      "melody-dictation",
      "repertoire-transfer",
      "mixed",
    ]) {
      expect(document.querySelector(`a[href="/music/learn/ear/${slug}"]`), slug).not.toBeNull();
    }
    expect(document.body.textContent).toContain("Ear training review");
  });

  test("redirects legacy single-route links onto the drill route", async () => {
    setTestUrl("/music/learn/ear?drill=cadence&answer=listen");
    const navigate = vi.fn();
    render(Page, { navigate });
    expect(navigate).toHaveBeenCalledWith("/music/learn/ear/cadences?answer=listen");
  });

  test("sends the daily routine's ear step to the review drill", async () => {
    setTestUrl("/music/learn/ear?routine=1");
    const navigate = vi.fn();
    render(Page, { navigate });
    expect(navigate).toHaveBeenCalledWith("/music/learn/ear/mixed?routine=1");
  });

  test("stays on the path for a plain visit", async () => {
    const navigate = vi.fn();
    render(Page, { navigate });
    expect(navigate).not.toHaveBeenCalled();
  });
});
