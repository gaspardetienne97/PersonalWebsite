import { flushSync } from "svelte";
import { describe, expect, it, vi } from "vite-plus/test";

import type { NarratorDoc } from "../domain/types";
import { synthesize } from "../services/tts";
import { NarrationPlayer, type EngineMode } from "./narration.svelte";

// The natural voice's model cannot be reached (the load fails a moment later, as a request
// would), and nothing is spoken out loud during the test.
vi.mock("../services/tts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/tts")>()),
  synthesize: vi.fn(
    () => new Promise((_, reject) => setTimeout(() => reject(new Error("model unreachable")), 5)),
  ),
  speechAvailable: () => false,
}));

const doc: NarratorDoc = {
  id: "fallback-test",
  title: "Fallback",
  author: "Test",
  kind: "paste",
  accent: "#1291FA",
  meta: "Pasted",
  voice: "",
  chapters: [
    { id: "c1", title: "One", paragraphs: ["First sentence here. Second sentence here."] },
  ],
};

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("NarrationPlayer, natural voice failure", () => {
  it("settles on the system voice while the reader keeps asking for the natural one", async () => {
    localStorage.clear();
    const player = new NarrationPlayer(doc);
    let engine = $state<EngineMode>("natural");
    // The reader keeps the player on the engine chosen in settings (see ReaderView).
    const stop = $effect.root(() => {
      $effect(() => player.setEngine(engine));
    });
    flushSync();

    player.play();
    await vi.waitFor(() => expect(player.usingFallback).toBe(true));
    // Long enough for a retry loop to show itself.
    await pause(60);
    flushSync();

    expect(player.engineMode).toBe("system");
    expect(player.usingFallback).toBe(true);
    expect(player.modelLoading).toBe(false);
    expect(synthesize).toHaveBeenCalledTimes(1);

    // Choosing the natural voice again in settings is a new request: it gets one more try.
    engine = "system";
    flushSync();
    expect(player.usingFallback).toBe(false);
    engine = "natural";
    flushSync();
    expect(player.engineMode).toBe("natural");
    await vi.waitFor(() => expect(player.usingFallback).toBe(true));
    expect(synthesize).toHaveBeenCalledTimes(2);

    player.dispose();
    stop();
  });

  it("tries the natural voice again when asked, and only after a fallback", async () => {
    localStorage.clear();
    vi.mocked(synthesize).mockClear();
    const player = new NarrationPlayer(doc);
    player.setEngine("natural");

    player.retryNatural(); // nothing has failed yet
    expect(synthesize).not.toHaveBeenCalled();

    player.play();
    await vi.waitFor(() => expect(player.usingFallback).toBe(true));
    expect(synthesize).toHaveBeenCalledTimes(1);

    player.retryNatural();
    expect(player.engineMode).toBe("natural");
    expect(player.usingFallback).toBe(false);
    expect(player.playing).toBe(true);
    await vi.waitFor(() => expect(player.usingFallback).toBe(true));
    expect(synthesize).toHaveBeenCalledTimes(2);

    player.dispose();
  });
});
