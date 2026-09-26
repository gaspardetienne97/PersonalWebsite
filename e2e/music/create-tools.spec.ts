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

  /** Open the song bar's Songs menu and pick an item. */
  async function songMenu(page: Page, item: string | RegExp) {
    await page.getByRole("region", { name: "Song" }).getByRole("button", { name: "Songs" }).click();
    await page
      .getByRole("menuitem", { name: item })
      .or(page.getByRole("menuitemradio", { name: item }))
      .click();
  }

  test("beat: build a pattern on a new song and play it", async ({ page }) => {
    await page.goto("/music/create");
    await expect(page.getByRole("heading", { level: 1, name: "Create" })).toBeVisible();
    await songMenu(page, "New song");
    await expect(page.getByRole("status")).toContainText("Started Song 2");
    const beat = page.getByRole("region", { name: "Beat editor" });
    const kick = beat.getByRole("button", { name: "Kick, bar 1 step 1", exact: true });
    await kick.click();
    await expect(kick).toHaveAttribute("aria-pressed", "true");
    await beat.getByRole("button", { name: "Snare, bar 1 step 5", exact: true }).click();
    await beat.getByRole("button", { name: "Hats, bar 1 step 3", exact: true }).click();
    await expect(page.getByRole("button", { name: /^Beat.*3 hits over 1 bar/ })).toBeVisible();

    const song = page.getByRole("region", { name: "Song" });
    await song.getByRole("button", { name: "Play all" }).click();
    await expect(page.getByRole("status")).toContainText("Playing Song 2");
    // The playhead moves (lights follow the audio clock).
    await expect
      .poll(
        async () => Number(await page.locator("[data-playhead]").getAttribute("data-playhead")),
        { timeout: 10_000 },
      )
      .toBeGreaterThan(0);
    // Space stops it when focus is not on a control.
    await page.locator("h1").click();
    await page.keyboard.press("Space");
    await expect(page.getByRole("status")).toHaveText("Stopped.");
    await shoot(page, "create-beat");
  });

  test("sample kits have their own page: load a sample, assign it, export, and the beat plays it", async ({
    page,
  }) => {
    await page.goto("/music/create");
    await page.getByRole("button", { name: "Beat options" }).click();
    await page.getByRole("menuitem", { name: "Edit sample kits" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Sample kits" })).toBeVisible();

    // Import a generated WAV: "Kick_01" auto-maps to pad A01 (MIDI 36).
    await page
      .getByLabel("Import samples")
      .setInputFiles({ name: "Kick_01.wav", mimeType: "audio/wav", buffer: wavSample() });
    await expect(page.getByRole("status")).toContainText("Kick_01 on pad A01");
    await expect(page.getByRole("button", { name: "Pad A01, Kick_01" })).toBeVisible();

    // Assign it to another pad through that pad's native select, and through "Assign to pad".
    await page.getByLabel("Sample on pad A05").selectOption({ label: "Kick_01" });
    await expect(page.getByRole("status")).toContainText("Pad A05 plays Kick_01");
    await page.getByRole("button", { name: "Assign to pad" }).click();
    await page.getByRole("button", { name: /^Pad A09, empty/ }).click();
    await expect(page.getByRole("status")).toContainText("Kick_01 is on pad A09");
    await expect(page.getByText("On A01, A05, A09")).toBeVisible();

    // Rename in place; the pad follows.
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
    await shoot(page, "create-kits");

    // Survives a reload, and the beat's kick row plays the sample, named after it.
    await page.waitForTimeout(500);
    await page.reload();
    await expect(page.getByRole("button", { name: "Pad A01, Big kick" })).toBeVisible();
    await page.getByRole("link", { name: "Create" }).first().click();
    await expect(page.getByLabel("Beat kit")).toHaveValue(/.+/);
    await expect(page.getByLabel("Beat kit").locator("option:checked")).toHaveText("Boom Bap");
    await expect(
      page.getByRole("button", { name: /^Big kick on A01, bar 1 step 1$/ }),
    ).toBeVisible();
  });

  test("melodies: add notes, resize, a second melody, song length, export MIDI", async ({
    page,
  }) => {
    await page.goto("/music/create");
    const song = page.getByRole("region", { name: "Song" });
    await page.getByRole("button", { name: /^Melody 1 Melody/ }).click();
    const roll = page.getByRole("region", { name: "Melody editor" });
    const grid = roll.getByRole("application", { name: /Note grid for Melody 1/ });

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
    await expect(roll.locator(".note[data-note]")).toHaveCount(3);

    // Song length: a third bar, a note in it, then remove the bar again.
    await song.getByRole("button", { name: "Add a bar to the song" }).click();
    await expect(song.getByText("3 bars")).toBeVisible();
    const box = (await grid.boundingBox())!;
    await page.mouse.click(box.x + 22 * 33 + 4, c4.y + c4.height / 2);
    await expect(roll.locator(".note[data-note]")).toHaveCount(4);
    await song.getByRole("button", { name: "Remove the song's last bar" }).click();
    await expect(page.getByRole("status")).toContainText("1 note past the end went with the bar");
    await expect(roll.locator(".note[data-note]")).toHaveCount(3);

    // A second melody; the first shows as ghosts behind it.
    await page.getByRole("button", { name: "Add melody" }).click();
    await expect(page.getByRole("button", { name: /^Melody 2 Melody/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(roll.locator(".note.ghost")).toHaveCount(3);
    const [dl] = await Promise.all([
      page.waitForEvent("download"),
      songMenu(page, "Export melodies as MIDI"),
    ]);
    expect(dl.suggestedFilename()).toBe("My-first-song.mid");
    await expect(page.getByRole("status")).toContainText("2 tracks, 3 notes");

    // Delete it from its menu (two taps), then reload: the song saved itself.
    await page.getByRole("button", { name: "Melody 2 options" }).click();
    await page.getByRole("menuitem", { name: "Delete melody" }).click();
    await page.getByRole("menuitem", { name: "Delete Melody 2?" }).click();
    await expect(page.getByRole("status")).toContainText("Deleted Melody 2");
    await page.waitForTimeout(600);
    await page.reload();
    await page.getByRole("button", { name: /^Melody 1 Melody, 3 notes/ }).click();
    await expect(page.locator(".note[data-note]")).toHaveCount(3);
    await shoot(page, "create-roll");
  });

  test("a backing track: preset beat, a longer beat, a bass melody, playing together, songs and the library", async ({
    page,
  }) => {
    await page.goto("/music/create");
    const song = page.getByRole("region", { name: "Song" });
    await songMenu(page, "New song");

    // A preset beat, then one more bar: the song grows with it.
    await page.getByLabel("Start from a preset").selectOption({ label: "Boom bap, 2 bars" });
    await expect(page.getByRole("status")).toContainText("Boom bap, 2 bars");
    await page.getByRole("button", { name: "Add a bar to the beat" }).click();
    await expect(page.getByRole("status")).toContainText("The song grew to 3 bars");
    await expect(
      page.getByRole("button", { name: "Kick, bar 3 step 1", exact: true }),
    ).toBeVisible();

    // A bass line on its own instrument, saved to the library.
    await page.getByLabel("Melody 1 instrument").selectOption({ label: "Bass" });
    await expect(page.getByRole("status")).toContainText("Melody 1 plays Bass");
    await page.getByRole("button", { name: /^Melody 1 Melody/ }).click();
    await page.getByRole("application", { name: /Note grid/ }).focus();
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Melody 1 options" }).click();
    await page.getByRole("menuitem", { name: "Save melody to library" }).click();
    await expect(page.getByRole("status")).toContainText("Saved Melody 1 to the library");

    // Both play on one loop: the roll's playhead moves, and so does the beat's.
    await song.getByRole("button", { name: "Play all" }).click();
    await expect(page.getByRole("status")).toContainText("3 bars at 90 BPM");
    await expect(page.locator(".playhead")).toBeVisible();
    // Muting the beat keeps the melody going.
    await page.getByRole("button", { name: "Mute the beat" }).click();
    await expect(page.getByRole("button", { name: "Unmute the beat" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.locator(".playhead")).toBeVisible();
    await page.getByRole("button", { name: /^Boom bap/ }).click();
    await expect
      .poll(
        async () => Number(await page.locator("[data-playhead]").getAttribute("data-playhead")),
        { timeout: 10_000 },
      )
      .toBeGreaterThan(0);
    await song.getByRole("button", { name: "Stop", exact: true }).click();

    // Name it, start another, come back: songs save as you work.
    await song.getByLabel("Song name").fill("Jam in C");
    await page.waitForTimeout(600);
    await songMenu(page, "New song");
    await expect(page.getByRole("button", { name: /^Beat Beat, 0 hits over 1 bar/ })).toBeVisible();
    await songMenu(page, "Jam in C");
    await expect(page.getByRole("status")).toContainText("Opened Jam in C");
    await expect(
      page.getByRole("button", { name: "Kick, bar 3 step 1", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByLabel("Melody 1 instrument")).toHaveValue("bass");

    // The saved melody can join any song.
    await page.getByLabel("Add from library").selectOption({ index: 1 });
    await expect(page.getByRole("status")).toContainText("Added Melody 1 as a new melody");
    await expect(page.getByLabel("Melody 1 instrument")).toHaveCount(2);
    await shoot(page, "create-song");

    // Delete the open song (two taps); the next one opens.
    await songMenu(page, "Delete this song");
    await page.getByRole("menuitem", { name: "Delete Jam in C?" }).click();
    await expect(page.getByRole("status")).toContainText("Deleted Jam in C");
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
      // Long enough notes that a pause can land before the take ends.
      for (const n of notes) await midiNote(page, PORTS.keys.id, n, 90, 1, 450);
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
    // Resume, let it finish: the button goes back to Play by itself.
    await take.getByRole("button", { name: "Play Arpeggio" }).click();
    await expect(take.getByRole("button", { name: "Pause Arpeggio" })).toBeVisible();
    await expect(take.getByRole("button", { name: "Play Arpeggio" })).toBeVisible({
      timeout: 5000,
    });

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

    // Open in the piano roll: the take arrives as a new melody.
    await take.getByRole("link", { name: "Open in piano roll" }).click();
    await expect(page.getByRole("status")).toContainText("Added Arpeggio as a new melody, 3 notes");
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
    // The recording boost sits under the meter.
    await expect(page.getByRole("slider", { name: "Record boost" })).toBeVisible();
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
    // A cursor shows where playback is, and the button returns to Play when the take ends.
    await expect(take.locator("svg line")).toHaveCount(1);
    await expect(take.getByRole("button", { name: "Play Audio take 1" })).toBeVisible({
      timeout: 6000,
    });
    await expect(take.locator("svg line")).toHaveCount(0);

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
    // Explanations live in hints: out of the flow, still described for screen readers.
    const hint = page.getByRole("button", { name: "About output latency" });
    await expect(hint).toHaveAccessibleDescription("Diagnostic only, never applied to scoring.");
    await hint.hover();
    await expect(
      page.getByText("Diagnostic only, never applied to scoring.").filter({ visible: true }),
    ).toBeVisible();
    await shootSettings(page, "settings");
  });

  test("the Sound switch turns sound off and on, and the test message sits in Audio", async ({
    page,
  }) => {
    await page.goto("/music/settings");
    const audio = page.locator("section#audio");
    const sw = audio.getByRole("switch", { name: "Sound", exact: true });
    await expect(sw).toHaveAttribute("aria-checked", "true");
    await audio.getByRole("button", { name: "Play test sound" }).click();
    await expect(audio.getByText("Playing a C major cadence: C, F, G, C.")).toBeVisible();
    await sw.click();
    await expect(sw).toHaveAttribute("aria-checked", "false");
    await expect(audio.getByRole("button", { name: "Play test sound" })).toBeDisabled();
    // The practice strip says so, and turns it back on.
    const off = page.getByRole("button", { name: "Sound is off. Turn it on" });
    await expect(off).toBeVisible();
    await page.reload();
    await expect(
      page.locator("section#audio").getByRole("switch", { name: "Sound", exact: true }),
    ).toHaveAttribute("aria-checked", "false");
    await page.getByRole("button", { name: "Sound is off. Turn it on" }).click();
    await expect(
      page.locator("section#audio").getByRole("switch", { name: "Sound", exact: true }),
    ).toHaveAttribute("aria-checked", "true");
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
