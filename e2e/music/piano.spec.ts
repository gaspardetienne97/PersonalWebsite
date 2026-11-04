// Piano and jazz drills: every route loads without sideways scroll, and each
// drill runs start to results over a fake Web MIDI keyboard.
import { expect, test, type Page } from "@playwright/test";
import { PORTS, expectNoHorizontalOverflow, installFakeMidi, startDrill } from "./fixtures";

const SHOTS = "docs/screenshots/rebuild/piano";
const ROUTES = [
  {
    path: "/music/two-hand?pattern=contrary-five&hand=both&tonic=C4&bpm=60",
    name: "two-hand",
    h1: "Two hands",
  },
  { path: "/music/comping?pattern=blue-third-c7&bpm=90", name: "comping", h1: "Comping" },
  { path: "/music/pedal?progression=I-vi-IV-V&key=0", name: "pedal", h1: "Pedal" },
  { path: "/music/voicings?variant=major&key=0&keys=1", name: "voicings", h1: "Voicings" },
  {
    path: "/music/voicings?variant=inversions&key=0",
    name: "voicings-closest",
    h1: "Voicings",
  },
  { path: "/music/licks?lick=1&key=C", name: "licks", h1: "Jazz licks" },
  { path: "/music/licks?lick=30&instrument=guitar&bpm=96", name: "licks-guitar", h1: "Jazz licks" },
  { path: "/music/chord-scales?changes=major&key=C", name: "chord-scales", h1: "Chord scales" },
];

/** Remember MIDI as enabled (as the Connect page would), so the app re-opens it on load. */
async function enableMidi(page: Page) {
  await page.goto("/music");
  await page.waitForLoadState("networkidle");
  // The dev server can reload once while it optimises dependencies; retry past that.
  for (let i = 0; ; i++) {
    try {
      await seed(page);
      return;
    } catch (e) {
      if (i >= 3) throw e;
      await page.waitForLoadState("networkidle");
    }
  }
}

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
              value: {
                ...get.result?.value,
                midiEnabledBefore: true,
                activeInstrument: "piano",
              },
            });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
}

type Step = { at: number; notes: number[]; hold?: number };
/**
 * Play notes on the fake keyboard on a schedule, inside the page (no round-trip
 * jitter). With `onGo`, the schedule starts the moment the drill's status says
 * "Go." (set on the downbeat), so timing-graded drills see beat-accurate input.
 */
function play(page: Page, steps: Step[], onGo = false) {
  return page.evaluate(
    ({ steps, port, onGo }) =>
      new Promise<void>((resolve) => {
        const midi = (window as any).__midi;
        const run = () => {
          let left = steps.length;
          for (const s of steps)
            setTimeout(() => {
              for (const n of s.notes) midi.send(port, [0x90, n, 96]);
              setTimeout(() => {
                for (const n of s.notes) midi.send(port, [0x80, n, 0]);
                if (--left === 0) resolve();
              }, s.hold ?? 120);
            }, s.at);
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

/** Start in Practice and play `steps` from the downbeat. */
async function runTimed(page: Page, steps: Step[]) {
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  const playing = play(page, steps, true);
  await page.getByRole("button", { name: /^(Start|Again)/ }).click();
  await playing;
}

async function shoot(page: Page, name: string) {
  const w = page.viewportSize()!.width;
  await page.screenshot({ path: `${SHOTS}/${name}-${w}-light.png`, fullPage: true });
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.screenshot({ path: `${SHOTS}/${name}-${w}-dark.png`, fullPage: true });
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
}

for (const width of [375, 1280]) {
  test(`piano routes load at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const r of ROUTES) {
      await page.goto(r.path);
      await expect(page.getByRole("heading", { level: 1, name: r.h1 })).toBeVisible();
      await expect(page).toHaveTitle(/\| Woodshed$/);
      await expectNoHorizontalOverflow(page);
      await shoot(page, r.name);
    }
  });
}

// Other work on a shared dev server triggers full HMR reloads mid-run; a silent
// socket keeps this page still (a production build has no socket at all).
test.beforeEach(async ({ page }) => {
  await page.routeWebSocket(/.*/, () => {});
});

test("two hands: the demo lights both hands in step with the lane", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto("/music/two-hand?pattern=contrary-five&hand=both&tonic=C4&bpm=60");
  await page.getByRole("button", { name: "Hear it", exact: true }).click();
  await expect(page.getByText("Listening, not scored.")).toBeVisible();
  await page.waitForTimeout(1300);
  await shoot(page, "two-hand-demo");
  await page.getByRole("button", { name: "Stop demo" }).click();
});

test("falling notes: two hands, scales, licks and accompaniment fall onto the keys", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto("/music/two-hand?pattern=contrary-five&hand=both&tonic=C4&bpm=60");
  await page
    .getByRole("navigation", { name: "Notes view" })
    .getByRole("link", { name: "Falling notes" })
    .click();
  await expect(page).toHaveURL(/view=falling/);
  const falling = page.getByTestId("falling-notes");
  await expect(falling.locator(".note.left").first()).toBeVisible();
  await expect(falling.locator(".note.right").first()).toBeVisible();
  await page.getByRole("button", { name: "Hear it", exact: true }).click();
  // Keys light in their hand's colour as the bars reach them.
  await expect(falling.locator("[data-demo][data-role=left]").first()).toBeVisible({
    timeout: 5000,
  });
  await page.waitForTimeout(600);
  await shoot(page, "two-hand-falling");
  await page.getByRole("button", { name: "Stop demo" }).click();
  await page.reload();
  await expect(page.getByTestId("falling-notes")).toBeVisible();

  // Scales carry their fingering onto the bars.
  await page.goto(
    "/music/scales?pattern=scale&kind=major&tonic=60&span=one-octave&motion=up&hands=right&perBeat=1&grade=&view=falling",
  );
  await falling.getByRole("button", { name: "Fingers" }).click();
  await expect(falling.locator(".note").first()).toHaveText("1");
  await falling.getByRole("button", { name: "Plain" }).click();

  for (const path of ["/music/licks?lick=1&key=C&view=falling", "/music/accompany?view=falling"]) {
    await page.goto(path);
    await expect(falling.locator(".note").first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
  // Check mode hides the notes, so there is nothing to switch.
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await expect(page.getByTestId("falling-notes")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Notes view" })).toHaveCount(0);
});

test("licks: Check hides the targets and the lane notes", async ({ page }) => {
  await page.goto("/music/licks?lick=1&key=C");
  await expect(page.locator(".piano [data-target]")).toHaveCount(1);
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await expect(page.locator(".piano [data-target]")).toHaveCount(0);
  await expect(page.getByText("Check mode: the notes are hidden.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Hear it", exact: true })).toHaveCount(0);
});

test.describe("piano drills over fake MIDI", () => {
  test.beforeEach(async ({ page }) => {
    await installFakeMidi(page, [PORTS.keys]);
    await page.setViewportSize({ width: 1280, height: 1000 });
    await enableMidi(page);
  });

  test("two hands: Mirror hands measures together", async ({ page }) => {
    await page.goto("/music/two-hand?pattern=contrary-five&hand=both&tonic=C4&bpm=60");
    await expect(page.getByText("Both thumbs on C")).toBeVisible();
    const rh = [60, 62, 64, 65, 67, 65, 64, 62];
    const lh = [48, 47, 45, 43, 41, 43, 45, 47];
    // Both hands in one message burst: well inside 40 ms.
    await runTimed(
      page,
      rh.map((m, i) => ({ at: i * 1000, notes: [lh[i], m], hold: 500 })),
    );
    await expect(page.getByText("Hands together (40 ms)")).toBeVisible({ timeout: 8000 });
    await expect(page.getByText("8 of 8 beats", { exact: true })).toBeVisible();
    await expect(page.getByRole("status")).toContainText("struck together on 8 of 8 beats");
    await shoot(page, "two-hand-results");
  });

  test("scales: blocked chords through the inversions, notes struck together", async ({ page }) => {
    await page.goto(
      "/music/scales?pattern=blocked&chord=major&tonic=60&span=one-octave&motion=up&hands=right&perBeat=1&grade=&bpm=60",
    );
    await expect(page.getByText("Setup:").locator("..")).toContainText("C major blocked chords");
    const chords = [
      [60, 64, 67],
      [64, 67, 72],
      [67, 72, 76],
      [72, 76, 79],
    ];
    await runTimed(
      page,
      chords.map((notes, i) => ({ at: i * 1000, notes, hold: 600 })),
    );
    await expect(page.getByText("Chord notes together (40 ms)")).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/^4 of 4, \d+ ms apart on average$/)).toBeVisible();
    await shoot(page, "scales-blocked-results");
  });

  test("scales: an arpeggio at the ABRSM Grade 1 speed, two notes a click", async ({ page }) => {
    await page.goto(
      "/music/scales?pattern=arpeggio&chord=major&tonic=60&span=one-octave&motion=up&hands=right&perBeat=2&grade=Grade%201&bpm=58",
    );
    await expect(page.getByText("Setup:").locator("..")).toContainText("two notes a click");
    const step = 60000 / 58 / 2;
    await runTimed(
      page,
      [60, 64, 67, 72].map((n, i) => ({ at: Math.round(i * step), notes: [n], hold: 200 })),
    );
    await expect(page.getByRole("status")).toContainText("Clean and even at Grade 1 speed.", {
      timeout: 8000,
    });
    await expect(page.getByText("Grade 1 speed (ABRSM, 58 with two notes a click)")).toBeVisible();
  });

  test("pedal: four chords, each change lifted just after the chord and pressed again", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto("/music/pedal?progression=I-IV-V-I&key=0&rounds=1&bpm=60");
    await expect(page.getByText("Setup:").locator("..")).toContainText("I IV V I in C, 4 chords");
    const chords = [
      [48, 60, 64, 67], // C
      [41, 60, 65, 69], // F: C F A
      [43, 59, 62, 67], // G: B D G
      [48, 60, 64, 67], // C
    ];
    await page.getByRole("button", { name: "Practice", exact: true }).click();
    // From "Go.": a chord every bar (4 s at 60 BPM), the pedal down after the first,
    // then up 80 ms after each new chord and down again 120 ms later.
    const going = page.evaluate(
      ({ chords, port }) =>
        new Promise<void>((resolve) => {
          const midi = (window as any).__midi;
          const status = document.querySelector('[role="status"]')!;
          const run = () => {
            chords.forEach((notes, k) => {
              const at = k * 4000;
              setTimeout(() => notes.forEach((n) => midi.send(port, [0x90, n, 90])), at);
              setTimeout(() => notes.forEach((n) => midi.send(port, [0x80, n, 0])), at + 3500);
              if (k === 0) setTimeout(() => midi.send(port, [0xb0, 64, 127]), at + 150);
              else {
                setTimeout(() => midi.send(port, [0xb0, 64, 0]), at + 80);
                setTimeout(() => midi.send(port, [0xb0, 64, 127]), at + 200);
              }
            });
            setTimeout(resolve, chords.length * 4000);
          };
          const obs = new MutationObserver(() => {
            if (status.textContent?.trim() === "Go.") {
              obs.disconnect();
              run();
            }
          });
          obs.observe(status, { childList: true, characterData: true, subtree: true });
        }),
      { chords, port: PORTS.keys.id },
    );
    await page.getByRole("button", { name: /^Start/ }).click();
    await going;
    await expect(page.getByRole("status")).toContainText("Every change clean", { timeout: 10_000 });
    await expect(page.getByText("4 of 4", { exact: true }).first()).toBeVisible();
    await shoot(page, "pedal-results");
  });

  test("voicings: one major ii-V-I", async ({ page }) => {
    await page.goto("/music/voicings?variant=major&key=0&keys=1&strict=1");
    await startDrill(page);
    await expect(page.getByRole("status")).toContainText("Play Dm7");
    const chords = [
      [62, 65, 69, 72, 76], // Dm7, root + rootless A
      [67, 77, 81, 83, 86], // G7, root + rootless B
      [60, 64, 67, 71, 74], // Cmaj7, root + rootless A
    ];
    await play(
      page,
      chords.map((notes, i) => ({ at: i * 1100, notes, hold: 400 })),
    );
    await expect(page.getByRole("status")).toContainText("All 3 chords right.", { timeout: 5000 });
    await expect(
      page.getByText("graded on the chord while all its notes were held down together"),
    ).toBeVisible();
    await shoot(page, "voicings-results");
  });

  test("voicings: the I IV I V7 I cadence in C", async ({ page }) => {
    await page.goto("/music/voicings?variant=cadence&key=0&keys=1&strict=1");
    await startDrill(page);
    await expect(page.getByRole("status")).toContainText("Play C.");
    const chords = [
      [48, 60, 64, 67], // C: C3, then C E G
      [41, 60, 65, 69], // F: F2, then C F A
      [48, 60, 64, 67],
      [43, 59, 65, 67], // G7: G2, then B F G
      [48, 60, 64, 67],
    ];
    await play(
      page,
      chords.map((notes, i) => ({ at: i * 1100, notes, hold: 400 })),
    );
    await expect(page.getByRole("status")).toContainText("All 5 chords right.", { timeout: 8000 });
    await shoot(page, "voicings-cadence-results");
  });

  test("licks: lick 1 in order", async ({ page }) => {
    await page.goto("/music/licks?lick=1&key=C&bpm=120");
    await expect(page.getByText("Solo using only the 1 3 5 7 of each chord.")).toBeVisible();
    const line = [
      62, 65, 69, 72, 69, 65, 62, 65, 67, 71, 74, 77, 74, 71, 67, 71, 72, 71, 67, 64, 67, 72, 76,
    ];
    await runTimed(
      page,
      line.map((m, i) => ({ at: i * 250, notes: [m], hold: 150 })),
    );
    await expect(page.getByRole("status")).toContainText(/all 23 notes in order/i, {
      timeout: 5000,
    });
    await shoot(page, "licks-results");
  });

  test("chord scales: one chord's scale", async ({ page }) => {
    await page.goto("/music/chord-scales?changes=major&key=C&beats=4&bpm=120");
    await expect(page.getByText("Chord tone (filled, named R 3 5 7)")).toBeVisible();
    // D dorian over Dm7 only, then let G7 and Cmaj7 pass.
    await runTimed(
      page,
      [62, 64, 65, 67].map((m, i) => ({ at: i * 500, notes: [m], hold: 200 })),
    );
    await expect(page.getByRole("status")).toContainText("You played over 1 of 3 chords", {
      timeout: 8000,
    });
    await expect(page.getByText("2 chord, 2 scale, 0 outside")).toBeVisible();
    await shoot(page, "chord-scales-results");
  });

  test("comping: blue third over C7 with a Charleston left hand", async ({ page }) => {
    await page.goto("/music/comping?pattern=blue-third-c7&bpm=90");
    const beat = 60000 / 90;
    const lick: [number, number][] = [
      [67, 0],
      [70, 0.5],
      [72, 1],
      [70, 2],
      [67, 2.5],
      [64, 3],
      [63, 4],
      [64, 4.5],
      [67, 5],
      [60, 6],
    ];
    const comp = [0, 1.5, 4, 5.5];
    const steps: Step[] = [
      ...lick.map(([m, b]) => ({ at: b * beat, notes: [m], hold: 200 })),
      ...comp.map((b) => ({ at: b * beat + 3, notes: [48, 58], hold: 300 })),
    ].sort((a, b) => a.at - b.at);
    await runTimed(page, steps);
    await expect(page.getByRole("status")).toContainText(
      "The line and the Charleston both landed",
      { timeout: 8000 },
    );
    await expect(page.getByText("4 of 4", { exact: true })).toBeVisible();
    await shoot(page, "comping-results");
  });
});
