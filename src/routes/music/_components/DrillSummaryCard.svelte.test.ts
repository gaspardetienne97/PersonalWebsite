import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";
import { createRawSnippet } from "svelte";

import DrillSummaryCard from "./DrillSummaryCard.svelte";

const region = (text: string) =>
  createRawSnippet(() => ({
    render: () => `<div>${text}</div>`,
  }));

const heading = createRawSnippet(() => ({
  render: () => `<span>RESULTS HEADLINE</span>`,
}));

describe("DrillSummaryCard frame", () => {
  test("renders the heading and body regions", () => {
    render(DrillSummaryCard, {
      heading,
      children: region("BODY CONTENT"),
    });

    expect(document.body.textContent).toContain("RESULTS HEADLINE");
    expect(document.body.textContent).toContain("BODY CONTENT");
  });

  test("renders the actions footer and the optional pass-through slots", () => {
    render(DrillSummaryCard, {
      heading,
      children: region("BODY CONTENT"),
      actions: region("ACTION ROW"),
      lastRunDelta: region("LAST RUN DELTA"),
      routineContinue: region("ROUTINE CONTINUE"),
      nextUp: region("NEXT UP"),
    });

    expect(document.body.textContent).toContain("ACTION ROW");
    expect(document.body.textContent).toContain("LAST RUN DELTA");
    expect(document.body.textContent).toContain("ROUTINE CONTINUE");
    expect(document.body.textContent).toContain("NEXT UP");
  });

  test("exposes a focusable heading wrapper and does NOT self-focus (route owns focus)", () => {
    render(DrillSummaryCard, {
      heading,
      children: region("BODY CONTENT"),
    });

    const focusable = document.querySelector<HTMLElement>('[tabindex="-1"]');
    expect(focusable).not.toBeNull();
    expect(focusable?.textContent).toContain("RESULTS HEADLINE");
    // No self-focus: the card must not steal focus on mount.
    expect(document.activeElement).not.toBe(focusable);
  });

  test("renders a Change setup action wired to onChangeSetup", async () => {
    const onChangeSetup = vi.fn();
    render(DrillSummaryCard, {
      heading,
      children: region("BODY CONTENT"),
      onChangeSetup,
    });

    const button = [...document.querySelectorAll("button")].find(
      (candidate) => candidate.textContent?.trim() === "Change setup",
    );
    expect(button).not.toBeUndefined();
    button?.click();
    expect(onChangeSetup).toHaveBeenCalledOnce();
  });

  test("omits the Change setup action when no handler is provided", () => {
    render(DrillSummaryCard, {
      heading,
      children: region("BODY CONTENT"),
    });

    const button = [...document.querySelectorAll("button")].find(
      (candidate) => candidate.textContent?.trim() === "Change setup",
    );
    expect(button).toBeUndefined();
  });
});
