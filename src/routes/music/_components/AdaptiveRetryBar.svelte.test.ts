import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import AdaptiveRetryBar from "./AdaptiveRetryBar.svelte";

const buttons = () => [...document.querySelectorAll("button")];
const labels = () => buttons().map((b) => b.textContent?.trim());

describe("AdaptiveRetryBar", () => {
  test("renders only the actions whose handlers are provided", () => {
    render(AdaptiveRetryBar, { onRetry: () => {}, onContinue: () => {} });
    expect(labels()).toEqual(["Retry this", "Continue"]);
    // No slow-down or weak-item button without their handlers.
    expect(document.body.textContent).not.toContain("Slow down");
    expect(document.body.textContent).not.toContain("Practice weak item");
  });

  test("fires the matching handler on click and respects custom labels", () => {
    const onRetry = vi.fn();
    const onContinue = vi.fn();
    render(AdaptiveRetryBar, { onRetry, onContinue, continueLabel: "Next chord" });

    buttons()
      .find((b) => b.textContent?.trim() === "Retry this")
      ?.click();
    buttons()
      .find((b) => b.textContent?.trim() === "Next chord")
      ?.click();

    expect(onRetry).toHaveBeenCalledOnce();
    expect(onContinue).toHaveBeenCalledOnce();
  });

  test("renders nothing actionable when no handlers are given", () => {
    render(AdaptiveRetryBar, {});
    expect(buttons()).toHaveLength(0);
  });
});
