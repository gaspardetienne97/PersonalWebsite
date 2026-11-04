// Reading levels past Grade 6 (triplets, clef changes, 7/8, jazz lines), tapping
// a phrase's rhythm, generated charts and jazz lead sheets in Accompaniment, the
// new Scales options and the gospel Voicings, over fake MIDI.
import { expect, test, type Page } from "@playwright/test";
import { installFakeMidi, muteHmr, PORTS, startDrill } from "./fixtures";

async function enableMidi(page: Page, url: string, countIn = false) {
  await page.goto(url);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForLoadState("networkidle");
  // The dev server can reload once while it optimises dependencies; retry past that.
  for (let i = 0; ; i++) {
    try {
      await seed(page, countIn);
      break;
    } catch (e) {
      if (i >= 3) throw e;
      await page.waitForLoadState("networkidle");
    }
  }
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

function seed(page: Page, countIn: boolean) {
  return page.evaluate(
    (countIn) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("woodshed");
        open.onsuccess = () => {
          const tx = open.result.transaction("settings", "readwrite");
          const store = tx.objectStore("settings");
          const get = store.get("music.settings");
          get.onsuccess = () => {
            const value = {
              ...get.result?.value,
              midiEnabledBefore: true,
              ...(countIn ? {} : { countInBars: 0 }),
              activeInstrument: "piano",
              bpm: 80,
            };
            store.put({ id: "music.settings", value });
          };
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
        open.onerror = () => reject(open.error);
      }),
    countIn,
  );
}

/** Play notes on the fake keyboard on a schedule inside the page, from the drill's "Go.". */
function playOnGo(page: Page, steps: { at: number; notes: number[]; hold?: number }[]) {
  return page.evaluate(
    ({ steps, port }) =>
      new Promise<void>((resolve) => {
        const midi = (window as any).__midi;
        const status = document.querySelector('[role="status"]')!;
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
        const obs = new MutationObserver(() => {
          if (status.textContent?.trim() === "Go.") {
            obs.disconnect();
            run();
          }
        });
        obs.observe(status, { childList: true, characterData: true, subtree: true });
      }),
    { steps, port: PORTS.keys.id },
  );
}

test.describe("sight-reading past Grade 6", () => {
  test("tap the rhythm: every onset tapped on time reads and plays in time", async ({ page }) => {
    test.setTimeout(60_000);
    await installFakeMidi(page, [PORTS.keys]);
    await enableMidi(
      page,
      "/music/reading?activity=sight-reading&follower=tap&level=line-4&measures=1&meter=simple&climb=false",
    );
    await muteHmr(page);
    await expect(page.getByText("Setup:").locator("..")).toContainText("tapping the rhythm");
    await page.getByRole("button", { name: "Practice", exact: true }).click();
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(page.getByRole("button", { name: "Tap", exact: true })).toBeEnabled();
    const paper = page.locator(".paper-wrap[data-onsets]");
    await expect(paper).toHaveAttribute("data-downbeat", /^\d+$/, { timeout: 10_000 });
    // Each onset stamped with its exact time, sent a little early (lessons 7: stamped fake MIDI).
    await page.evaluate((port) => {
      const el = document.querySelector<HTMLElement>(".paper-wrap[data-onsets]")!;
      const down = Number(el.dataset.downbeat);
      const beat = Number(el.dataset.beatMs);
      const midi = (window as any).__midi;
      for (const o of el.dataset.onsets!.split(",").map(Number)) {
        const at = down + o * beat;
        setTimeout(
          () => midi.send(port, [0x90, 40 + Math.round(o * 4), 90], at),
          Math.max(0, at - performance.now() - 80),
        );
        setTimeout(
          () => midi.send(port, [0x80, 40 + Math.round(o * 4), 0]),
          Math.max(0, at - performance.now() + 100),
        );
      }
    }, PORTS.keys.id);
    await expect(page.getByRole("status")).toContainText("Read and played in time", {
      timeout: 15_000,
    });
  });

  test("Piano 9 engraves 7/8 with the left hand moving into the treble clef, phrase after phrase", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto(
      "/music/reading?activity=sight-reading&level=piano-9&clefs=treble,bass&meter=7%2F8&measures=16&key=B%20major&climb=false&follower=performance",
    );
    await expect(page.getByText("Setup:").locator("..")).toContainText("Piano 9");
    await expect(page.getByText("Setup:").locator("..")).toContainText("16 bars of 7/8");
    let clefChanges = 0;
    // A clef change turns up in roughly one phrase in four: check at least 8 phrases, and up to
    // 20 until one does, so chance alone does not fail the run.
    for (let i = 0; i < 20 && (i < 8 || clefChanges === 0); i++) {
      const svg = page.locator(".paper-wrap svg").first();
      await expect(svg).toBeVisible({ timeout: 10_000 });
      // Engraving lands a beat after the phrase changes; count once the clefs stop changing.
      let last = -1;
      await expect
        .poll(
          async () => {
            const now = await page.locator(".paper-wrap .vf-clef").count();
            const settled = now > 0 && now === last;
            last = now;
            return settled;
          },
          { intervals: [150, 150, 250, 400] },
        )
        .toBe(true);
      await expect(page.getByText(/can't draw this score/)).toHaveCount(0);
      // Two clefs open each system; a small one in a later bar is a clef change.
      const clefs = await page.locator(".paper-wrap .vf-clef").count();
      const systems = await page.locator(".paper-wrap .vf-stave").count();
      if (clefs > 0 && clefs > (await page.locator(".paper-wrap .vf-keysignature").count()))
        clefChanges++;
      expect(systems).toBeGreaterThan(0);
      await page.getByRole("button", { name: "New phrase" }).click();
    }
    expect(clefChanges).toBeGreaterThan(0);
  });

  test("triplets engrave at Line 6, and jazz lines say they swing", async ({ page }) => {
    await page.goto(
      "/music/reading?activity=sight-reading&level=line-6&measures=8&meter=simple&climb=false&follower=performance&clefs=treble",
    );
    let tuplets = 0;
    for (let i = 0; i < 6 && !tuplets; i++) {
      await expect(page.locator(".paper-wrap svg").first()).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(/can't draw this score/)).toHaveCount(0);
      tuplets = await page.locator(".paper-wrap .vf-tuplet").count();
      await page.getByRole("button", { name: "New phrase" }).click();
    }
    expect(tuplets).toBeGreaterThan(0);
    await page.goto(
      "/music/reading?activity=sight-reading&level=line-jazz&key=F%20major&follower=performance&climb=false&clefs=treble",
    );
    await expect(page.getByText("Setup:").locator("..")).toContainText("swung");
  });
});

test.describe("accompaniment: charts and jazz heads", () => {
  test("a generated chart reads with slashes, and New chart draws another", async ({ page }) => {
    await page.goto("/music/accompany?mode=patterns&progression=chart-2&pattern=block-1-3");
    const chart = page.getByRole("list", { name: "The chart" });
    await expect(chart).toBeVisible();
    await expect(chart.locator(".slashes").first()).toBeVisible();
    const first = await chart.textContent();
    await page.getByRole("button", { name: "New chart" }).click();
    await expect.poll(() => chart.textContent()).not.toBe(first);
  });

  test("a jazz head with a rootless left hand: voicings around middle C, the melody above", async ({
    page,
  }) => {
    await page.goto("/music/accompany?mode=lead-sheet&tune=lead-2&lh=rootless&progression=ii-v-i");
    await expect(page.getByText("Setup:").locator("..")).toContainText(
      "jazz lead sheet 2 over ii-V-I",
    );
    await expect(page.getByText("Setup:").locator("..")).toContainText("left-hand rootless");
    const slots: [number, number[]][] = JSON.parse(
      (await page.getByTestId("accompany").getAttribute("data-slots")) ?? "[]",
    );
    const left = slots.filter(([, m]) => m.length === 4);
    expect(left.length).toBeGreaterThan(4);
    const melodyLow = Math.min(...slots.filter(([, m]) => m.length === 1).flatMap(([, m]) => m));
    expect(left.every(([, m]) => Math.min(...m) >= 47 && Math.max(...m) < melodyLow)).toBe(true);
  });
});

test.describe("scales and voicings options", () => {
  test("scales: contrary motion from a unison C, one octave up", async ({ page }) => {
    await installFakeMidi(page, [PORTS.keys]);
    await enableMidi(
      page,
      "/music/scales?pattern=scale&kind=major&tonic=60&span=one-octave&motion=up&hands=both&apart=contrary&perBeat=1&grade=&bpm=60",
      true,
    );
    await muteHmr(page);
    await expect(page.getByText("Setup:").locator("..")).toContainText(
      "hands together, contrary motion",
    );
    const rh = [60, 62, 64, 65, 67, 69, 71, 72];
    const lh = [60, 59, 57, 55, 53, 52, 50, 48];
    await page.getByRole("button", { name: "Practice", exact: true }).click();
    const playing = playOnGo(
      page,
      rh.map((m, i) => ({ at: i * 1000, notes: i === 0 ? [m] : [lh[i], m], hold: 500 })),
    );
    await page.getByRole("button", { name: /^(Start|Again)/ }).click();
    await playing;
    const results = page.getByRole("article");
    await expect(results.getByText("Notes right")).toBeVisible({ timeout: 8000 });
    // The unison C is one key under both thumbs: 15 notes in 8 steps.
    await expect(results.getByText("15 of 15", { exact: true })).toBeVisible();
  });

  test("voicings: gospel slash chords in C, the bass after the slash in the left hand", async ({
    page,
  }) => {
    await installFakeMidi(page, [PORTS.keys]);
    await enableMidi(
      page,
      "/music/voicings?variant=gospel&progression=slash-walk&key=0&keys=1&strict=1",
    );
    await muteHmr(page);
    await startDrill(page);
    await expect(page.getByRole("status")).toContainText("Play C.");
    const chords = [
      [48, 60, 64, 67], // C
      [47, 59, 62, 67], // G/B
      [45, 60, 64, 69], // Am
      [43, 60, 64, 69], // Am/G
      [41, 60, 65, 69], // F
      [52, 60, 64, 67], // C/E
      [50, 60, 65, 69], // Dm7
      [43, 59, 62, 67], // G
    ];
    await page.evaluate(
      ({ chords, port }) => {
        const midi = (window as any).__midi;
        chords.forEach((notes: number[], i: number) =>
          setTimeout(() => {
            for (const n of notes) midi.send(port, [0x90, n, 96]);
            setTimeout(() => {
              for (const n of notes) midi.send(port, [0x80, n, 0]);
            }, 400);
          }, i * 1100),
        );
      },
      { chords, port: PORTS.keys.id },
    );
    await expect(page.getByRole("status")).toContainText("All 8 chords right.", {
      timeout: 15_000,
    });
  });
});
