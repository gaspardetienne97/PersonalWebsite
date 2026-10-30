// Jazz piano vocabulary: the voicing types in Voicings, the new lick
// categories, the 1-2-3-5 pattern in Chord scales and triad pairs in Scales,
// each run start to results over a fake Web MIDI keyboard.
import { expect, test, type Page } from "@playwright/test";
import { PORTS, expectNoHorizontalOverflow, installFakeMidi, startDrill } from "./fixtures";

async function seed(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("woodshed");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction("settings", "readwrite");
          const store = tx.objectStore("settings");
          const get = store.get("music.settings");
          get.onsuccess = () =>
            store.put({
              id: "music.settings",
              value: { ...get.result?.value, midiEnabledBefore: true, activeInstrument: "piano" },
            });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
}

type Step = { at: number; notes: number[]; hold?: number };
/** Notes on the fake keyboard, scheduled in the page and stamped with their planned time; with `onGo`, from the drill's "Go.". */
function play(page: Page, steps: Step[], onGo = false) {
  return page.evaluate(
    ({ steps, port, onGo }) =>
      new Promise<void>((resolve) => {
        const midi = (window as any).__midi;
        const run = () => {
          const t0 = performance.now();
          let left = steps.length;
          for (const s of steps) {
            // Sent 60 ms early, stamped with the planned time: busy machines stay on the beat.
            setTimeout(
              () => {
                for (const n of s.notes) midi.send(port, [0x90, n, 96], t0 + s.at);
              },
              Math.max(0, s.at - 60),
            );
            setTimeout(
              () => {
                for (const n of s.notes) midi.send(port, [0x80, n, 0]);
                if (--left === 0) resolve();
              },
              s.at + (s.hold ?? 120),
            );
          }
        };
        if (!onGo) return run();
        const status = document.querySelector('[role="status"]')!;
        const obs = new MutationObserver(() => {
          if (status.textContent?.trim() === "Go.") {
            obs.disconnect();
            run();
          }
        });
        obs.observe(status, { childList: true, characterData: true, subtree: true });
      }),
    { steps, port: PORTS.keys.id, onGo },
  );
}

async function runTimed(page: Page, steps: Step[]) {
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  const playing = play(page, steps, true);
  await page.getByRole("button", { name: /^(Start|Again)/ }).click();
  await playing;
}

/** A chord a second, each held 400 ms. */
const chords = (list: number[][]) => list.map((notes, i) => ({ at: i * 1000, notes, hold: 400 }));

/** Practice shows each voicing on the keys: play what is shown, `count` chords in turn. */
async function playShown(page: Page, count: number) {
  for (let i = 0; i < count; i++) {
    const keys = page.locator(".piano [data-target]");
    await expect(keys.first()).toBeVisible();
    const notes = (
      await keys.evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-midi"))))
    ).sort((a, b) => a - b);
    await play(page, [{ at: 0, notes, hold: 250 }]);
    await page.waitForTimeout(600);
  }
}

test.beforeEach(async ({ page }) => {
  await page.routeWebSocket(/.*/, () => {});
  await installFakeMidi(page, [PORTS.keys]);
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto("/music");
  await page.waitForLoadState("networkidle");
  for (let i = 0; ; i++) {
    try {
      await seed(page);
      break;
    } catch (e) {
      if (i >= 3) throw e;
      await page.waitForLoadState("networkidle");
    }
  }
});

test("voicings: drop-2 through a ii-V-I, and the wrong order named in Check", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/music/voicings?variant=drop2&key=0&keys=1");
  await expect(page.getByRole("button", { name: "Jazz types" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByText("Setup:").locator("..")).toContainText("Drop-2 from C");
  await startDrill(page);
  await expect(page.getByRole("status")).toContainText("Play Dm7 (D).");
  await playShown(page, 12);
  await expect(page.getByRole("status")).toContainText("All 12 chords right.", { timeout: 8000 });

  // Check: the close shape for a drop-2 chord has the wrong bottom note.
  await startDrill(page, "Check");
  await expect(page.getByText("Dm7 with D on top, drop-2.")).toBeVisible();
  // 4-way close: F A C D.
  await play(page, chords([[65, 69, 72, 74]]));
  await expect(page.getByText("✕ wrong note at the bottom")).toBeVisible({ timeout: 5000 });
});

test("voicings: So What up D dorian, the type picked from the Jazz types tab", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/music/voicings?variant=major&key=2&keys=1");
  // A long exercise row keeps its first few; the rest sit behind More exercises.
  await page.getByRole("button", { name: "More exercises" }).click();
  await page.getByRole("button", { name: "Jazz types" }).click();
  await page.getByTestId("setup-line").getByRole("button").first().click();
  await page.getByRole("button", { name: "So What", exact: true }).click();
  await expect(page.getByText("Setup:").locator("..")).toContainText("So What from D dorian");
  await expectNoHorizontalOverflow(page);
  await startDrill(page);
  await playShown(page, 15);
  await expect(page.getByRole("status")).toContainText("All 15 chords right.", { timeout: 8000 });
});

test("voicings: upper structures on the jazz blues' dominants", async ({ page }) => {
  await page.goto("/music/voicings?variant=upper&tune=tune-jazz-blues");
  await expect(page.getByText("Setup:").locator("..")).toContainText(
    "Upper structures on a tune: Jazz blues in F",
  );
  await startDrill(page);
  // F7, Bb7, D7 and C7, each once.
  await playShown(page, 4);
  await expect(page.getByRole("status")).toContainText("All 4 chords right.", { timeout: 8000 });
});

test("licks: an enclosure into the 3rd, in order", async ({ page }) => {
  await page.goto("/music/licks?lick=101&key=C&bpm=120");
  await expect(
    page.getByText("Into the 3rd of Cmaj7: F above, D# below, then E on the downbeat."),
  ).toBeVisible();
  const line = [74, 71, 67, 69, 71, 74, 77, 75, 76];
  await runTimed(
    page,
    line.map((m, i) => ({ at: i * 250, notes: [m], hold: 150 })),
  );
  await expect(page.getByRole("status")).toContainText("9 of 9 in order", { timeout: 5000 });
});

test("licks: Giant Steps changes two to a bar on the lane", async ({ page }) => {
  await page.goto("/music/licks?lick=114&key=C");
  await expect(page.getByText("Lick 114, Coltrane 1-2-3-5")).toBeVisible();
  await expect(page.getByText("Bmaj7 D7 Gmaj7 Bb7").first()).toBeVisible();
});

test("chord scales: 1-2-3-5 up and back through a ii-V-I", async ({ page }) => {
  await page.goto("/music/chord-scales?changes=major&key=C&pattern=1235&keys=1&bpm=120");
  await expect(page.getByText("Setup:").locator("..")).toContainText(
    "1-2-3-5 up and back on each chord",
  );
  const line = [
    62, 64, 65, 69, 69, 65, 64, 62, 67, 69, 71, 74, 74, 71, 69, 67, 60, 62, 64, 67, 67, 64, 62, 60,
  ];
  await runTimed(
    page,
    line.map((m, i) => ({ at: i * 250, notes: [m], hold: 150 })),
  );
  await expect(page.getByRole("status")).toContainText("24 of 24 in order", { timeout: 8000 });
});

test("scales: Eb and F triad pairs, up", async ({ page }) => {
  await page.goto(
    "/music/scales?pattern=triad-pairs&chord=major&tonic=63&span=one-octave&motion=up&hands=right&perBeat=1&grade=&bpm=100",
  );
  await expect(page.getByText("Setup:").locator("..")).toContainText("Eb and F major triad pairs");
  const line = [63, 67, 70, 65, 69, 72, 75];
  await runTimed(
    page,
    line.map((m, i) => ({ at: i * 600, notes: [m], hold: 300 })),
  );
  await expect(page.getByRole("status")).toContainText("Clean at 100 BPM", { timeout: 8000 });
});
