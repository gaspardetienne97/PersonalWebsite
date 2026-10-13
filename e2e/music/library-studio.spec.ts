// Library (songs, reference, import), Song Studio, Jam and the Practice Lab:
// each route loads without sideways scroll, imports land in Songs, Song Studio
// runs wait and performance passes over fake MIDI, views survive reload and
// Back, Jam reports on a chorus, and a Lab take survives a reload.
import { expect, test, type Page } from "@playwright/test";
import { PORTS, expectNoHorizontalOverflow, installFakeMidi, choose } from "./fixtures";

const SHOTS = "docs/screenshots/rebuild/library-studio";
const ODE = "e2e/music/fixtures/ode-to-joy.musicxml";
// Ode to Joy, bars 1 to 4, one note per group.
const ODE_NOTES = [64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 64, 62, 62];

async function seedSettings(page: Page, patch: Record<string, unknown>) {
  await page.goto("/music");
  await page.waitForLoadState("networkidle");
  for (let i = 0; ; i++) {
    try {
      await page.evaluate(
        (patch) =>
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
                  value: { ...get.result?.value, ...patch },
                });
              tx.oncomplete = () => resolve();
              tx.onerror = () => reject(tx.error);
            };
          }),
        patch,
      );
      return;
    } catch (e) {
      if (i >= 3) throw e;
      await page.waitForLoadState("networkidle");
    }
  }
}

type Step = { at: number; notes: number[]; hold?: number };
async function play(page: Page, steps: Step[]) {
  await page.evaluate(
    ({ steps, port }) =>
      new Promise<void>((resolve) => {
        const midi = (window as any).__midi;
        let left = steps.length;
        for (const s of steps)
          setTimeout(() => {
            for (const n of s.notes) midi.send(port, [0x90, n, 96]);
            setTimeout(() => {
              for (const n of s.notes) midi.send(port, [0x80, n, 0]);
              if (--left === 0) resolve();
            }, s.hold ?? 120);
          }, s.at);
      }),
    { steps, port: PORTS.keys.id },
  );
}

async function shoot(page: Page, name: string) {
  const w = page.viewportSize()!.width;
  await page.screenshot({ path: `${SHOTS}/${name}-${w}-light.png`, fullPage: true });
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.screenshot({ path: `${SHOTS}/${name}-${w}-dark.png`, fullPage: true });
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
}

async function importOde(page: Page) {
  await page.goto("/music/library?tab=import");
  await page.getByLabel("Score file").setInputFiles(ODE);
  await expect(page.getByRole("heading", { name: "Preview" })).toBeVisible();
  await page.getByRole("button", { name: "Save to songs" }).click();
  await expect(page.getByText("Ode to Joy is in your songs.")).toBeVisible();
}

async function openOde(page: Page, query = "") {
  await page.goto("/music/library");
  await page
    .getByRole("link", { name: /Ode to Joy/ })
    .first()
    .click();
  await expect(page.getByRole("heading", { level: 1, name: "Ode to Joy" })).toBeVisible();
  if (query) {
    await page.goto(page.url().split("?")[0] + query);
    await expect(page.getByRole("heading", { level: 1, name: "Ode to Joy" })).toBeVisible();
  }
}

test.describe("library and song studio", () => {
  test.beforeEach(async ({ page }) => {
    await installFakeMidi(page, [PORTS.keys]);
    await page.setViewportSize({ width: 1280, height: 1000 });
    await seedSettings(page, {
      midiEnabledBefore: true,
      activeInstrument: "piano",
      countInBars: 1,
    });
  });

  test("imports MusicXML and MIDI into Songs, refuses other files", async ({ page }) => {
    await importOde(page);

    // A four-note MIDI file with no track title (e2e/music/fixtures/low-riff.mid, written with @tonejs/midi).
    await page.getByLabel("Score file").setInputFiles("e2e/music/fixtures/low-riff.mid");
    await expect(page.getByRole("heading", { name: "Preview" })).toBeVisible();
    await expect(page.getByLabel("Title")).toHaveValue("low-riff");
    await page.getByRole("button", { name: "Save to songs" }).click();
    await expect(page.getByText("low-riff is in your songs.")).toBeVisible();

    await page
      .getByLabel("Score file")
      .setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
    await expect(page.getByRole("alert")).toContainText("not a score this app can read");

    await page.getByRole("link", { name: "Songs", exact: true }).click();
    await expect(page).toHaveURL(/\/music\/library$/);
    const songs = page.getByRole("list", { name: "Saved songs" });
    await expect(songs.getByRole("link", { name: /Ode to Joy/ })).toBeVisible();
    await expect(songs.getByRole("link", { name: /low-riff/ })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await shoot(page, "songs");

    // Transcribe audio: the engines, and a roll to draw in by hand (e2e/music/transcribe.spec.ts runs them).
    await page.goto("/music/library?tab=import");
    await page.getByRole("button", { name: "Transcribe audio" }).click();
    await expect(page.getByRole("button", { name: "Chords and parts" })).toBeVisible();
    await page.getByRole("button", { name: "Start from an empty roll" }).click();
    await expect(page.getByRole("heading", { name: "Draft" })).toBeVisible();
    await shoot(page, "transcribe");
  });

  test("reference: sections by id, go-to in words, the one keyboard", async ({ page }) => {
    await page.goto("/music/library?tab=reference&section=chord-scales");
    await expect(page.getByRole("heading", { name: "Chord-scale map" })).toBeFocused();
    await expect(page.getByText("Go-to").first()).toBeVisible();
    await page.getByRole("button", { name: "Show C Dorian for Cm7 on the keyboard" }).click();
    await expect(page.getByText("C dorian", { exact: true })).toBeVisible();
    await expect(page.locator('#explorer [data-midi="63"][data-target]')).toHaveCount(1);
    await page.getByRole("link", { name: "Upper structures" }).click();
    await expect(page).toHaveURL(/section=upper-structures/);
    await expect(page.getByRole("heading", { name: "Upper structures over a V7" })).toBeFocused();
    await expect(
      page.getByRole("region", { name: "Upper structures table" }).getByText("Favourite").first(),
    ).toBeVisible();
    await page.goto("/music/library?tab=reference");
    await expectNoHorizontalOverflow(page);
    await shoot(page, "reference");
  });

  test("song studio: wait pass and a performance take to results", async ({ page }) => {
    await importOde(page);
    await openOde(page, "?mode=wait");
    await expectNoHorizontalOverflow(page);
    await shoot(page, "studio");
    await page.getByRole("button", { name: "Start in wait mode" }).click();
    await expect(page.getByRole("status")).toContainText("Wait mode");
    // One wrong note first: it flashes and clears; the pass is still completed.
    await play(page, [
      { at: 0, notes: [70] },
      ...ODE_NOTES.map((m, i) => ({ at: 250 + i * 160, notes: [m], hold: 80 })),
    ]);
    await expect(page.getByRole("heading", { name: "Results" })).toBeAttached({ timeout: 8000 });
    await expect(page.getByRole("status")).toContainText("14 of 15 groups clean");
    await expect(page.getByText("Groups played clean")).toBeVisible();
    await expect(page.getByRole("list", { name: "Per-take results" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Per-section results" })).toContainText(
      "Whole score",
    );
    await shoot(page, "studio-wait-results");

    await page.goto(page.url().split("?")[0] + "?mode=performance&bpm=240&takes=1");
    await expect(page.getByRole("heading", { level: 1, name: "Ode to Joy" })).toBeVisible();
    await page.getByRole("button", { name: "Start performance" }).click();
    await expect(page.getByRole("status")).toContainText("Go.", { timeout: 6000 });
    const beat = 250;
    const starts = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13.5, 14];
    await play(
      page,
      ODE_NOTES.map((m, i) => ({ at: starts[i] * beat, notes: [m], hold: 100 })),
    );
    await expect(page.getByRole("heading", { name: "Results" })).toBeAttached({ timeout: 10000 });
    await expect(page.getByText("Notes matched", { exact: true })).toBeVisible();
    await expect(page.getByText("Early / on time / late")).toBeVisible();
    await expect(page.getByRole("button", { name: "Again at 248 BPM" })).toBeVisible();
    await shoot(page, "studio-performance-results");
  });

  test("song studio: fix the trouble spot loops the bar until it is clean", async ({ page }) => {
    test.setTimeout(60_000);
    await importOde(page);
    await openOde(page, "?mode=wait&range=whole");
    await page.getByRole("button", { name: "Start in wait mode" }).click();
    await expect(page.getByRole("status")).toContainText("Wait mode");
    // A wrong note on the very first group: the slip is in bar 1.
    await play(page, [
      { at: 0, notes: [70] },
      ...ODE_NOTES.map((m, i) => ({ at: 250 + i * 160, notes: [m], hold: 80 })),
    ]);
    await expect(page.getByRole("heading", { name: "Results" })).toBeAttached({ timeout: 8000 });
    await page.getByRole("button", { name: "Fix the trouble spot, bar 1" }).click();
    // The loop: bar 1 alone (E E F G), three clean in a row, then the tempo comes back.
    for (let k = 1; k <= 3; k++) {
      await expect(page.getByRole("status")).toContainText("Wait mode", { timeout: 6000 });
      await expect(page.getByText(/^Loop, bar 1$/)).toBeVisible();
      await play(
        page,
        ODE_NOTES.slice(0, 4).map((m, i) => ({ at: 100 + i * 160, notes: [m], hold: 80 })),
      );
      await expect(page.getByRole("status")).toContainText(
        k < 3 ? `Clean ${k} of 3` : "3 clean in a row. Back to full tempo",
        { timeout: 6000 },
      );
    }
    await shoot(page, "studio-fix-spot");
    await page.getByRole("button", { name: "End the loop" }).click();
    await expect(page.getByRole("status")).toContainText("Ended the loop");
    await expect(page.getByText("Setup:").locator("..")).toContainText("whole score");
  });

  test("chord finder: every ukulele Bb, the barre one opens in Build", async ({ page }) => {
    await page.goto("/music/library?tab=reference&section=fretted-chords");
    const section = page.locator("#fretted-chords");
    await section.getByRole("button", { name: "Ukulele", exact: true }).click();
    await choose(page, section.getByLabel("Root"), "Bb");
    const list = page.getByRole("list", { name: "Voicings of Bb" });
    await expect(list).toHaveAttribute("data-chord", "gen.ukulele.10.maj");
    const barre = list.locator('li[data-voicing="3 2 1 1"]');
    await expect(barre).toContainText("Barre at fret 1");
    await expect(barre).toContainText("Easier with a barre.");
    // Guitar F needs the barre outright.
    await section.getByRole("button", { name: "Guitar", exact: true }).click();
    await choose(page, section.getByLabel("Root"), "F");
    await expect(
      page.getByRole("list", { name: "Voicings of F" }).locator('li[data-voicing="1 3 3 2 1 1"]'),
    ).toContainText("Needs a barre");
    await shoot(page, "chord-finder");
    // Back to the ukulele Bb, into the Build drill at that position.
    await section.getByRole("button", { name: "Ukulele", exact: true }).click();
    await choose(page, section.getByLabel("Root"), "Bb");
    await list
      .locator('li[data-voicing="3 2 1 1"]')
      .getByRole("link", { name: "Practise" })
      .click();
    await expect(page.getByText("Setup:").locator("..")).toContainText("Bb, Bb major");
    await expect(page.getByText("Setup:").locator("..")).toContainText("Barre at fret 1");
  });

  test("song studio: views survive reload and Back", async ({ page }) => {
    await importOde(page);
    await openOde(page);
    const views = page.getByRole("navigation", { name: "Score view" });
    await views.getByRole("link", { name: "Tab" }).click();
    await expect(page).toHaveURL(/view=tab/);
    await expect(views.getByRole("link", { name: "Tab" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("region", { name: /^Tab,/ })).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("navigation", { name: "Score view" }).getByRole("link", { name: "Tab" }),
    ).toHaveAttribute("aria-current", "page");
    await page
      .getByRole("navigation", { name: "Score view" })
      .getByRole("link", { name: "Waterfall" })
      .click();
    await expect(page).toHaveURL(/view=waterfall/);
    await expect(
      page.getByRole("group", { name: "Piano keyboard under the waterfall" }),
    ).toBeVisible();
    await shoot(page, "studio-waterfall");
    await page.goBack();
    await expect(page).toHaveURL(/view=tab/);
    await expect(
      page.getByRole("navigation", { name: "Score view" }).getByRole("link", { name: "Tab" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("region", { name: /^Tab,/ })).toBeVisible();
  });

  test("song studio review: back, metronome, steady tab, sections, fitting, hand colours, delete", async ({
    page,
  }) => {
    await importOde(page);
    await page.getByLabel("Score file").setInputFiles("e2e/music/fixtures/low-riff.mid");
    await page.getByRole("button", { name: "Save to songs" }).click();
    await expect(page.getByText("low-riff is in your songs.")).toBeVisible();
    await openOde(page);

    // The metronome takes the song's tempo in one tap.
    const toSong = page.getByRole("button", { name: /^Set metronome to \d+ BPM$/ });
    const bpm = (await toSong.textContent())!.match(/\d+/)![0];
    await toSong.click();
    await expect(page.getByRole("status")).toContainText(`metronome is at ${bpm} BPM`);
    await expect(page.getByRole("button", { name: `Metronome at ${bpm} BPM` })).toBeDisabled();

    // Switching to Tab does not move the view picker.
    const views = page.getByRole("navigation", { name: "Score view" });
    const before = (await views.boundingBox())!;
    await views.getByRole("link", { name: "Tab" }).click();
    await expect(page.getByRole("region", { name: /^Tab,/ })).toBeVisible();
    const after = (await views.boundingBox())!;
    expect(Math.abs(after.y - before.y)).toBeLessThan(1);
    await expect(page.getByLabel("Tuning")).toBeVisible();

    // Picked sections are tinted and named on the score.
    await page.getByRole("button", { name: "Change setup" }).click();
    await page
      .getByRole("group", { name: "Range" })
      .getByRole("button", { name: "Sections" })
      .click();
    await page.getByRole("group", { name: "Sections" }).getByRole("button").first().click();
    await expect(page.locator(".tint-label").first()).toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();

    // Waterfall: beat lines, and the sounding key takes its hand's colour.
    await views.getByRole("link", { name: "Waterfall" }).click();
    await expect(page.locator(".beatline").first()).toBeAttached();
    await page.getByRole("button", { name: "Hear it" }).click();
    await expect(page.locator("[data-demo][data-role=right]").first()).toBeVisible({
      timeout: 5000,
    });
    await page.getByRole("button", { name: "Stop preview" }).click();

    // A low riff on a ukulele moves into range, and can be shown as written.
    await page.getByRole("link", { name: "Back to your songs" }).click();
    await expect(page).toHaveURL(/\/music\/library$/);
    await page
      .getByRole("link", { name: /low-riff/ })
      .first()
      .click();
    await expect(page.getByRole("heading", { level: 1, name: "low-riff" })).toBeVisible();
    await page.goto(page.url().split("?")[0] + "?view=tab");
    await choose(page, page.getByLabel("Tuning"), "Ukulele, High G");
    await expect(page.locator("[data-fit]")).toContainText("to fit the ukulele");
    await page.getByRole("button", { name: "Show as written" }).click();
    await expect(page.locator("[data-fit]")).toContainText("As written");
    await page.getByRole("button", { name: "Fit to the instrument" }).click();
    await shoot(page, "studio-fit");

    // Delete from the library takes two taps.
    await page.getByRole("link", { name: "Back to your songs" }).click();
    const songs = page.getByRole("list", { name: "Saved songs" });
    await songs.getByRole("button", { name: "Delete low-riff" }).click();
    await songs.getByRole("button", { name: "Delete low-riff? Tap again to delete" }).click();
    await expect(songs.getByRole("link", { name: /low-riff/ })).toHaveCount(0);
    await expect(songs.getByRole("link", { name: /Ode to Joy/ })).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("list", { name: "Saved songs" }).getByRole("link", { name: /low-riff/ }),
    ).toHaveCount(0);
  });
});

test.describe("jam and lab", () => {
  test.beforeEach(async ({ page }) => {
    await installFakeMidi(page, [PORTS.keys]);
    await page.setViewportSize({ width: 1280, height: 1000 });
    await seedSettings(page, { midiEnabledBefore: true, activeInstrument: "piano" });
  });

  test("jam: tone roles light, a chorus report, a logged session", async ({ page }) => {
    await page.goto("/music/jam?progression=pop-axis&backing=none&transpose=0&bpm=92");
    await expect(page.getByRole("heading", { level: 1, name: "Jam" })).toBeVisible();
    // Over C: E is a chord tone (filled), D a scale tone, F# an avoid note (dashed).
    await expect(page.locator('[data-midi="64"][data-role="chord"]')).toHaveCount(1);
    await expect(page.locator('[data-midi="62"][data-role="scale"]')).toHaveCount(1);
    await expect(page.locator('[data-midi="66"][data-role="avoid"]')).toHaveCount(1);
    await shoot(page, "jam");
    await page.getByRole("button", { name: /^Start jamming/ }).click();
    await expect(page.getByRole("status")).toContainText("Next chord");
    await play(page, [{ at: 0, notes: [64] }]);
    await expect(page.getByTestId("jam-last")).toContainText("chord tone");
    await play(page, [{ at: 0, notes: [66] }]);
    await expect(page.getByTestId("jam-last")).toContainText("avoid note");
    await page.getByRole("button", { name: /^Next chord/ }).click();
    await expect(page.getByTestId("jam-chord")).toHaveText("G");
    // Over G, B is the third.
    await expect(page.locator('[data-midi="71"][data-role="chord"]')).toHaveCount(1);
    await play(page, [{ at: 0, notes: [71] }]);
    await expect(page.getByTestId("jam-last")).toContainText("3 of G");
    for (let i = 0; i < 3; i++) await page.getByRole("button", { name: /^Next chord/ }).click();
    await expect(page.getByRole("status")).toContainText(
      "Chorus 1: 3 notes: 2 chord tones, 0 scale tones, 1 avoid note.",
    );
    await page.getByRole("button", { name: /^Stop/ }).click();
    await expect(page.getByRole("list", { name: "Chorus reports" })).toContainText("Chorus 1.");
    await expect(page.getByRole("status")).toContainText("logged in your journal");
    await expect(page.getByRole("button", { name: "Hear this chorus" })).toBeVisible();
    await shoot(page, "jam-results");
  });

  test("lab: a captured take persists across a reload", async ({ page }) => {
    await page.goto("/music/lab");
    await expect(page.getByRole("heading", { level: 1, name: "Practice lab" })).toBeVisible();
    await page.getByRole("button", { name: /^Start recording/ }).click();
    await expect(page.getByRole("status")).toContainText("Recording");
    await play(page, [
      { at: 0, notes: [60], hold: 300 },
      { at: 400, notes: [64], hold: 300 },
      { at: 800, notes: [67], hold: 500 },
    ]);
    await expect(page.getByText("Distinct")).toBeVisible();
    await shoot(page, "lab-running");
    await page.getByRole("button", { name: /^Stop/ }).click();
    await expect(page.getByText("Take saved: 3 notes")).toBeVisible();
    await expect(page.getByRole("status")).toContainText("Logged as free practice");
    await page.reload();
    await expect(page.getByRole("list", { name: "Recent takes" })).toContainText("3 notes");
    await shoot(page, "lab");
  });
});

for (const width of [375, 1280]) {
  test(`routes load without sideways scroll at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/music");
    await page.waitForLoadState("networkidle");
    await importOde(page);
    await page.goto("/music/library");
    const studio = (await page
      .getByRole("link", { name: /Ode to Joy/ })
      .first()
      .getAttribute("href"))!;
    for (const [path, h1, name] of [
      ["/music/library", "Library", "songs"],
      ["/music/library?tab=reference", "Library", "reference"],
      ["/music/library?tab=import", "Library", "import"],
      [studio, "Ode to Joy", "studio"],
      [`${studio}?view=waterfall`, "Ode to Joy", "studio-waterfall"],
      ["/music/jam", "Jam", "jam"],
      ["/music/lab", "Practice lab", "lab"],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: h1 })).toBeVisible();
      await expect(page).toHaveTitle(/\| Woodshed$/);
      await expectNoHorizontalOverflow(page);
      if (width === 375) await shoot(page, name);
    }
  });
}
