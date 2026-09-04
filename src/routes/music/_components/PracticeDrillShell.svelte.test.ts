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
});
