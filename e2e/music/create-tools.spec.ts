// Create (beat grid, sample kits, piano roll), Record, Tuner, Settings, Guide.
import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { encodeWav } from "../../packages/music-core/src/io/wav";
import {
  expectNoHorizontalOverflow,
  installFakeMidi,
  installSyntheticMic,
  midiNote,
  PORTS,
} from "./fixtures";

const SHOTS = "docs/screenshots/rebuild/create-tools";

async function shoot(page: Page, name: string) {
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
    await page.waitForTimeout(150);
    await expectNoHorizontalOverflow(page);
    for (const theme of ["light", "dark"] as const) {
      await page.evaluate(
        (dark) => document.documentElement.classList.toggle("dark", dark),
        theme === "dark",
      );
      await page.screenshot({ path: `${SHOTS}/${name}-${width}-${theme}.png`, fullPage: true });
    }
  }
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  await page.setViewportSize({ width: 1280, height: 900 });
}

/** A short decaying noise burst as WAV bytes. */
function wavSample(seconds = 0.2) {
  const sr = 44100;
  const data = new Float32Array(Math.round(sr * seconds));
  for (let i = 0; i < data.length; i++) data[i] = Math.sin(i / 3) * Math.exp(-i / 2000) * 0.8;
  return Buffer.from(encodeWav([data], sr));
}

// Other agents adding routes make Vite reload open pages; a mocked HMR socket
// keeps each test in one page load.
test.beforeEach(async ({ page }) => {
  await page.routeWebSocket(/\/\?token=|vite-hmr/, () => {});
});

test.describe("Create", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  test("beat grid: build a pattern, play it, load a sample, assign it, export the kit", async ({
    page,
  }) => {
    await page.goto("/music/create");
    await expect(page.getByRole("heading", { level: 1, name: "Create" })).toBeVisible();
    await page.getByRole("button", { name: "New", exact: true }).click();
    const kick = page.getByRole("button", { name: "Kick, step 1", exact: true });
    await kick.click();
    await expect(kick).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Snare, step 5", exact: true }).click();
    await page.getByRole("button", { name: "Hats, step 3", exact: true }).click();
    await expect(page.getByText("3 hits.")).toBeVisible();

    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Playing");
    // The playhead moves (lights follow the audio clock).
    await expect
      .poll(
        async () => Number(await page.locator("[data-playhead]").getAttribute("data-playhead")),
        { timeout: 10_000 },
      )
      .toBeGreaterThan(0);
    await page.getByRole("button", { name: "Stop", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Stopped.");

    // Import a generated WAV: "Kick_01" auto-maps to pad A01 (MIDI 36).
    await page
      .getByLabel("Import samples")
      .setInputFiles({ name: "Kick_01.wav", mimeType: "audio/wav", buffer: wavSample() });
    await expect(page.getByRole("status")).toContainText("Kick_01 on pad A01");
    await expect(page.getByRole("button", { name: "Pad A01, Kick_01" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Hear Kick_01" })).toBeVisible();

    // Assign it to another pad through that pad's native select, and through "Assign to pad".
    await page.getByLabel("Sample on pad A05").selectOption({ label: "Kick_01" });
    await expect(page.getByRole("status")).toContainText("Pad A05 plays Kick_01");
    await page.getByRole("button", { name: "Assign to pad" }).click();
    await page.getByRole("button", { name: /^Pad A09, empty/ }).click();
    await expect(page.getByRole("status")).toContainText("Kick_01 is on pad A09");
    await expect(page.getByText("On A01, A05, A09")).toBeVisible();

    // Rename in place; the pad and row follow.
    const nameField = page.getByLabel("Name of Kick_01.wav");
    await nameField.fill("Big kick");
    await nameField.press("Enter");
    await expect(page.getByRole("button", { name: "Pad A01, Big kick" })).toBeVisible();

    // Kit name -> <Kit>-mpc.zip
    const kitName = page.getByLabel("Kit name");
    await kitName.fill("Boom Bap");
    await kitName.press("Enter");
    const [dl] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download ZIP" }).click(),
    ]);
    expect(dl.suggestedFilename()).toBe("Boom-Bap-mpc.zip");

    // Survives a reload: pattern draft and kit.
    await page.waitForTimeout(500);
    await page.reload();
    await expect(page.getByRole("button", { name: "Pad A01, Big kick" })).toBeVisible();
    // The kick row now plays the sample and is named after it.
    await expect(
      page.getByRole("button", { name: "Big kick on A01, step 1", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await shoot(page, "create-beat");
  });

  test("piano roll: add notes, resize, export MIDI; tabs switch content", async ({ page }) => {
    await page.goto("/music/create");
    await expect(page.getByRole("button", { name: "Kick, step 1", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Piano roll" }).click();
    await expect(page).toHaveURL(/mode=roll/, { timeout: 10_000 });
    const grid = page.getByRole("application", { name: /Note grid/ });
    await expect(grid).toBeVisible();
    await expect(page.getByRole("button", { name: "Kick, step 1", exact: true })).toHaveCount(0);

    // Keyboard path: Enter adds at the cursor, arrows move, Shift+Right lengthens.
    await grid.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status")).toContainText("Added C4");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status")).toContainText("Added D4");
    await page.keyboard.press("Shift+ArrowRight");
    await expect(page.getByRole("status")).toContainText("D4 is 3 sixteenths long");
    // Pointer path: click a cell.
    const c4 = (await page.locator('.note[data-note="60"]').boundingBox())!;
    await page.mouse.click(c4.x + 22 * 6 + 4, c4.y + c4.height / 2);
    await expect(page.getByRole("status")).toContainText("Added");
    await expect(page.locator(".note[data-note]")).toHaveCount(3);

    // A second voice, then export.
    await page.getByRole("button", { name: "Add voice" }).click();
    await expect(page.getByRole("button", { name: /^Voice 2/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const [dl] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export MIDI" }).click(),
    ]);
    expect(dl.suggestedFilename()).toBe("Sketch.mid");
    await expect(page.getByRole("status")).toContainText("3 notes");

    await page.getByRole("button", { name: "Add bar" }).click();
    await expect(page.getByText("3 bars")).toBeVisible();

    // Back returns to the beat grid, reload keeps the tab.
    await page.goBack();
    await expect(page.getByRole("button", { name: "Kick, step 1", exact: true })).toBeVisible();
    await page.goForward();
    await page.reload();
    await expect(page.getByRole("application", { name: /Note grid/ })).toBeVisible();
    await shoot(page, "create-roll");
  });
});

test.describe("Record", () => {
  test("a MIDI take from fake MIDI survives a reload, plays, compares and exports", async ({
    page,
  }) => {
    await installFakeMidi(page, [PORTS.keys]);
    await page.goto("/music/record");
    await expect(page.getByRole("heading", { level: 1, name: "Record" })).toBeVisible();
    await page.getByRole("button", { name: "Enable MIDI" }).click();
    await expect(page.getByText("MIDI on: Digital Piano")).toBeVisible();

    // Warm-up: the first note after load arrives late while the page wakes up,
    // which would make take 1's rhythm uneven and the comparison meaningless.
    await midiNote(page, PORTS.keys.id, 72, 60, 1, 150);
    const rec = page.getByRole("button", { name: "Record", exact: true });
    for (const notes of [
      [60, 64, 67],
      [60, 64, 65],
    ]) {
      await rec.click();
      await expect(page.getByRole("status")).toContainText("Recording");
      for (const n of notes) await midiNote(page, PORTS.keys.id, n, 90, 1, 150);
      await page.getByRole("button", { name: "Stop", exact: true }).click();
      await expect(page.getByRole("status")).toContainText(/Saved Take \d: 3 notes/);
    }
    await page.reload();
    const take = page.locator("li[data-take]").first();
    await expect(take.getByLabel("Take name")).toHaveValue("Take 2");
    await expect(take).toContainText("3 notes");
    await expect(page.locator("li[data-take]")).toHaveCount(2);

    // Rename in place, then the take opens under its new name.
    await take.getByLabel("Take name").fill("Arpeggio");
    await take.getByLabel("Take name").press("Enter");
    await take.getByRole("button", { name: "Play Arpeggio" }).click();
    await expect(page.getByRole("status")).toContainText("Playing Arpeggio");
    await take.getByRole("button", { name: "Pause Arpeggio" }).click();
    await expect(page.getByRole("status")).toContainText("Paused Arpeggio");

    // Compare: two of three notes share pitch and position.
    await expect(page.getByRole("heading", { name: "Compare takes" })).toBeVisible();
    await expect(page.getByText("2 of 3 notes line up")).toBeVisible();

    const [dl] = await Promise.all([
      page.waitForEvent("download"),
      take.getByRole("button", { name: "Export MIDI" }).click(),
    ]);
    expect(dl.suggestedFilename()).toBe("Arpeggio.mid");
    await take.getByRole("button", { name: "Save to Song Studio" }).click();
    await expect(take.getByRole("link", { name: "Open in Song Studio" })).toBeVisible();
    await shoot(page, "record-midi");

    // Open in the piano roll: the take arrives as a new voice.
    await take.getByRole("link", { name: "Open in piano roll" }).click();
    await expect(page.getByRole("status")).toContainText("Opened Arpeggio as a new voice, 3 notes");
    await expect(page).not.toHaveURL(/take=/);
  });

  test("an audio take from the synthetic mic plays back at +6 dB", async ({ page }) => {
    await installSyntheticMic(page, 220);
    await page.goto("/music/record?source=mic");
    await expect(page.getByRole("heading", { level: 1, name: "Record" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Record", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Arm microphone" }).click();
    await expect(page.getByTestId("level-advice")).toContainText(
      /Good level|A little hot|Clipping|Quiet/,
      { timeout: 10_000 },
    );
    await page.getByRole("button", { name: "Record", exact: true }).click();
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: "Stop", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Saved Audio take 1");
    const take = page.locator("li[data-audio-take]").first();
    await expect(take).toBeVisible();

    const gain = take.getByRole("slider");
    await gain.fill("6");
    await gain.dispatchEvent("change");
    await expect(take).toContainText("+6 dB");
    await take.getByRole("button", { name: "Play Audio take 1" }).click();
    await expect(page.getByRole("status")).toContainText("Playing Audio take 1 at +6 dB");

    // Survives a reload with its gain.
    await page.reload();
    await expect(page.locator("li[data-audio-take]").first()).toContainText("+6 dB");
    await shoot(page, "record-mic");
  });
});

// ---------------------------------------------------------------------------
// Tuner

async function shots(page: Page, name: string) {
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: width === 375 ? 900 : 1000 });
    await expectNoHorizontalOverflow(page);
    for (const theme of ["light", "dark"] as const) {
      await page.evaluate(
        (dark) => document.documentElement.classList.toggle("dark", dark),
        theme === "dark",
      );
      await page.screenshot({ path: `${SHOTS}/${name}-${width}-${theme}.png`, fullPage: true });
    }
  }
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
}

test.describe("Tuner", () => {
  test.beforeEach(async ({ page }) => {
    await installSyntheticMic(page, 110);
  });

  test("tune reads A2, intonation shows stats, drone plays and stops", async ({ page }) => {
    await page.goto("/music/tuner");
    await expect(page.getByRole("heading", { level: 1, name: "Tuner" })).toBeVisible();

    // Tune: the synthetic 110 Hz sawtooth reads as A2.
    await page.getByRole("button", { name: "Start listening" }).click();
    await expect(page.getByTestId("tuner-note")).toHaveText("A2", { timeout: 10_000 });
    await expect(page.getByTestId("tuner-cents")).toContainText("in tune");
    await expect(page.getByText(/Hearing 110\.\d Hz, target 110\.0 Hz/)).toBeVisible();
    await expect(page.getByRole("status")).toContainText("A2 in tune");
    await shots(page, "tuner-tune");

    // A target note: the gauge measures against it, in the octave you're in.
    const targets = page.getByRole("group", { name: "Target note" });
    await targets.getByRole("button", { name: "C", exact: true }).click();
    await expect(page.getByTestId("tuner-cents")).toContainText("A, 3 semitones below");
    await expect(page.getByTestId("tuner-note")).toHaveText("C3");
    await targets.getByRole("button", { name: "A", exact: true }).click();
    await expect(page.getByTestId("tuner-cents")).toContainText("in tune");
    await shots(page, "tuner-target");
    await targets.getByRole("button", { name: "Any note" }).click();

    // Fretted instruments get the string strip; A2 is the fifth string.
    await page.getByLabel("Instrument").selectOption("guitar");
    await expect(page.getByLabel("Guitar tuning")).toBeVisible();
    await expect(page.getByRole("button", { name: /String 5, A2, nearest/ })).toBeVisible();
    await shots(page, "tuner-tune-guitar");

    // Intonation: same listening session, stats fill in.
    await page.getByRole("link", { name: "Intonation" }).click();
    await expect(page).toHaveURL(/mode=intonation/);
    const stats = page.getByTestId("intonation-stats");
    await expect(stats).toBeVisible({ timeout: 10_000 });
    for (const label of ["In tune", "Hold", "Steadiness", "Avg drift"])
      await expect(stats).toContainText(label);
    await expect(stats).toContainText(/In tune\s*100%/);
    await page.waitForTimeout(1500);
    await shots(page, "tuner-intonation");

    // Drone: no mic, no A4 control, one Play/Stop.
    await page.getByRole("link", { name: "Drone" }).click();
    await expect(page).toHaveURL(/mode=drone/);
    await expect(page.getByLabel("Reference A4")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Start listening" })).toHaveCount(0);
    await page.getByRole("button", { name: "Play drone" }).click();
    await expect(page.getByRole("button", { name: "Stop drone" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByRole("status")).toContainText("Drone on A3, sine");
    await expect(page.getByRole("img", { name: "Waveform of the drone on A3" })).toBeVisible();
    // Timbre explanations live on the buttons, not beside Play.
    await page.getByRole("button", { name: "Shruti" }).hover();
    await expect(
      page.getByText("Stacks the fifth and the octave, like a tanpura.").first(),
    ).toBeVisible();
    await page.getByRole("button", { name: "D, in the major scale" }).click();
    await expect(page.getByRole("status")).toContainText("Drone on D3");
    await expect(page.getByRole("button", { name: "D, tonic" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await shots(page, "tuner-drone");
    await page.getByRole("button", { name: "Stop drone" }).click();
    await expect(page.getByRole("status")).toContainText("Drone stopped");
    await expect(page.getByRole("button", { name: "Play drone" })).toBeVisible();

    // Back returns to Intonation, reload keeps it.
    await page.goBack();
    await expect(page).toHaveURL(/mode=intonation/);
    await expect(page.getByText("last 10 seconds, now at the right")).toBeVisible();
    await page.reload();
    await expect(page.getByText("last 10 seconds, now at the right")).toBeVisible();
    await page.getByRole("link", { name: "Tune", exact: true }).click();
    await expect(page).not.toHaveURL(/mode=/);
    await expect(page.getByText("last 10 seconds, now at the right")).toHaveCount(0);
    await expect(page.getByLabel("Reference A4")).toBeVisible();
  });

  test("the A4 reference changes the target", async ({ page }) => {
    await page.goto("/music/tuner");
    await page.getByLabel("Reference A4").selectOption("442");
    await page.getByRole("button", { name: "Start listening" }).click();
    // 110 Hz against A4 = 442 is A2 about 8 cents flat.
    await expect(page.getByTestId("tuner-cents")).toContainText(/−8 cents, flat, tune up/, {
      timeout: 10_000,
    });
    await expect(page.getByText(/target 110\.5 Hz/)).toBeVisible();
    await page.getByLabel("Reference A4").selectOption("440");
  });
});

// ---------------------------------------------------------------------------
// Settings and Guide

async function shootSettings(page: Page, name: string) {
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoHorizontalOverflow(page);
    for (const theme of ["light", "dark"] as const) {
      await page.evaluate(
        (dark) => document.documentElement.classList.toggle("dark", dark),
        theme === "dark",
      );
      await page.screenshot({ path: `${SHOTS}/${name}-${width}-${theme}.png`, fullPage: true });
    }
  }
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
}

/** Write a session straight into IndexedDB, as a finished practice would. */
async function seedSession(page: Page, id: string) {
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.evaluate(async (id) => {
    const open = () =>
      new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open("woodshed");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    // Dexie creates the stores on first use; wait for them.
    for (let i = 0; i < 50; i++) {
      const db = await open();
      if (db.objectStoreNames.contains("sessions")) {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction("sessions", "readwrite");
          tx.objectStore("sessions").put({
            id,
            startTime: Date.now(),
            endTime: Date.now() + 60000,
            source: "drill",
            runs: [],
            eventIds: [],
            xp: 12,
            tags: [],
          });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        db.close();
        return;
      }
      db.close();
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("the woodshed database never appeared");
  }, id);
}

// On a shared dev server other work regenerates routes and Vite reloads every
// open page; a mocked HMR socket keeps a 14 s calibration run in one page load.

test.describe("Settings", () => {
  test("loads, fits and is screenshotted", async ({ page }) => {
    await page.goto("/music/settings");
    await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
    await expect(page).toHaveTitle("Settings | Woodshed");
    await expect(page.getByText("Salamander Grand Piano by Alexander Holm")).toBeVisible();
    await expect(page.getByText("Diagnostic only, never applied to scoring.")).toBeVisible();
    await shootSettings(page, "settings");
  });

  test("reduce motion sets the root attribute", async ({ page }) => {
    await page.goto("/music/settings");
    const sw = page.getByRole("switch", { name: "Reduce motion" });
    await sw.click();
    await expect(sw).toHaveAttribute("aria-checked", "true");
    await expect(page.locator("html")).toHaveAttribute("data-reduce-motion", "");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-reduce-motion", "");
    await page.getByRole("switch", { name: "Reduce motion" }).click();
    await expect(page.locator("html")).not.toHaveAttribute("data-reduce-motion");
  });

  test("data backup round trip", async ({ page }) => {
    await page.goto("/music/settings");
    const goal = page.getByTestId("weekly-goal");
    await expect(goal).toContainText("4");
    await page.getByRole("button", { name: "One more session" }).click();
    await expect(goal).toContainText("5");
    await seedSession(page, "e2e-kept");

    await page.getByRole("button", { name: "Prepare data backup" }).click();
    await expect(page.getByRole("status")).toContainText("Backup ready");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download JSON" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^woodshed-backup-\d{4}-\d{2}-\d{2}\.json$/);
    const json = JSON.parse(await readFile((await download.path())!, "utf8"));
    expect(json.format).toBe("woodshed-data-backup");
    expect(json.tables.sessions.map((s: { id: string }) => s.id)).toEqual(["e2e-kept"]);

    // Change things after the backup.
    await page.getByRole("button", { name: "One more session" }).click();
    await page.getByRole("button", { name: "One more session" }).click();
    await expect(goal).toContainText("7");
    await seedSession(page, "e2e-extra");

    await page.locator('input[type="file"]').setInputFiles((await download.path())!);
    await expect(page.getByTestId("restore-sessions")).toContainText(/Sessions\s*2\s*1/);
    await expect(page.getByText("tables are replaced, not merged")).toBeVisible();
    await expect(page.getByText("Close Woodshed in other tabs first")).toBeVisible();
    await page.locator("#data").screenshot({ path: `${SHOTS}/settings-restore-preview.png` });
    await page.getByRole("button", { name: "Replace my data" }).click();
    await expect(page).toHaveURL(/restored=/);
    await expect(page.getByRole("status")).toContainText("Restored");
    await expect(page.getByTestId("weekly-goal")).toContainText("5");
    const ids = await page.evaluate(
      () =>
        new Promise<string[]>((resolve) => {
          const req = indexedDB.open("woodshed");
          req.onsuccess = () => {
            const r = req.result.transaction("sessions").objectStore("sessions").getAllKeys();
            r.onsuccess = () => (req.result.close(), resolve(r.result as string[]));
          };
        }),
    );
    expect(ids).toEqual(["e2e-kept"]);
  });

  test("full backup ZIP restores", async ({ page }) => {
    await page.goto("/music/settings");
    await seedSession(page, "e2e-full");
    await page.getByRole("button", { name: "Prepare full backup" }).click();
    await expect(page.getByRole("status")).toContainText("Backup ready");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download ZIP" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^woodshed-full-backup-.*\.zip$/);
    await seedSession(page, "e2e-full-extra");
    await page.locator('input[type="file"]').setInputFiles((await download.path())!);
    await expect(page.getByTestId("restore-sessions")).toContainText(/Sessions\s*2\s*1/);
    await expect(page.getByText("nothing is overwritten")).toBeVisible();
    await page.getByRole("button", { name: "Replace my data" }).click();
    await expect(page.getByRole("status")).toContainText("Restored");
  });

  test("MIDI calibration reads taps 20 ms late as about +20 ms, twice", async ({ page }) => {
    test.setTimeout(90_000);
    await installFakeMidi(page, [PORTS.keys]);
    await page.goto("/music/settings");
    const panel = page.getByTestId("cal-midi");

    for (let round = 0; round < 2; round++) {
      await panel.getByRole("button", { name: "Run" }).click();
      await page.waitForFunction(() => (window as any).__woodshedCalibration);
      // Taps scheduled in the page, 20 ms after each click, through the fake MIDI port.
      await page.evaluate(() => {
        const { startPerf, beatMs, clicks } = (window as any).__woodshedCalibration;
        for (let i = 0; i < clicks; i++) {
          setTimeout(
            () => {
              (window as any).__midi.send("in-keys", [0x90, 60, 100]);
              setTimeout(() => (window as any).__midi.send("in-keys", [0x80, 60, 0]), 60);
            },
            startPerf + i * beatMs + 20 - performance.now(),
          );
        }
      });
      if (round === 0) {
        await page.waitForTimeout(3000);
        await panel.screenshot({ path: `${SHOTS}/settings-calibration-run.png` });
      }
      const result = page.getByTestId("result-midi");
      await expect(result).toContainText("Measured", { timeout: 25_000 });
      const ms = Number((await result.textContent())!.match(/Measured ([+−]?)(\d+) ms/)![2]);
      expect(ms).toBeGreaterThanOrEqual(17);
      expect(ms).toBeLessThanOrEqual(28);
      await panel.getByRole("button", { name: /^Save/ }).click();
      await expect(page.getByTestId("offset-midi")).toHaveText(`Now +${ms} ms`);
    }
    // The saved offset survives a reload.
    await page.reload();
    await expect(page.getByTestId("offset-midi")).toContainText(/Now \+\d+ ms/);
  });

  test("reset needs the inline confirm", async ({ page }) => {
    await page.goto("/music/settings");
    await page.getByRole("button", { name: "One more session" }).click();
    await expect(page.getByTestId("weekly-goal")).toContainText("5");
    await page.getByRole("button", { name: "Reset local data" }).click();
    await expect(page.getByText("Delete everything?")).toBeVisible();
    await page.getByRole("button", { name: "Keep my data" }).click();
    await expect(page.getByText("Delete everything?")).toHaveCount(0);
    await page.getByRole("button", { name: "Reset local data" }).click();
    await page.getByRole("button", { name: "Delete everything", exact: true }).click();
    await expect(page).toHaveURL(/reset=1/);
    await expect(page.getByRole("status")).toContainText("Local data deleted");
    await expect(page.getByTestId("weekly-goal")).toContainText("4");
  });
});

test.describe("Guide", () => {
  test("loads, fits and is screenshotted", async ({ page }) => {
    await page.goto("/music/guide");
    await expect(page.getByRole("heading", { level: 1, name: "Guide" })).toBeVisible();
    await expect(page).toHaveTitle("Guide | Woodshed");
    for (const h of [
      "How a session works",
      "Practice and Check",
      'What "Not measured" means',
      "Shortcuts",
      "Privacy",
    ])
      await expect(page.getByRole("heading", { level: 2, name: h })).toBeVisible();
    await shootSettings(page, "guide");
  });
});
