import { render } from "vitest-browser-svelte";
import { describe, expect, test, vi } from "vitest";

import Page from "./+page.svelte";

describe("/music/coach/+page.svelte", () => {
  test("renders an engine-backed local coach plan", async () => {
    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("Practice Coach");
    await vi.waitFor(() => expect(document.body.textContent).toContain("Adaptive plan"));
    expect(document.body.textContent).toContain("Ear Training");
    expect(document.body.textContent).toContain("Start daily routine");
  });
});
