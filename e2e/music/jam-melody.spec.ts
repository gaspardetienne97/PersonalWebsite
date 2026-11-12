// The jazz and guitar steps that were left: Jam on one of your scores with its
// melody (quote the head, melody and fills), quartal and slash voicings on
// Maiden Voyage's changes, and guitar shells in Chords. Fake MIDI stamped to
// the beat, as in jam-graded.spec.ts; fret taps for the guitar.
import { expect, test, type Page } from "@playwright/test";
import { PORTS, installFakeMidi, startDrill, pickMode } from "./fixtures";

test.describe.configure({ retries: 2 });

/** An 8-bar AABA lead sheet, two bars a section: the head (G E F G) in the even bars, rests in the odd. */
const SONG = {
  id: "e2e-tune",
  title: "Test tune",
  createdAt: 1,
  updatedAt: 1,
  score: {
    id: "e2e-tune",
    title: "Test tune",
    bpm: 120,
    meter: { beats: 4, beatUnit: 4 },
    keyFifths: 0,
    lengthBeats: 32,
    sections: ["A", "A", "B", "A"].map((label, k) => ({
      label,
      startBeat: k * 8,
      endBeat: k * 8 + 8,
    })),
    chords: Array.from({ length: 8 }, (_, k) => ({
      symbol: k % 2 ? "G7" : "Cmaj7",
      startBeat: k * 4,
      durationBeats: 4,
    })),
    voices: [
      {
        id: "m",
        name: "Melody",
        notes: [0, 2, 4, 6].flatMap((bar) =>
          [67, 64, 65, 67].map((midi, j) => ({ midi, startBeat: bar * 4 + j, durationBeats: 1 })),
        ),
      },
    ],
  },
};

/** MIDI on, no count-in, piano on the strip; with `song`, the test tune in the library. */
async function setUp(page: Page, song = false) {
  await page.routeWebSocket(/.*/, () => {});
  await installFakeMidi(page, [PORTS.keys]);
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto("/music");
  await page.waitForLoadState("networkidle");
  await page.evaluate(
    (song) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("woodshed");
        open.onsuccess = () => {
          const tx = open.result.transaction(["settings", "songs"], "readwrite");
          const store = tx.objectStore("settings");
          const get = store.get("music.settings");
          get.onsuccess = () =>
            store.put({
              id: "music.settings",
              value: {
                ...get.result?.value,
                midiEnabledBefore: true,
                countInBars: 0,
                activeInstrument: "piano",
              },
            });
          if (song) tx.objectStore("songs").put(song);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      }),
    song ? SONG : null,
  );
}

/** Notes at beats from Jam's downbeat, sent a little early and stamped with their real time. */
async function playBeats(page: Page, notes: [midi: number, beat: number, len?: number][]) {
  const clock = page.getByTestId("jam-clock");
  await expect(clock).toHaveAttribute("data-downbeat", /\d+/);
  const downbeat = Number(await clock.getAttribute("data-downbeat"));
  const beatMs = Number(await clock.getAttribute("data-beat-ms"));
  await page.evaluate(
    ({ list, downbeat, beatMs }) => {
      for (const [midi, beat, len = 0.4] of list) {
        const at = downbeat + beat * beatMs;
        setTimeout(
          () => (window as any).__midi.send("in-keys", [0x90, midi, 90], at),
          Math.max(0, at - 80 - performance.now()),
        );
        setTimeout(
          () => (window as any).__midi.send("in-keys", [0x80, midi, 0], at + beatMs * len),
          Math.max(0, at + beatMs * len - 80 - performance.now()),
        );
      }
    },
    { list: notes, downbeat, beatMs },
  );
}

const lastRun = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<{ exerciseId: string; params: Record<string, unknown>; score: number }>(
        (resolve) => {
          const open = indexedDB.open("woodshed");
          open.onsuccess = () => {
            const get = open.result.transaction("sessions").objectStore("sessions").getAll();
            get.onsuccess = () =>
              resolve(get.result.flatMap((s: { runs: unknown[] }) => s.runs).at(-1) as never);
          };
        },
      ),
  );

test("Jam on your own score: its head on the lead sheet, quoted to open each A section", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await setUp(page, true);
  await page.goto(
    "/music/changes/jam?progression=song-e2e-tune&game=quote&choruses=1&backing=drums&transpose=0&meter=4&bpm=200",
  );
  await expect(page.getByTestId("jam-lead-sheet")).toContainText("Test tune, A A B A (8 bars)");
  await pickMode(page, "Check");
  await expect(page.getByTestId("jam-game")).toContainText("Quote the head");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  // The head's first four notes an octave up (then a note off the head) at bars 1, 3 and 7.
  const quote = (bar: number) =>
    [79, 76, 77, 79, 84].map((m, j) => [m, bar * 4 + j * 0.5] as [number, number]);
  await playBeats(page, [...quote(0), ...quote(2), ...quote(6)]);
  await expect(page.getByTestId("results-metric")).toHaveText("100%", { timeout: 25_000 });
  await expect(page.getByTestId("jam-graded")).toContainText("3 of 3 A sections");
  expect((await lastRun(page)).params).toMatchObject({
    progression: "song-e2e-tune",
    game: "quote",
  });
});

test("Jam's melody and fills: the head with a fill in each of its rests", async ({ page }) => {
  test.setTimeout(60_000);
  await setUp(page, true);
  await page.goto(
    "/music/changes/jam?progression=song-e2e-tune&game=melody-fills&choruses=1&backing=drums&transpose=0&meter=4&bpm=200",
  );
  await pickMode(page, "Check");
  await expect(page.getByRole("button", { name: "Start", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  const head = [0, 2, 4, 6].flatMap((bar) =>
    [67, 64, 65, 67].map((m, j) => [m + 12, bar * 4 + j, 0.8] as [number, number, number]),
  );
  const fills = [1, 3, 5, 7].flatMap((bar) =>
    [0.5, 1, 1.5].map((o, j) => [72 + j * 2, bar * 4 + o] as [number, number]),
  );
  await playBeats(page, [...head, ...fills]);
  await expect(page.getByTestId("results-metric")).toHaveText("100%", { timeout: 25_000 });
  await expect(page.getByTestId("jam-graded")).toContainText("4 of 4 rests filled");
});

test("Jam says a melody game needs a tune with its melody", async ({ page }) => {
  await setUp(page);
  await page.goto("/music/changes/jam?progression=ii-v-i&game=quote&choruses=1");
  await pickMode(page, "Check");
  await expect(page.getByText(/Quote the head needs a tune with its melody/).first()).toBeVisible();
});

/** Practice shows each voicing on the keys: play what is shown, `count` chords in turn. */
async function playShown(page: Page, count: number) {
  for (let i = 0; i < count; i++) {
    const keys = page.locator(".piano [data-target]");
    await expect(keys.first()).toBeVisible();
    const notes = (
      await keys.evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-midi"))))
    ).sort((a, b) => a - b);
    await page.evaluate(
      ({ notes, port }) => {
        const midi = (window as any).__midi;
        for (const n of notes) midi.send(port, [0x90, n, 96]);
        setTimeout(() => notes.forEach((n) => midi.send(port, [0x80, n, 0])), 250);
      },
      { notes, port: PORTS.keys.id },
    );
    await page.waitForTimeout(800);
  }
}

for (const [variant, label] of [
  ["quartal-tune", "Quartal on a tune"],
  ["slash-tune", "Slash chords on a tune"],
] as const)
  test(`voicings: ${label.toLowerCase()}, Maiden Voyage's changes`, async ({ page }) => {
    test.setTimeout(60_000);
    await setUp(page);
    await page.goto(`/music/changes/voicings?variant=${variant}&tune=tune-maiden-voyage`);
    await expect(page.getByText("Setup:").locator("..")).toContainText(`${label}: Maiden Voyage`);
    await startDrill(page);
    // D7sus4, F7sus4, Eb7sus4, Dbm7.
    await playShown(page, 4);
    await expect(page.getByRole("status")).toContainText("All 4 chords right.", {
      timeout: 8000,
    });
    const run = await lastRun(page);
    expect(run.params).toMatchObject({ variant, tune: "tune-maiden-voyage" });
  });

test("guitar shells: G7 as 1-3-7 with the root on string 6, built by taps", async ({ page }) => {
  await page.routeWebSocket(/.*/, () => {});
  await page.goto("/music/chords?mode=build&shape=shell.guitar.7.7&position=0&instrument=guitar");
  await expect(page.getByText("Setup:").locator("..")).toContainText("1-3-7, root on 6");
  await pickMode(page, "Practice");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.evaluate(async () => {
    for (const [s, f] of [
      [6, 3],
      [5, 2],
      [4, 3],
    ]) {
      const el = document.querySelector(`button[aria-label^="String ${s} fret ${f},"]`)!;
      const o = { bubbles: true, pointerId: 9, button: 0 };
      el.dispatchEvent(new PointerEvent("pointerdown", o));
      await new Promise((r) => setTimeout(r, 40));
      el.dispatchEvent(new PointerEvent("pointerup", o));
      await new Promise((r) => setTimeout(r, 20));
    }
  });
  await expect(page.getByRole("article").getByText(/All 3 target notes of G7 matched/)).toBeVisible(
    { timeout: 5000 },
  );
});
