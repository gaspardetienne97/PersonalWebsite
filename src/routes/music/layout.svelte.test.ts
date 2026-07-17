import { createRawSnippet } from "svelte";
import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";
import type { AfterNavigate } from "@sveltejs/kit";

const navigationHooks = vi.hoisted(() => ({
  after: [] as Array<(navigation: AfterNavigate) => void>,
}));

vi.mock("$app/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("$app/navigation")>()),
  afterNavigate: (callback: (navigation: AfterNavigate) => void) => {
    navigationHooks.after.push(callback);
  },
}));

import Layout from "./+layout.svelte";
import { MusicRuntime } from "./_runtime.svelte";

describe("/music/+layout.svelte", () => {
  test("starts storage hydration before rendering children and reuses it on mount", async () => {
    let resolveStorage!: () => void;
    const storageReady = new Promise<void>((resolve) => {
      resolveStorage = resolve;
    });
    const attachStorage = vi
      .spyOn(MusicRuntime.prototype, "attachStorage")
      .mockReturnValue(storageReady);
    const attachJournal = vi.spyOn(MusicRuntime.prototype, "attachJournal");
    const attachMedia = vi.spyOn(MusicRuntime.prototype, "attachMedia");
    let childSawHydration = false;
    const children = createRawSnippet(() => {
      childSawHydration = attachStorage.mock.calls.length === 1;
      return { render: () => "<div>Child route</div>" };
    });

    const view = render(Layout, { children });

    expect(childSawHydration).toBe(true);
    expect(attachStorage).toHaveBeenCalledTimes(1);
    expect(attachJournal).not.toHaveBeenCalled();
    expect(attachMedia).not.toHaveBeenCalled();
    expect(document.querySelector("[data-practice-controls]")).not.toBeNull();
    expect(document.querySelector("[data-music-shell]")).not.toBeNull();
    expect(document.querySelector(".pb-16")).toBeNull();

    resolveStorage();
    await vi.waitFor(() => expect(attachJournal).toHaveBeenCalledTimes(1));
    expect(attachMedia).toHaveBeenCalledTimes(1);
    expect(attachStorage).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(document.querySelector("[data-music-shell]")).toBeNull();
  });

  test("forwards external same-component and popstate BPM activations", () => {
    navigationHooks.after.length = 0;
    const activate = vi
      .spyOn(MusicRuntime.prototype, "activatePracticeNavigation")
      .mockImplementation(() => undefined);
    const children = createRawSnippet(() => ({ render: () => "<div>Child route</div>" }));
    const view = render(Layout, { children });
    if (navigationHooks.after.length === 0)
      throw new Error("afterNavigate hook was not registered");

    for (const afterNavigate of navigationHooks.after) afterNavigate(navigation("enter", 160));
    for (const afterNavigate of navigationHooks.after) afterNavigate(navigation("link", 132));
    for (const afterNavigate of navigationHooks.after) afterNavigate(navigation("popstate", 84));

    expect(activate).toHaveBeenNthCalledWith(1, 1, 132);
    expect(activate).toHaveBeenNthCalledWith(2, 2, 84);
    view.unmount();
  });
});

function navigation(type: "enter" | "link" | "popstate", bpm: number): AfterNavigate {
  return {
    type,
    willUnload: false,
    complete: Promise.resolve(),
    delta: type === "popstate" ? -1 : undefined,
    from: {
      params: {},
      route: { id: "/music/play/scales" },
      url: new URL("https://example.test/music/play/scales?bpm=96"),
    },
    to: {
      params: {},
      route: { id: "/music/play/scales" },
      url: new URL(`https://example.test/music/play/scales?bpm=${bpm}`),
    },
  } as AfterNavigate;
}
