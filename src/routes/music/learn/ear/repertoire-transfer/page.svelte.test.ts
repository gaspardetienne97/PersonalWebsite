import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import { SoundEngine } from "@repo/music-core/engines/sound";

import Page from "./+page.svelte";
import { repertoireScore, setupEarTest } from "../_components/ear-test-helpers";

describe("/music/learn/ear/repertoire-transfer/+page.svelte", () => {
  setupEarTest();

  test("surfaces repertoire transfer prompts from saved songs", async () => {
    const playPattern = vi.spyOn(SoundEngine.prototype, "playPattern");
    render(Page, {
      library: {
        list: vi.fn(async () => [
          {
            id: "song-1",
            title: "Transfer Study",
            createdAt: 0,
            updatedAt: 0,
            score: repertoireScore(),
          },
        ]),
      },
    });

    // The route title says "Repertoire transfer" before the queue loads; wait for the phrase itself.
    await vi.waitFor(() => expect(document.body.textContent).toContain("Transfer Study"));
    expect(document.body.textContent).toContain("Transfer Study");
    expect(document.body.textContent).toContain("1 / do, 2 / re, 3 / mi, 5 / sol");

    [...document.querySelectorAll("button")]
      .find((button) => button.textContent?.trim() === "Preview transfer")
      ?.click();

    await vi.waitFor(() =>
      expect(playPattern).toHaveBeenCalledWith([
        { midiNotes: [60], offsetSeconds: 0, durationSeconds: 0.5 },
        { midiNotes: [62], offsetSeconds: 0.5, durationSeconds: 0.5 },
        { midiNotes: [64], offsetSeconds: 1, durationSeconds: 0.5 },
        { midiNotes: [67], offsetSeconds: 1.5, durationSeconds: 0.5 },
      ]),
    );
  });

  test("ranks a review queue across saved songs with status badges", async () => {
    render(Page, {
      library: {
        list: vi.fn(async () => [
          {
            id: "song-1",
            title: "Song One",
            createdAt: 0,
            updatedAt: 0,
            score: { ...repertoireScore(), id: "s1", title: "Song One" },
          },
          {
            id: "song-2",
            title: "Song Two",
            createdAt: 0,
            updatedAt: 0,
            score: { ...repertoireScore(), id: "s2", title: "Song Two" },
          },
        ]),
      },
    });

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("Review phrases from your saved songs"),
    );
    expect(document.body.textContent).toContain("Song One");
    expect(document.body.textContent).toContain("Song Two");
    // Each phrase carries a review-status badge (exact value depends on practice history).
    expect(document.body.textContent).toMatch(/New|Review due|Strong/);
    // One Practice button per ranked phrase.
    const practiceButtons = [...document.querySelectorAll("button")].filter(
      (button) => button.textContent?.trim() === "Practice transfer",
    );
    expect(practiceButtons.length).toBe(2);
  });

  test("surfaces a structured repertoire review plan", async () => {
    render(Page, {
      library: {
        list: vi.fn(async () => [
          {
            id: "song-1",
            title: "Song One",
            createdAt: 0,
            updatedAt: 0,
            score: { ...repertoireScore(), id: "s1", title: "Song One" },
          },
          {
            id: "song-2",
            title: "Song Two",
            createdAt: 0,
            updatedAt: 0,
            score: { ...repertoireScore(), id: "s2", title: "Song Two" },
          },
        ]),
      },
    });

    await vi.waitFor(() => expect(document.body.textContent).toContain("Repertoire review plan"));
    expect(document.body.textContent).toMatch(/Warm up|Review due|New material|Stretch/);
  });

  test("starts a scored repertoire transfer drill from a saved song phrase", async () => {
    render(Page, {
      library: {
        list: vi.fn(async () => [
          {
            id: "song-1",
            title: "Transfer Study",
            createdAt: 0,
            updatedAt: 0,
            score: repertoireScore(),
          },
        ]),
      },
    });

    // The route title says "Repertoire transfer" before the queue loads; wait for the phrase itself.
    await vi.waitFor(() => expect(document.body.textContent).toContain("Transfer Study"));
    vi.useFakeTimers();
    [...document.querySelectorAll("button")]
      .find((button) => button.textContent?.trim() === "Practice transfer")
      ?.click();
    await vi.advanceTimersByTimeAsync(3_000);

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("Play back the saved-song phrase"),
    );
    for (const noteName of ["C4", "D4", "E4", "G4"]) {
      [...document.querySelectorAll("button")]
        .find((button) => button.textContent === noteName)
        ?.click();
    }

    await vi.waitFor(() => expect(document.body.textContent).toContain("Session complete"));
    expect(document.body.textContent).toContain("1 of 1 correct");
    await vi.waitFor(() =>
      expect(document.querySelector('[data-testid="phrase-result-feedback"]')).not.toBeNull(),
    );
    expect(document.querySelector('[data-testid="phrase-result-feedback"]')?.textContent).toContain(
      "4 / 4 matched",
    );
    expect(document.body.textContent).not.toContain("Cannot read properties");
  });

  test("retries repertoire phrase mistakes as focused scale-degree review", async () => {
    render(Page, {
      library: {
        list: vi.fn(async () => [
          {
            id: "song-1",
            title: "Transfer Study",
            createdAt: 0,
            updatedAt: 0,
            score: repertoireScore(),
          },
        ]),
      },
    });

    // The route title says "Repertoire transfer" before the queue loads; wait for the phrase itself.
    await vi.waitFor(() => expect(document.body.textContent).toContain("Transfer Study"));
    vi.useFakeTimers();
    [...document.querySelectorAll("button")]
      .find((button) => button.textContent?.trim() === "Practice transfer")
      ?.click();
    await vi.advanceTimersByTimeAsync(3_000);

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("Play back the saved-song phrase"),
    );
    for (const noteName of ["C4", "D4", "D4", "G4"]) {
      [...document.querySelectorAll("button")]
        .find((button) => button.textContent === noteName)
        ?.click();
    }

    await vi.waitFor(() => expect(document.body.textContent).toContain("Session complete"));
    expect(document.body.textContent).toContain("3 → 2");

    [...document.querySelectorAll("button")]
      .find((button) => button.textContent?.trim() === "Retry mistakes")
      ?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("1 / 1"));
    expect(document.body.textContent).toContain("What scale degree did you hear?");
  });

  test("starts the repertoire review plan as a multi-prompt transfer session", async () => {
    render(Page, {
      library: {
        list: vi.fn(async () => [
          {
            id: "song-1",
            title: "Song One",
            createdAt: 0,
            updatedAt: 0,
            score: { ...repertoireScore(), id: "s1", title: "Song One" },
          },
          {
            id: "song-2",
            title: "Song Two",
            createdAt: 0,
            updatedAt: 0,
            score: { ...repertoireScore(), id: "s2", title: "Song Two" },
          },
        ]),
      },
    });

    await vi.waitFor(() => expect(document.body.textContent).toContain("Repertoire review plan"));
    vi.useFakeTimers();
    [...document.querySelectorAll("button")]
      .find((button) => button.textContent?.trim() === "Practice review plan")
      ?.click();
    await vi.advanceTimersByTimeAsync(3_000);

    await vi.waitFor(() => expect(document.body.textContent).toContain("1 / 2"));
    for (const noteName of ["C4", "D4", "E4", "G4"]) {
      [...document.querySelectorAll("button")]
        .find((button) => button.textContent === noteName)
        ?.click();
    }
    await vi.waitFor(() => expect(document.body.textContent).toContain("2 / 2"));
    await vi.advanceTimersByTimeAsync(3_000);
    for (const noteName of ["C4", "D4", "E4", "G4"]) {
      [...document.querySelectorAll("button")]
        .find((button) => button.textContent === noteName)
        ?.click();
    }

    await vi.waitFor(() => expect(document.body.textContent).toContain("Session complete"));
    expect(document.body.textContent).toContain("2 of 2 correct");
  });
});
