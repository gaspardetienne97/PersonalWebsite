import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import SessionFeedback from "./SessionFeedback.svelte";

describe("SessionFeedback", () => {
  test("shows correct feedback in ok state", () => {
    render(SessionFeedback, { kind: "correct", message: "Great ear!", xp: 25 });
    expect(document.body.textContent).toContain("Great ear!");
    expect(document.body.textContent).toContain("+25 XP");
  });

  test("shows wrong feedback in bad state", () => {
    render(SessionFeedback, { kind: "wrong", message: "That was a minor 7th." });
    expect(document.body.textContent).toContain("minor 7th");
  });
});
