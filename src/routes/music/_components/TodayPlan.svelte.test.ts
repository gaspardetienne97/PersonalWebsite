import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import TodayPlan from "./TodayPlan.svelte";

function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
}

describe("TodayPlan", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("starts the routine and navigates to its first step", async () => {
    const navigate = vi.fn();
    render(TodayPlan, { navigate });

    await vi.waitFor(() => expect(button("Start routine")?.disabled).toBe(false));
    button("Start routine")?.click();

    // The first step depends on stored history (the plan is adaptive), so assert the
    // shape of the navigation and that Today's Continue button points at the same step.
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledOnce());
    const href = navigate.mock.calls[0]![0] as string;
    expect(href).toMatch(/^\/music\/(learn|play)\/[a-z-]+\?routine=1$/);
    await vi.waitFor(() => expect(document.body.textContent).toContain("Up first"));
    expect(document.querySelector(`a[href="${href}"]`)?.textContent).toContain("Continue routine");
    expect(document.body.textContent).not.toContain("Results are logged only after");
  });
});
