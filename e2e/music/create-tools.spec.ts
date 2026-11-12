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
  choose,
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

  /** Open the fold-out Tracks and song panel. */
  async function openPanel(page: Page) {
    const toggle = page.locator('[aria-controls="create-panel"]');
    await expect(async () => {
      if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
      await expect(page.getByRole("heading", { name: "Tracks" })).toBeVisible({ timeout: 1000 });
    }).toPass();
  }

  test("beat: the grid and the roll together, a new song, play all, play one track alone", async ({
    page,
  }) => {
    await page.goto("/music/create");
    await expect(page.getByRole("heading", { level: 1, name: "Create" })).toBeVisible();
    // Both editors are on the page with the panel closed.
    const beat = page.getByRole("region", { name: "Beat editor" });
    await expect(beat).toBeVisible();
    await expect(page.getByRole("region", { name: "Melody editor" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tracks" })).toBeHidden();

    // A new song over the unsaved starter asks first.
    await openPanel(page);
    await page.getByRole("button", { name: "New song" }).click();
    await page.getByRole("button", { name: "Discard changes" }).click();
    await expect(page.getByRole("status")).toContainText("New song");
    const kick = beat.getByRole("button", { name: "Kick, bar 1 step 1", exact: true });
    await kick.click();
    await expect(kick).toHaveAttribute("aria-pressed", "true");
    await beat.getByRole("button", { name: "Snare, bar 1 step 5", exact: true }).click();
    await beat.getByRole("button", { name: "Hats, bar 1 step 3", exact: true }).click();
    await expect(page.getByText("Beat, 3 hits over 1 bar")).toBeVisible();

    const song = page.getByRole("region", { name: "Song" });
    await song.getByRole("button", { name: "Play all" }).click();
    await expect(page.getByRole("status")).toContainText("Playing Untitled song");
    await expect
      .poll(
        async () => Number(await page.locator("[data-playhead]").getAttribute("data-playhead")),
        { timeout: 10_000 },
      )
      .toBeGreaterThan(0);
    // One track alone, straight from Play all; Play all brings the rest back.
    await page.getByRole("button", { name: "Play Beat alone" }).click();
    await expect(page.getByRole("status")).toContainText("Playing Beat on its own");
    await expect(page.getByRole("button", { name: "Stop Beat alone" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(song.getByRole("button", { name: "Play all" })).toBeVisible();
    await page.getByRole("button", { name: "Stop Beat alone" }).click();
    await expect(page.getByRole("status")).toHaveText("Stopped.");
    // The beat grid's own play button plays the groove alone.
    await beat.getByRole("button", { name: "Play beat" }).click();
    await expect(page.getByRole("status")).toContainText("Playing the beat on its own");
    // Only the beat grid's playhead runs; the roll stays still.
    await expect
      .poll(
        async () => Number(await page.locator("[data-playhead]").getAttribute("data-playhead")),
        {
          timeout: 10_000,
        },
      )
      .toBeGreaterThan(0);
    await expect(page.locator(".roll .playhead")).toHaveCount(0);
    await beat.getByRole("button", { name: "Stop" }).click();
    await expect(page.getByRole("status")).toHaveText("Stopped.");
    // Space plays and stops when focus is not on a control.
    await page.locator("h1").click();
    await page.keyboard.press("Space");
    await expect(page.getByRole("status")).toContainText("Playing");
    await page.keyboard.press("Space");
    await expect(page.getByRole("status")).toHaveText("Stopped.");
    await shoot(page, "create-beat");
  });

  test("sample kits have their own page: load a sample, assign it, export, and the beat plays it", async ({
    page,
  }) => {
    await page.goto("/music/create");
    await openPanel(page);
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
    await choose(page, page.getByLabel("Sample on pad A05"), "Kick_01");
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
    await page.getByText("Advanced: send the kit to an MPC").click();
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
    await openPanel(page);
    await expect(page.getByLabel("Beat kit")).toHaveText("Boom Bap");
    await expect(
      page.getByRole("button", { name: /^Big kick on A01, bar 1 step 1$/ }),
    ).toBeVisible();
  });

  test("melodies: add notes, resize, song length, a second melody, export MIDI, nothing saved", async ({
    page,
  }) => {
    await page.goto("/music/create");
    const song = page.getByRole("region", { name: "Song" });
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
    // Pointer path: click a cell. A short song stretches its cells to fill the view.
    const sw = async () => Number(await grid.getAttribute("data-step-w"));
    const c4 = (await page.locator('.note[data-note="60"]').boundingBox())!;
    await page.mouse.click(c4.x + (await sw()) * 6 + 4, c4.y + c4.height / 2);
    await expect(page.getByRole("status")).toContainText("Added");
    await expect(roll.locator(".note[data-note]")).toHaveCount(3);

    // Song length: a third bar, a note in it, then remove the bar again.
    await song.getByRole("button", { name: "Add a bar to the song" }).click();
    await expect(song.getByText("3 bars")).toBeVisible();
    const box = (await grid.boundingBox())!;
    await page.mouse.click(box.x + (await sw()) * 33 + 4, c4.y + c4.height / 2);
    await expect(roll.locator(".note[data-note]")).toHaveCount(4);
    await song.getByRole("button", { name: "Remove the song's last bar" }).click();
    await expect(page.getByRole("status")).toContainText("1 note past the end went with the bar");
    await expect(roll.locator(".note[data-note]")).toHaveCount(3);

    // A loop repeats the melody's first bar through the whole song.
    await openPanel(page);
    await choose(page, page.getByLabel("Melody 1 loop"), "Loop 1 bar");
    await expect(page.getByRole("status")).toContainText(
      "Melody 1 repeats its first 1 bar through all 2 bars",
    );
    await expect(page.getByText("Melody, 3 notes, looping 1 bar")).toBeVisible();
    await expect(roll.locator(".note.repeat")).toHaveCount(3);
    // Drawing in the repeats edits the loop: the note lands in bar 1 and repeats.
    await roll.locator(".repeats").waitFor();
    // The panel above pushed the roll down (off the screen): bring it back and measure again.
    await roll.locator(".repeats").scrollIntoViewIfNeeded();
    const g = (await grid.boundingBox())!;
    const row = (await roll.locator('.note[data-note="60"]').first().boundingBox())!;
    await page.mouse.click(g.x + (await sw()) * 26 + 4, row.y + row.height / 2);
    await expect(page.getByRole("status")).toContainText("in the loop, so every repeat changes");
    await expect(roll.locator(".note[data-note]")).toHaveCount(4);
    await expect(roll.locator(".note.repeat")).toHaveCount(4);
    await page.mouse.click(g.x + (await sw()) * 26 + 4, row.y + row.height / 2); // and off again
    await expect(roll.locator(".note[data-note]")).toHaveCount(3);
    await choose(page, page.getByLabel("Melody 1 loop"), "No loop");
    await expect(roll.locator(".note.repeat")).toHaveCount(0);
    await page.getByRole("button", { name: "Done" }).click();

    // A second melody from the panel; the roll switches to it, the first as ghosts.
    await openPanel(page);
    await page.getByRole("button", { name: "Add melody" }).click();
    const chips = roll.getByRole("group", { name: "Melodies to hear and see" });
    const m1 = chips.getByRole("button", { name: /^Melody 1/ });
    const m2 = chips.getByRole("button", { name: /^Melody 2/ });
    await expect(m2).toHaveAttribute("aria-pressed", "true");
    await expect(m2).toHaveAccessibleName("Melody 2 (drawing on it)");
    await expect(roll.locator(".note.ghost")).toHaveCount(3);
    // Tapping a picked melody draws on it; tapping the one drawn on puts it down.
    await m1.click();
    await expect(m1).toHaveAccessibleName("Melody 1 (drawing on it)");
    await expect(roll.locator(".note:not(.ghost)[data-note]")).toHaveCount(3);
    await m2.click();
    await m2.click();
    await expect(page.getByRole("status")).toContainText("Melody 2 put down");
    await expect(m2).toHaveAttribute("aria-pressed", "false");
    await expect(m1).toHaveAccessibleName("Melody 1 (drawing on it)");
    await m1.click();
    await expect(page.getByRole("status")).toContainText("the only one picked");
    await expect(m1).toHaveAttribute("aria-pressed", "true");
    // Play melodies plays the picked ones, and the roll follows the playhead.
    await roll.getByRole("button", { name: "Play melodies" }).click();
    await expect(page.getByRole("status")).toContainText("Playing Melody 1 on its own");
    await expect(roll.locator(".playhead")).toBeVisible();
    // The beat grid stays still while only melodies play.
    await page.waitForTimeout(700);
    await expect(page.locator("[data-playhead]")).toHaveAttribute("data-playhead", "-1");
    await roll.getByRole("button", { name: "Stop" }).click();
    await m2.click();
    await expect(m2).toHaveAttribute("aria-pressed", "true");
    const [dl] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "MIDI", exact: true }).click(),
    ]);
    expect(dl.suggestedFilename()).toBe("Untitled-song.mid");
    await expect(page.getByRole("status")).toContainText("2 tracks, 3 notes");

    // Delete it from its menu (two taps).
    await page.getByRole("button", { name: "Melody 2 options" }).click();
    await page.getByRole("menuitem", { name: "Delete melody" }).click();
    await page.getByRole("menuitem", { name: "Delete Melody 2?" }).click();
    await expect(page.getByRole("status")).toContainText("Deleted Melody 2");

    // A reload keeps the work in progress, but nothing went into your songs.
    await expect(song.locator("[data-save-state]")).toHaveText("Not saved");
    await page.waitForTimeout(600);
    await page.reload();
    await expect(page.locator(".note[data-note]")).toHaveCount(3);
    await openPanel(page);
    await expect(page.getByLabel("Your songs")).toHaveCount(0);
    await shoot(page, "create-roll");
  });

  test("a backing track: preset beat, a bass melody, playing alone and together, saved only on Save", async ({
    page,
  }) => {
    await page.goto("/music/create");
    const song = page.getByRole("region", { name: "Song" });
    await openPanel(page);

    // A preset beat, then one more bar: the song grows with it.
    await page.getByRole("button", { name: "Sounds" }).click();
    await choose(page, page.getByLabel("Start from a preset"), "Boom bap, 2 bars");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("status")).toContainText("Boom bap, 2 bars");
    await page.getByRole("button", { name: "Add a bar to the beat" }).click();
    await expect(page.getByRole("status")).toContainText("The song grew to 3 bars");
    await expect(
      page.getByRole("button", { name: "Kick, bar 3 step 1", exact: true }),
    ).toBeVisible();
    // Three bars do not fit: playing turns the grid's page to follow the playhead.
    const beatGrid = page.locator("[data-grid]");
    await page
      .getByRole("region", { name: "Beat editor" })
      .getByRole("button", { name: "Play beat" })
      .click();
    await expect
      .poll(() => beatGrid.evaluate((el) => el.scrollLeft), { timeout: 15_000 })
      .toBeGreaterThan(0);
    // The playing step stays in view as the grid turns its page.
    for (let i = 0; i < 3; i++) {
      await page.waitForTimeout(500);
      expect(
        await beatGrid.evaluate((el) => {
          const now = el.querySelector<HTMLElement>("thead th[data-now]");
          if (!now) return true; // between passes
          const r = now.getBoundingClientRect(),
            b = el.getBoundingClientRect();
          return r.left >= b.left && r.right <= b.right + 1;
        }),
      ).toBe(true);
    }
    await page
      .getByRole("region", { name: "Beat editor" })
      .getByRole("button", { name: "Stop" })
      .click();

    // A bass line on its own instrument, saved to the library.
    await choose(page, page.getByLabel("Melody 1 instrument"), "Bass");
    await expect(page.getByRole("status")).toContainText("Melody 1 plays Bass");
    await page.getByRole("application", { name: /Note grid/ }).focus();
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Melody 1 options" }).click();
    await page.getByRole("menuitem", { name: "Save melody to library" }).click();
    await expect(page.getByRole("status")).toContainText("Saved Melody 1 to the library");

    // Everything on one loop: both playheads move.
    await song.getByRole("button", { name: "Play all" }).click();
    await expect(page.getByRole("status")).toContainText("3 bars at 90 BPM");
    await expect(page.locator(".playhead")).toBeVisible();
    await expect
      .poll(
        async () => Number(await page.locator("[data-playhead]").getAttribute("data-playhead")),
        { timeout: 10_000 },
      )
      .toBeGreaterThan(0);
    // The bass alone, then muting the beat keeps the melody going under Play all.
    await page.getByRole("button", { name: "Play Melody 1 alone" }).click();
    await expect(page.getByRole("status")).toContainText("Playing Melody 1 on its own");
    await song.getByRole("button", { name: "Play all" }).click();
    await page.getByRole("button", { name: "Mute the beat" }).click();
    await expect(page.getByRole("button", { name: "Unmute the beat" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.locator(".playhead")).toBeVisible();
    // Levels, not just mutes: the melody down to 40% while it plays.
    const melodyLevel = page.getByRole("slider", { name: "Melody 1 volume" });
    await expect(melodyLevel).toHaveAttribute("aria-valuetext", "100%");
    await melodyLevel.fill("0.4");
    await expect(melodyLevel).toHaveAttribute("aria-valuetext", "40%");
    await expect(page.getByRole("slider", { name: "Beat volume" })).toHaveValue("1");
    await song.getByRole("button", { name: "Stop", exact: true }).click();

    // Save puts it in your songs; nothing else does.
    await page.getByLabel("Name", { exact: true }).fill("Jam in C");
    await expect(song.locator("[data-save-state]")).toHaveText("Not saved");
    await song.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Saved Jam in C to your songs");
    await expect(song.getByRole("button", { name: "Saved" })).toBeDisabled();

    // A new song straight away (nothing to lose), then one with changes asks first.
    await page.getByRole("button", { name: "New song" }).click();
    await expect(page.getByText("Beat, 0 hits over 1 bar")).toBeVisible();
    await page.getByRole("button", { name: "Kick, bar 1 step 1", exact: true }).click();
    await choose(page, page.getByLabel("Your songs"), "Jam in C, 90 BPM");
    await expect(page.getByRole("group", { name: "Unsaved changes" })).toBeVisible();
    await page.getByRole("button", { name: "Discard changes" }).click();
    await expect(page.getByRole("status")).toContainText("Opened Jam in C");
    await expect(
      page.getByRole("button", { name: "Kick, bar 3 step 1", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByLabel("Melody 1 instrument")).toHaveAttribute("data-value", "bass");
    await expect(page.getByRole("slider", { name: "Melody 1 volume" })).toHaveValue("0.4");
    await expect(song.locator("[data-save-state]")).toHaveText("Saved");

    // The saved melody can join any song; that is a change to save.
    await choose(page, page.getByLabel("Add from library"), /^Melody 1, Bass/);
    await expect(page.getByRole("status")).toContainText("Added Melody 1 as a new melody");
    await expect(page.getByLabel("Melody 1 instrument")).toHaveCount(2);
    await expect(song.locator("[data-save-state]")).toHaveText("Unsaved changes");

    // A chord progression as its own track, in the key asked for.
    // The key comes from the circle of fifths.
    await page.getByRole("button", { name: /^Key for the chords: / }).click();
    await page.getByRole("button", { name: "D major, 2 sharps" }).click();
    await expect(page.getByRole("button", { name: "Key for the chords: D" })).toBeVisible();
    await choose(page, page.getByLabel("Add a chord progression"), "Jazz, ii-V-I");
    await expect(page.getByRole("status")).toContainText("Added Jazz in D: Em7, A7, Dmaj7, Dmaj7");
    await expect(page.getByLabel("Jazz in D instrument")).toHaveAttribute("data-value", "e-piano");
    await expect(page.locator(".note[data-note]")).toHaveCount(16); // four 4-note chords
    // Four bars are wider than the roll: it follows the playhead too.
    const roll = page.getByRole("region", { name: "Melody editor" });
    await roll.getByRole("button", { name: "Play melodies" }).click();
    await expect
      .poll(() => roll.locator(".roll").evaluate((el) => el.scrollLeft), { timeout: 15_000 })
      .toBeGreaterThan(0);
    // After the page turns, the playhead is inside the view, not running off it.
    const inView = () =>
      roll.locator(".roll").evaluate((el) => {
        const h = el.querySelector<HTMLElement>(".playhead");
        const x = (h?.offsetLeft ?? -1) + 56; // past the keys
        return x >= el.scrollLeft && x <= el.scrollLeft + el.clientWidth;
      });
    for (let i = 0; i < 3; i++) {
      await page.waitForTimeout(700);
      expect(await inView()).toBe(true);
    }
    await roll.getByRole("button", { name: "Stop" }).click();
    await shoot(page, "create-song");

    // Take it out of your songs (two taps); it stays open.
    await page.getByRole("button", { name: "Remove from your songs" }).click();
    await page.getByRole("button", { name: "Remove Jam in C?" }).click();
    await expect(page.getByRole("status")).toContainText("Removed Jam in C from your songs");
    await expect(song.locator("[data-save-state]")).toHaveText("Not saved");
  });
});

test.describe("Record", () => {
  test("a MIDI take from fake MIDI survives a reload, plays, compares and exports", async ({
    page,
  }) => {
    await installFakeMidi(page, [PORTS.keys]);
    await page.goto("/music/record");
    await expect(page.getByRole("heading", { level: 1, name: "Record" })).toBeVisible();
    await page.getByRole("button", { name: "Turn on MIDI" }).click();
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
      // Long enough notes that a pause can land before the take ends; stamped exactly,
      // so the two takes' rhythms match however busy the machine is.
      await page.evaluate(
        ({ port, notes }) =>
          new Promise<void>((resolve) => {
            const midi = (window as any).__midi;
            const t0 = performance.now() + 50;
            notes.forEach((n, i) => {
              const on = t0 + i * 500;
              setTimeout(() => midi.send(port, [0x90, n, 90], on), on - performance.now());
              setTimeout(
                () => midi.send(port, [0x80, n, 0], on + 450),
                on + 450 - performance.now(),
              );
            });
            setTimeout(resolve, notes.length * 500 + 100);
          }),
        { port: PORTS.keys.id, notes },
      );
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
    await take.getByRole("button", { name: "Save to Song practice" }).click();
    await expect(take.getByRole("link", { name: "Open in Song practice" })).toBeVisible();
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
    // Record arms the microphone itself; Arm microphone stays for checking the level first.
    await expect(page.getByRole("button", { name: "Record", exact: true })).toBeEnabled();
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
    await page.getByRole("button", { name: "Pick a note" }).click();
    const targets = page.getByRole("group", { name: "Target note" });
    await targets.getByRole("button", { name: "C", exact: true }).click();
    await expect(page.getByTestId("tuner-cents")).toContainText("A, 3 semitones below");
    await expect(page.getByTestId("tuner-note")).toHaveText("C3");
    await targets.getByRole("button", { name: "A", exact: true }).click();
    await expect(page.getByTestId("tuner-cents")).toContainText("in tune");
    await shots(page, "tuner-target");
    await targets.getByRole("button", { name: "Any note" }).click();

    // Fretted instruments get the string strip; A2 is the fifth string.
    await choose(page, page.getByLabel("Instrument", { exact: true }), "Guitar");
    await expect(page.getByLabel("Guitar tuning")).toBeVisible();
    await expect(page.getByRole("button", { name: /String 5, A2, nearest/ })).toBeVisible();
    await shots(page, "tuner-tune-guitar");

    // Intonation: same listening session, stats fill in.
    await page.getByRole("link", { name: "Intonation" }).click();
    await expect(page).toHaveURL(/mode=intonation/);
    const stats = page.getByTestId("intonation-stats");
    await expect(stats).toBeVisible({ timeout: 10_000 });
    for (const label of ["In tune", "Hold", "Held steady", "Avg drift"])
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
    await choose(page, page.getByLabel("Reference A4"), "442 Hz");
    await page.getByRole("button", { name: "Start listening" }).click();
    // 110 Hz against A4 = 442 is A2 about 8 cents flat.
    await expect(page.getByTestId("tuner-cents")).toContainText(/−8 cents, flat, tune up/, {
      timeout: 10_000,
    });
    await expect(page.getByText(/target 110\.5 Hz/)).toBeVisible();
    await choose(page, page.getByLabel("Reference A4"), "440 Hz (standard)");
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
    // The tooltip itself (its hidden screen-reader twin can count as visible mid-fade).
    await expect(
      page
        .locator("[data-tooltip-content]")
        .getByText("Diagnostic only, never applied to scoring."),
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
    const off = page.getByRole("button", { name: /^Sound and input: sound off/ });
    await expect(off).toContainText("Sound off");
    await page.reload();
    await expect(
      page.locator("section#audio").getByRole("switch", { name: "Sound", exact: true }),
    ).toHaveAttribute("aria-checked", "false");
    await page.getByRole("button", { name: /^Sound and input: sound off/ }).click();
    await page.getByRole("button", { name: "Turn on sound" }).click();
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
      await panel.getByRole("button", { name: "Start" }).click();
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
