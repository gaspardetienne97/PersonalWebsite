import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";

function button(match: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find((candidate) =>
    candidate.textContent?.includes(match),
  );
}

describe("/music/recording/+page.svelte", () => {
  test("renders takes, compare, and capture surfaces", () => {
    render(Page);
    expect(document.querySelector("h1")?.textContent).toContain("Recording & Self-Review");
    expect(document.body.textContent).toContain("Takes");
    expect(document.body.textContent).toContain("No takes yet");
    expect(
      document.querySelector('[role="group"][aria-label="On-screen keyboard"]'),
    ).not.toBeNull();
  });

  test("records an on-screen take and lists it", async () => {
    render(Page);
    button("New recording")?.click();
    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());

    const c4 = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (candidate) => candidate.textContent?.trim() === "C4",
    );
    c4?.click();
    await vi.waitFor(() => expect(button("Stop · 1")).not.toBeUndefined());

    button("Stop")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Take 1"));
    expect(document.body.textContent).toContain("1 notes");
  });
});
