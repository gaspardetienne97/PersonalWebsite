import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";
import { createRawSnippet } from "svelte";

import { MusicRuntime } from "../_runtime.svelte";
import PracticeDrillShell from "./PracticeDrillShell.svelte";
import shellSource from "./PracticeDrillShell.svelte?raw";

const region = (text: string) =>
  createRawSnippet(() => ({
    render: () => `<div>${text}</div>`,
  }));

describe("PracticeDrillShell phase-only contract", () => {
  test("has no legacy complete prop or render branch", () => {
    expect(shellSource).not.toMatch(/\bcomplete\b/);
  });

  test("phase='setup' renders only the setup region", () => {
    render(PracticeDrillShell, {
      phase: "setup",
      setup: region("SETUP REGION"),
      stage: region("STAGE REGION"),
      summary: region("SUMMARY REGION"),
    });

    expect(document.body.textContent).toContain("SETUP REGION");
    expect(document.body.textContent).not.toContain("STAGE REGION");
    expect(document.body.textContent).not.toContain("SUMMARY REGION");
  });

  test("phase='stage' renders stage, rail and the stageAction slot but not setup or summary", () => {
    render(PracticeDrillShell, {
      phase: "stage",
      setup: region("SETUP REGION"),
      stage: region("STAGE REGION"),
      rail: region("RAIL REGION"),
      stageAction: region("STAGE ACTION"),
      summary: region("SUMMARY REGION"),
    });

    expect(document.body.textContent).toContain("STAGE REGION");
    expect(document.body.textContent).toContain("RAIL REGION");
    expect(document.body.textContent).toContain("STAGE ACTION");
    expect(document.body.textContent).not.toContain("SETUP REGION");
    expect(document.body.textContent).not.toContain("SUMMARY REGION");
  });

  test("phase='summary' renders only the summary region", () => {
    render(PracticeDrillShell, {
      phase: "summary",
      setup: region("SETUP REGION"),
      stage: region("STAGE REGION"),
      summary: region("SUMMARY REGION"),
    });

    expect(document.body.textContent).toContain("SUMMARY REGION");
    expect(document.body.textContent).not.toContain("SETUP REGION");
    expect(document.body.textContent).not.toContain("STAGE REGION");
  });

  test("startPending disables the setup region via a fieldset", () => {
    render(PracticeDrillShell, {
      phase: "setup",
      startPending: true,
      setup: region("SETUP REGION"),
    });

    const fieldset = document.querySelector("fieldset");
    expect(fieldset).not.toBeNull();
    expect(fieldset?.disabled).toBe(true);
  });

  test("setup is enabled when startPending is false", () => {
    render(PracticeDrillShell, {
      phase: "setup",
      startPending: false,
      setup: region("SETUP REGION"),
    });

    const fieldset = document.querySelector("fieldset");
    expect(fieldset?.disabled ?? false).toBe(false);
  });

  test("owns focus mode: the stage phase marks the run as the screen's focus", async () => {
    const runtime = new MusicRuntime();
    const shell = render(PracticeDrillShell, {
      phase: "stage",
      runtime,
      stage: region("STAGE REGION"),
    });
    await vi.waitFor(() => expect(runtime.drillFocus).toBe(true));

    shell.rerender({ phase: "summary", runtime, summary: region("SUMMARY REGION") });
    await vi.waitFor(() => expect(runtime.drillFocus).toBe(false));
    runtime.dispose();
  });

  test("a nested shell can opt out of focus ownership", async () => {
    const runtime = new MusicRuntime();
    render(PracticeDrillShell, {
      phase: "stage",
      runtime,
      focus: false,
      stage: region("STAGE REGION"),
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(runtime.drillFocus).toBe(false);
    runtime.dispose();
  });
  test("setup with a summary line collapses the controls behind Edit setup and keeps the ready stage visible", async () => {
    render(PracticeDrillShell, {
      phase: "setup",
      setupSummary: region("D DORIAN · 100 BPM"),
      setup: region("SETUP CONTROLS"),
      readyStage: region("READY STAGE"),
    });

    expect(document.body.textContent).toContain("D DORIAN · 100 BPM");
    expect(document.body.textContent).toContain("READY STAGE");
    expect(document.body.textContent).not.toContain("SETUP CONTROLS");

    const toggle = [...document.querySelectorAll("button")].find((b) =>
      /Edit setup/.test(b.textContent ?? ""),
    );
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    toggle?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    expect(document.body.textContent).toContain("SETUP CONTROLS");
    // The controls region is what the toggle controls.
    const controlsId = toggle?.getAttribute("aria-controls");
    expect(controlsId).toBeTruthy();
    expect(document.getElementById(controlsId!)?.textContent).toContain("SETUP CONTROLS");
  });

  test("mode lands on the root element in every mode", async () => {
    const shell = render(PracticeDrillShell, {
      phase: "stage",
      focus: false,
      stage: region("STAGE REGION"),
    });
    expect(document.querySelector("[data-mode]")?.getAttribute("data-mode")).toBe("practice");

    await shell.rerender({
      phase: "stage",
      focus: false,
      mode: "check",
      stage: region("STAGE REGION"),
    });
    expect(document.querySelector("[data-mode]")?.getAttribute("data-mode")).toBe("check");

    await shell.rerender({
      phase: "stage",
      focus: false,
      mode: "demo",
      stage: region("STAGE REGION"),
    });
    expect(document.querySelector("[data-mode]")?.getAttribute("data-mode")).toBe("demo");
  });

  test("only demo dresses the stage with a dashed frame and the listening eyebrow", async () => {
    const shell = render(PracticeDrillShell, {
      phase: "stage",
      focus: false,
      mode: "demo",
      stage: region("STAGE REGION"),
    });
    const frame = document.querySelector('[data-testid="demo-frame"]');
    expect(frame?.className).toContain("border-dashed");
    expect(frame?.className).toContain("border-practice-accent/60");
    expect(document.body.textContent).toContain("listening, not scored");
    expect(document.body.textContent).toContain("STAGE REGION");

    await shell.rerender({
      phase: "stage",
      focus: false,
      mode: "practice",
      stage: region("STAGE REGION"),
    });
    expect(document.querySelector('[data-testid="demo-frame"]')).toBeNull();
    expect(document.body.textContent).not.toContain("listening, not scored");
    expect(document.body.textContent).toContain("STAGE REGION");
  });

  test("demo frames the ready stage too, since Demo runs before a run starts", () => {
    render(PracticeDrillShell, {
      phase: "setup",
      mode: "demo",
      setupSummary: region("C MAJOR"),
      readyStage: region("READY STAGE"),
    });
    const frame = document.querySelector('[data-testid="demo-frame"]');
    expect(frame?.textContent).toContain("READY STAGE");
    expect(frame?.className).toContain("border-dashed");
  });

  test("the rail renders under the stage, not beside it", () => {
    render(PracticeDrillShell, {
      phase: "stage",
      focus: false,
      stage: region("STAGE REGION"),
      rail: region("RAIL REGION"),
    });
    const stage = [...document.querySelectorAll("div")].find(
      (d) => d.textContent === "STAGE REGION",
    );
    const rail = [...document.querySelectorAll("div")].find((d) => d.textContent === "RAIL REGION");
    expect(stage && rail).toBeTruthy();
    // DOM order is reading order: stage first, then the rail below it.
    expect(stage!.compareDocumentPosition(rail!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // No two-column grid wraps them any more.
    expect(document.querySelector('[class*="lg:grid-cols-[minmax(0,1fr)_18rem]"]')).toBeNull();
  });
});
