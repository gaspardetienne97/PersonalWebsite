// Ear training, note reading and sight-reading, rhythm: every route loads without
// overflow, and one run per input path goes start to results.
import { expect, test, type Page } from "@playwright/test";
import {
  expectNoHorizontalOverflow,
  installFakeMidi,
  installSyntheticMic,
  midiNote,
  PORTS,
} from "./fixtures";

// On a dev server a dependency re-optimisation (or another agent's edit) can reload the page mid-run.
test.describe.configure({ retries: 2 });

const SHOTS = "docs/screenshots/rebuild/ear-reading-rhythm";
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** MIDI re-opens on load once it was enabled before; seed that flag, then reload. */
async function enableMidi(page: Page, url: string) {
  await page.goto(url);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForTimeout(500);
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("woodshed");
        open.onsuccess = () => {
          const tx = open.result.transaction("settings", "readwrite");
          const store = tx.objectStore("settings");
          const get = store.get("music.settings");
          get.onsuccess = () => {
            const value = { ...get.result?.value, midiEnabledBefore: true, countInBars: 0 };
            store.put({ id: "music.settings", value });
          };
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
        open.onerror = () => reject(open.error);
      }),
  );
  await page.reload();
}

async function shots(page: Page, name: string) {
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(250);
    await expectNoHorizontalOverflow(page);
    for (const theme of ["light", "dark"] as const) {
      await page.evaluate(
        (t) => document.documentElement.classList.toggle("dark", t === "dark"),
        theme,
      );
      await page.screenshot({ path: `${SHOTS}/${name}-${width}-${theme}.png`, fullPage: true });
    }
  }
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  await page.setViewportSize({ width: 1280, height: 900 });
}

const prompt = (page: Page) => page.locator("article[data-drill]");

/** Put a recent-answers history in place, once the app has made its database. */
/** One clean run already behind ladder `id` at `step`: the next clean run moves on (progress/advance). */
async function seedAdvance(page: Page, id: string, step: number) {
  await page.goto("/music");
  await page.waitForLoadState("networkidle");
  await expect(async () => {
    await page.evaluate(
      ([key, value]) =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open("woodshed");
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            try {
              const tx = open.result.transaction("settings", "readwrite");
              tx.objectStore("settings").put({ id: key, value });
              tx.oncomplete = () => resolve();
              tx.onerror = () => reject(tx.error);
            } catch (e) {
              reject(e);
            } finally {
              open.result.close();
            }
          };
        }),
      ["advance.v1", { [id]: { at: `-|${step}`, passes: 1, fails: 0 } }] as const,
    );
  }).toPass({ timeout: 10_000 });
}
/** A saved song ("Test tune", a C major melody of twelve notes), once the app has made its database. */
async function seedSong(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("woodshed");
        open.onsuccess = () => {
          const tx = open.result.transaction("songs", "readwrite");
          const melody = [60, 62, 64, 65, 67, 65, 64, 62, 60, 64, 67, 72];
          tx.objectStore("songs").put({
            id: "song-test",
            title: "Test tune",
            createdAt: 1,
            updatedAt: 1,
            score: {
              id: "song-test",
              title: "Test tune",
              bpm: 90,
              meter: { beats: 4, beatUnit: 4 },
              keyFifths: 0,
              keyMode: "major",
              voices: [
                {
                  id: "v",
                  name: "Melody",
                  notes: melody.map((midi, i) => ({ midi, startBeat: i, durationBeats: 1 })),
                },
              ],
              lengthBeats: 12,
            },
          });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
}

async function waitStep(page: Page, step: string) {
  await expect(prompt(page)).toHaveAttribute("data-step", step, { timeout: 8000 });
}

test.describe("ear training", () => {
  test("every ear route loads with its h1 and no overflow", async ({ page }) => {
    for (const [slug, title] of [
      ["intervals", "Intervals"],
      ["interval-compare", "Interval comparison"],
      ["chord-qualities", "Chord qualities"],
      ["cadences", "Cadences"],
      ["chord-functions", "Chords in a key"],
      ["progressions", "Progression dictation"],
      ["song-loops", "Song loops"],
      ["scales", "Scales and modes"],
      ["inversions", "Inversions"],
      ["bass-lines", "Bass lines"],
      ["fine-pitch", "Fine pitch"],
      ["wrong-note", "Spot the wrong note"],
      ["scale-degrees", "Scale degrees"],
      ["melody-dictation", "Melody dictation"],
      ["repertoire-transfer", "Repertoire transfer"],
      ["mixed", "Ear training review"],
    ]) {
      await page.goto(`/music/ear/${slug}`);
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      for (const width of [375, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await expectNoHorizontalOverflow(page);
      }
    }
    await expect(page.getByRole("link", { name: "Import a score in the Library" })).toHaveCount(0);
    await page.goto("/music/ear/repertoire-transfer");
    await expect(page.getByRole("link", { name: "Import a score in the Library" })).toBeVisible();
    await page.goto("/music/ear/scale-degrees?answer=listen-along&level=anchor");
    await expect(page.getByText("Setup:").locator("..")).toContainText("Listen along, Anchor");
    await shots(page, "ear-scale-degrees-ready");
  });

  test("intervals by choice, practice feedback, to results with a confusion", async ({ page }) => {
    // All twelve (a new user starts on "First steps": M3, P5, P8).
    await page.goto("/music/ear/intervals?answer=choice&intervals=");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    for (let i = 0; i < 10; i++) {
      const card = prompt(page);
      await expect(card).toHaveAttribute("aria-label", `Question ${i + 1}`);
      const answer = (await card.getAttribute("data-answer"))!;
      const names: Record<string, string> = {
        m2: "Minor 2nd",
        M2: "Major 2nd",
        m3: "Minor 3rd",
        M3: "Major 3rd",
        P4: "Perfect 4th",
        TT: "Tritone",
        P5: "Perfect 5th",
        m6: "Minor 6th",
        M6: "Major 6th",
        m7: "Minor 7th",
        M7: "Major 7th",
        P8: "Octave",
      };
      const pick = i === 0 ? (answer === "P5" ? "Perfect 4th" : "Perfect 5th") : names[answer];
      // The picture shows only timing until the answer is in: no pitches, no arc.
      if (i === 0) {
        // Two bars for a melodic interval, one for a harmonic (both notes at once).
        expect(await card.locator("svg.ear-visual .shape").count()).toBeGreaterThan(0);
        await expect(card.locator("svg.ear-visual .note, svg.ear-visual .arc")).toHaveCount(0);
      }
      await page.locator("button.choice", { hasText: new RegExp(`^${pick}`) }).click();
      await waitStep(page, "feedback");
      if (i === 0) {
        // A wrong answer: both notes on the strip's instrument, the half steps counted, and the
        // chosen answer beside them, heard back to back.
        const reveal = card.getByTestId("ear-reveal");
        await expect(reveal).toContainText(`Played: ${names[answer]}, `);
        await expect(reveal).toContainText(" half steps");
        await expect(reveal).toContainText(`You chose: ${pick}, `);
        await expect(
          card.getByRole("button", { name: `Hear both again: ${names[answer]}, then ${pick}` }),
        ).toBeVisible();
        await expect(card).toContainText("Not quite. Compare the two.");
        await shots(page, "ear-intervals-feedback");
      }
      await page.getByRole("button", { name: i < 9 ? "Continue" : "See results" }).click();
    }
    await expect(page.getByRole("status")).toContainText("9 of 10 right");
    await expect(page.getByText("What you mixed up")).toBeVisible();
    // The mix-up as a square of the grid: played (row) against what was said (column).
    await expect(
      page.getByRole("button", { name: /^Played .*, you said .*, once\. Play both\.$/ }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /Practise my confusions/ })).toBeVisible();
    await shots(page, "ear-intervals-results");
  });

  test("interval comparison: which is bigger, with both intervals on the staff after", async ({
    page,
  }) => {
    await page.goto("/music/ear/interval-compare?answer=choice");
    await expect(
      page.getByRole("heading", { level: 1, name: "Interval comparison" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Start", exact: true }).click();
    const card = prompt(page);
    await expect(card).toContainText("Which interval was bigger?");
    const answer = (await card.getAttribute("data-answer"))!;
    const label = {
      first: "The first is bigger",
      second: "The second is bigger",
      same: "They are the same size",
    }[answer]!;
    await expect(page.locator("button.choice")).toHaveCount(2); // fresh: first or second, no "same" yet
    await page.locator("button.choice", { hasText: new RegExp(`^${label}`) }).click();
    await waitStep(page, "feedback");
    await expect(card).toContainText(`Right: ${label}`);
    // Each interval on its own staff, named underneath.
    const captions = card.locator("figure.staff-card figcaption");
    await expect(captions).toHaveCount(2);
    await expect(captions.nth(0)).toContainText("First: ");
    await expect(captions.nth(1)).toContainText("Second: ");
    await shots(page, "ear-interval-compare-feedback");
  });

  test("intervals: a set that feels easy offers the next interval", async ({ page }) => {
    // One clean run already on the First steps set.
    await seedAdvance(page, "ear.intervals.M3,P5,P8", 1);
    await page.goto("/music/ear/intervals?answer=choice&intervals=M3,P5,P8&direction=ascending");
    await page.getByRole("button", { name: "Check", exact: true }).click();
    await page.getByRole("button", { name: "Start", exact: true }).click();
    for (let i = 0; i < 10; i++) {
      const card = prompt(page);
      await expect(card).toHaveAttribute("aria-label", `Question ${i + 1}`);
      const answer = (await card.getAttribute("data-answer"))!;
      const name = { M3: "Major 3rd", P5: "Perfect 5th", P8: "Octave" }[answer]!;
      await page.locator("button.choice", { hasText: new RegExp(`^${name}`) }).click();
    }
    const next = page.getByTestId("next-run");
    await expect(next).toHaveAttribute("data-kind", "harder");
    await expect(next).toContainText("2 clean runs");
    // Results: a row per interval, this run only.
    await expect(page.getByText(/^\d+ of \d+$/).first()).toBeVisible();
    await page
      .getByTestId("drill-bar")
      .getByRole("button", { name: "Move on: the perfect 4th" })
      .click();
    // The next run starts with the 4th added.
    await expect(prompt(page)).toHaveAttribute("aria-label", "Question 1");
    await expect(page.locator("button.choice", { hasText: /^Perfect 4th/ })).toBeVisible();
  });

  test.describe("with lessons on", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("Move on to a new interval shows its lesson before the run", async ({ page }) => {
      await seedAdvance(page, "ear.intervals.M3,P5,P8", 1);
      await page.goto("/music/ear/intervals?answer=choice&intervals=M3,P5,P8&direction=ascending");
      await page.getByRole("button", { name: "Skip, I know this" }).click();
      await page.getByRole("button", { name: "Check", exact: true }).click();
      await page.getByRole("button", { name: "Start", exact: true }).click();
      for (let i = 0; i < 10; i++) {
        const card = prompt(page);
        await expect(card).toHaveAttribute("aria-label", `Question ${i + 1}`);
        const answer = (await card.getAttribute("data-answer"))!;
        const name = { M3: "Major 3rd", P5: "Perfect 5th", P8: "Octave" }[answer]!;
        await page.locator("button.choice", { hasText: new RegExp(`^${name}`) }).click();
      }
      await page.getByRole("button", { name: "Move on: the perfect 4th" }).click();
      await expect(page.getByRole("heading", { name: "Perfect 4th", exact: true })).toBeVisible();
      await expect(prompt(page)).toHaveCount(0);
      await page.getByRole("button", { name: "Start the quiz" }).click();
      // The results come back, with the set already moved on.
      await page.getByRole("button", { name: "Again", exact: true }).click();
      await expect(prompt(page)).toHaveAttribute("aria-label", "Question 1");
      await expect(page.locator("button.choice", { hasText: /^Perfect 4th/ })).toBeVisible();
    });
  });

  test("chords, cadences and degrees: a wrong answer is shown and played beside the right one", async ({
    page,
  }) => {
    // Chord qualities start on major and minor; a set picks more.
    await page.goto("/music/ear/chord-qualities?answer=choice");
    await page.getByRole("button", { name: "Setup", exact: true }).click();
    await expect(
      page
        .getByRole("group", { name: "Quality sets" })
        .getByRole("button", { name: "Major and minor" }),
    ).toHaveAttribute("aria-pressed", "true");
    await page
      .getByRole("group", { name: "Quality sets" })
      .getByRole("button", { name: "Triads" })
      .click();
    await expect(page.getByText("Setup:").locator("..")).toContainText("triads");
    await page
      .getByRole("group", { name: "Quality sets" })
      .getByRole("button", { name: "Major and minor" })
      .click();
    await page.getByRole("button", { name: "Start", exact: true }).click();
    let card = prompt(page);
    const chord = (await card.getAttribute("data-answer"))!;
    await expect(page.locator("button.choice")).toHaveCount(2);
    const wrongChord = chord === "major" ? "Minor" : "Major";
    await page.locator("button.choice", { hasText: new RegExp(`^${wrongChord}`) }).click();
    await waitStep(page, "feedback");
    // On the strip's instrument: the chord played, the chosen one's other note dashed.
    const reveal = card.getByTestId("ear-reveal");
    await expect(reveal).toContainText(`Played: ${chord === "major" ? "Major" : "Minor"}: `);
    await expect(reveal).toContainText(`You chose: ${wrongChord}: `);
    await expect(card.getByRole("button", { name: /^Hear both again: / })).toBeVisible();
    await shots(page, "ear-chord-mistake");

    // Cadences: in the same key.
    await page.goto("/music/ear/cadences?answer=choice");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    card = prompt(page);
    const cadence = (await card.getAttribute("data-answer"))!;
    const other = cadence === "authentic" ? "Plagal" : "Authentic";
    await page.locator("button.choice", { hasText: new RegExp(`^${other}`) }).click();
    await waitStep(page, "feedback");
    const captions = card.locator("figure.staff-card figcaption");
    await expect(captions.nth(1)).toContainText(
      `You chose: ${other}, ${other === "Plagal" ? "IV to I" : "V to I"}`,
    );

    // Scale degrees: over the same tonic, as pictures with their captions.
    await page.goto("/music/ear/scale-degrees?answer=choice&level=major-diatonic");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    card = prompt(page);
    const degree = (await card.getAttribute("data-answer"))!;
    const wrongDegree = degree === "5" ? "4" : "5";
    await page
      .getByRole("group", { name: "Scale degrees" })
      .getByRole("button", { name: new RegExp(`^${wrongDegree} `) })
      .click();
    await waitStep(page, "feedback");
    await expect(card.getByText(/^Played: /)).toBeVisible();
    await expect(card.getByText(new RegExp(`^You chose: ${wrongDegree}`))).toBeVisible();
  });

  test("cadences: start on authentic and plagal, pick a set", async ({ page }) => {
    await page.goto("/music/ear/cadences?answer=choice");
    await page.getByRole("button", { name: "Setup", exact: true }).click();
    const sets = page.getByRole("group", { name: "Cadence sets" });
    await expect(sets.getByRole("button", { name: "Authentic and plagal" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.getByRole("button", { name: "Half", exact: true }).click();
    await expect(page.getByText("Setup:").locator("..")).toContainText(
      "authentic, plagal and half",
    );
    await sets.getByRole("button", { name: "Authentic and plagal" }).click();
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(page.locator("button.choice")).toHaveCount(2);
    expect(["authentic", "plagal"]).toContain(await prompt(page).getAttribute("data-answer"));
  });

  test("chords in a key: I, IV and V to start, a wrong chord shown in the same key", async ({
    page,
  }) => {
    await page.goto("/music/ear/chord-functions?answer=choice");
    await page.getByRole("button", { name: "Setup", exact: true }).click();
    await expect(
      page
        .getByRole("group", { name: "Chord sets" })
        .getByRole("button", { name: "Primary three" }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    const card = prompt(page);
    await expect(card).toContainText(
      /Key of \S+ major, set once with I, IV, V, I: one chord a question/,
    );
    const chord = (await card.getAttribute("data-answer"))!;
    expect(["I", "IV", "V"]).toContain(chord);
    await expect(page.locator("button.choice")).toHaveCount(3);
    const wrong = chord === "IV" ? "V" : "IV";
    await page.locator("button.choice", { hasText: new RegExp(`^\\s*${wrong}\\s*$`) }).click();
    await waitStep(page, "feedback");
    const captions = card.locator("figure.staff-card figcaption");
    await expect(captions).toHaveCount(2);
    await expect(captions.nth(0)).toContainText(new RegExp(`^Played: ${chord} in \\S+ major: `));
    await expect(captions.nth(1)).toContainText(new RegExp(`^You chose: ${wrong} in \\S+ major: `));
    await expect(card.getByRole("button", { name: /^Hear both again: / })).toBeVisible();
    await shots(page, "ear-chord-function-mistake");

    // A minor key with sevenths: i7, iv7 and V7, named and drawn in the minor key.
    await page.goto("/music/ear/chord-functions?answer=choice&keyMode=minor&chordSize=sevenths");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(card).toContainText(
      /Key of \S+ minor, set once with i, iv, V, i: one chord a question/,
    );
    await expect(page.locator("button.choice")).toHaveText([/i7/, /iv7/, /V7/]);
    const minorAnswer = (await card.getAttribute("data-answer"))!;
    expect(["m:I7", "m:IV7", "m:V7"]).toContain(minorAnswer);
    const right = { "m:I7": "i7", "m:IV7": "iv7", "m:V7": "V7" }[minorAnswer]!;
    await page.locator("button.choice", { hasText: new RegExp(`^\\s*${right}\\s*$`) }).click();
    await waitStep(page, "feedback");
    await expect(card).toContainText(`Right: ${right}.`);
    await expect(card.locator("figure.staff-card figcaption")).toContainText(
      new RegExp(`^${right} in \\S+ minor: `),
    );
    await shots(page, "ear-chord-function-minor-sevenths");
  });

  test("progressions: tap the chords after I into slots, judged chord by chord", async ({
    page,
  }) => {
    await page.goto("/music/ear/progressions?answer=choice");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    const card = prompt(page);
    const chords = (await card.getAttribute("data-answer"))!.split(" ");
    expect(chords[0]).toBe("I");
    const slots = page.getByRole("list", { name: "Your progression" }).getByRole("listitem");
    await expect(slots).toHaveCount(chords.length);
    await expect(slots.nth(0)).toHaveText("I");
    const tap = (t: string) =>
      page.locator("button.choice", { hasText: new RegExp(`^${t}$`) }).click();

    // A tap fills the next slot; Undo takes it back.
    await tap("IV");
    await expect(slots.nth(1)).toHaveText("IV");
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(slots.nth(1)).toHaveText("?");

    // Right until the last chord, then a wrong one.
    for (const c of chords.slice(1, -1)) await tap(c);
    const last = chords.at(-1)!;
    await tap(last === "V" ? "IV" : "V");
    await waitStep(page, "feedback");
    await expect(slots.nth(1)).toHaveAttribute("data-state", chords.length > 2 ? "right" : "wrong");
    await expect(slots.last()).toHaveAttribute("data-state", "wrong");
    await expect(slots.last()).toContainText(`✕ ${last}`);
    await expect(card.locator("figure.staff-card figcaption").nth(1)).toContainText(
      /^You chose: I, /,
    );
    await shots(page, "ear-progression-mistake");
  });

  test("scales and modes: major and minor first, a wrong scale heard beside the right one", async ({
    page,
  }) => {
    await page.goto("/music/ear/scales?answer=choice");
    await page.getByRole("button", { name: "Setup", exact: true }).click();
    const sets = page.getByRole("group", { name: "Scale sets" });
    await expect(sets.getByRole("button", { name: "Major and minor" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.getByRole("button", { name: "Start", exact: true }).click();
    const card = prompt(page);
    await expect(card).toContainText(/Tonic \S+, held underneath/);
    const scale = (await card.getAttribute("data-answer"))!;
    expect(["major", "natural-minor"]).toContain(scale);
    await expect(page.locator("button.choice")).toHaveCount(2);
    const wrong = scale === "major" ? "Natural minor" : "Major";
    await page.locator("button.choice", { hasText: new RegExp(`^\\s*${wrong}\\s*$`) }).click();
    await waitStep(page, "feedback");
    await expect(card.getByText(/^Played: (Major|Natural minor)$/)).toBeVisible();
    await expect(card.getByText(`You chose: ${wrong}`)).toBeVisible();
    await shots(page, "ear-scales-mistake");

    // Another set narrows the answers to it.
    await page.goto(
      "/music/ear/scales?answer=choice&scales=major-pentatonic,minor-pentatonic,blues",
    );
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(page.locator("button.choice")).toHaveCount(3);
    expect(["major-pentatonic", "minor-pentatonic", "blues"]).toContain(
      await prompt(page).getAttribute("data-answer"),
    );
  });

  test("inversions: root and first to start, the chosen bass shown beside the right one, and by play-back", async ({
    page,
  }) => {
    await page.goto("/music/ear/inversions?answer=choice");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    const card = prompt(page);
    const inv = (await card.getAttribute("data-answer"))!;
    expect(["root", "first"]).toContain(inv);
    await expect(page.locator("button.choice")).toHaveCount(2);
    const wrong = inv === "root" ? "First inversion" : "Root position";
    await page.locator("button.choice", { hasText: new RegExp(`^\\s*${wrong}\\s*$`) }).click();
    await waitStep(page, "feedback");
    const reveal = card.getByTestId("ear-reveal");
    await expect(reveal).toContainText(
      new RegExp(
        `Played: ${inv === "root" ? "Root position" : "First inversion"}: .*, \\S+ in the bass`,
      ),
    );
    await expect(reveal).toContainText(new RegExp(`You chose: ${wrong}: `));
    await shots(page, "ear-inversion-mistake");

    await installFakeMidi(page, [PORTS.keys]);
    await enableMidi(page, "/music/ear/inversions?answer=play-back");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await waitStep(page, "answer");
    const notes = (await card.getAttribute("data-expected"))!.split(",").map(Number);
    for (const m of notes.slice(1)) await midiNote(page, PORTS.keys.id, m);
    await waitStep(page, "feedback");
    await expect(card).toContainText("Right:");
  });

  test("bass lines: write the bass by degree, by tapping and by playing it", async ({ page }) => {
    await page.goto("/music/ear/bass-lines?answer=choice");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    const card = prompt(page);
    const bass = (await card.getAttribute("data-answer"))!.split(" ");
    expect(bass[0]).toBe("1");
    expect(bass.every((d) => ["1", "4", "5"].includes(d))).toBe(true);
    const slots = page.getByRole("list", { name: "Your progression" }).getByRole("listitem");
    const tap = (d: string) =>
      page.locator("button.choice", { hasText: new RegExp(`^\\s*${d}\\s*$`) }).click();
    for (const d of bass.slice(1, -1)) await tap(d);
    await tap(bass.at(-1) === "5" ? "4" : "5");
    await waitStep(page, "feedback");
    await expect(slots.last()).toHaveAttribute("data-state", "wrong");
    await expect(card.locator("figure.staff-card figcaption")).toContainText(
      `Bass ${bass.join(", ")}: I, `,
    );
    await shots(page, "ear-bass-line");

    // Lines through inversions offer every degree; played back over MIDI, note by note.
    await installFakeMidi(page, [PORTS.keys]);
    await enableMidi(page, "/music/ear/bass-lines?answer=play-back&bassLevel=inversions");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await waitStep(page, "answer");
    const key = Number(await card.getAttribute("data-key"));
    const line = (await card.getAttribute("data-answer"))!.split(" ");
    const MAJOR = [0, 2, 4, 5, 7, 9, 11];
    for (const d of line.slice(1))
      await midiNote(page, PORTS.keys.id, 48 + ((key + MAJOR[Number(d) - 1]) % 12));
    await waitStep(page, "feedback");
    await expect(card).toContainText("Right:");
  });

  test("spot the wrong note in phrases from a saved song", async ({ page }) => {
    await page.goto("/music/ear/wrong-note?source=songs");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForTimeout(500);
    await seedSong(page);
    await page.reload();
    await page.getByRole("button", { name: "Start", exact: true }).click();
    const card = prompt(page);
    await waitStep(page, "answer");
    await expect(card).toContainText("from Test tune");
    const k = (await card.getAttribute("data-answer"))!;
    await page.getByRole("button", { name: new RegExp(`^Note ${k}, written`) }).click();
    await waitStep(page, "feedback");
    await expect(card).toContainText(`Right: Note ${k}.`);
  });

  test("fine pitch: two right step down to fewer cents, a miss steps back", async ({ page }) => {
    await page.goto("/music/ear/fine-pitch?startCents=50");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    const card = prompt(page);
    const answerIt = async (right: boolean) => {
      await waitStep(page, "answer");
      const a = (await card.getAttribute("data-answer"))!;
      const pickLabel = right ? a : a === "higher" ? "lower" : "higher";
      const label = { higher: "Higher", lower: "Lower", same: "In tune" }[pickLabel]!;
      await page.locator("button.choice", { hasText: new RegExp(`^\\s*${label}\\s*$`) }).click();
      await waitStep(page, "feedback");
      await page.getByRole("button", { name: "Continue" }).click();
    };
    await expect(card).toContainText("50 cents off");
    await answerIt(true);
    await expect(card).toContainText("50 cents off");
    await answerIt(true);
    await expect(card).toContainText("35 cents off");
    await answerIt(false);
    await expect(card).toContainText("50 cents off");
    await shots(page, "ear-fine-pitch");
  });

  test("spot the wrong note: tap the written note that sounded different", async ({ page }) => {
    await page.goto("/music/ear/wrong-note");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    const card = prompt(page);
    await waitStep(page, "answer");
    const written = page.getByRole("list", { name: "The melody as written" }).getByRole("button");
    await expect(written).toHaveCount(4);
    const wrongAt = (await card.getAttribute("data-answer"))!;
    // Tap a note that was played right first.
    const other = wrongAt === "2" ? "3" : "2";
    await page.getByRole("button", { name: new RegExp(`^Note ${other}, written`) }).click();
    await waitStep(page, "feedback");
    await expect(card).toContainText(`It was Note ${wrongAt}. You answered Note ${other}.`);
    await expect(
      page.getByRole("button", { name: new RegExp(`^Note ${wrongAt}, written`) }),
    ).toContainText("✓ wrong");
    await shots(page, "ear-wrong-note");
    await page.getByRole("button", { name: "Continue" }).click();
    await waitStep(page, "answer");
    const next = (await card.getAttribute("data-answer"))!;
    await page.getByRole("button", { name: new RegExp(`^Note ${next}, written`) }).click();
    await waitStep(page, "feedback");
    await expect(card).toContainText(`Right: Note ${next}.`);
  });

  test("scale degrees: an easy level offers the next one", async ({ page }) => {
    await seedAdvance(page, "ear.scale-degrees.level", 0);
    await page.goto("/music/ear/scale-degrees?answer=choice&level=anchor");
    await page.getByRole("button", { name: "Check", exact: true }).click();
    await page.getByRole("button", { name: "Start", exact: true }).click();
    for (let i = 0; i < 10; i++) {
      const card = prompt(page);
      await expect(card).toHaveAttribute("aria-label", `Question ${i + 1}`);
      const degree = (await card.getAttribute("data-answer"))!;
      await page
        .getByRole("group", { name: "Scale degrees" })
        .getByRole("button", { name: new RegExp(`^${degree} `) })
        .click();
    }
    const next = page.getByTestId("next-run");
    await expect(next).toHaveAttribute("data-kind", "harder");
    await page
      .getByTestId("drill-bar")
      .getByRole("button", { name: "Move on: Major pentachord" })
      .click();
    // The next run starts at the new level, with 2 and 4 to answer.
    await expect(prompt(page)).toHaveAttribute("aria-label", "Question 1");
    await expect(
      page.getByRole("group", { name: "Scale degrees" }).getByRole("button", { name: /^4 / }),
    ).toBeVisible();
  });

  test("intervals: practise a few at a time, in one direction", async ({ page }) => {
    await page.goto("/music/ear/intervals?answer=choice");
    await page.getByRole("button", { name: "Setup", exact: true }).click();
    const sets = page.getByRole("group", { name: "Interval sets" });
    await sets.getByRole("button", { name: "Perfect" }).click();
    await expect(sets.getByRole("button", { name: "Perfect" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // The single intervals sit behind "Pick your own".
    await page.getByText("Pick your own").click();
    await expect(page.getByRole("button", { name: "Perfect unison", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // Take the octave out by its chip; at least one always stays on.
    await page.getByRole("button", { name: "Octave", exact: true }).click();
    await expect(page.getByRole("button", { name: "Octave", exact: true })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await page
      .getByRole("group", { name: "Direction" })
      .getByRole("button", { name: "Down" })
      .click();
    await expect(page.getByText("Setup:").locator("..")).toContainText(
      "3 intervals, Perfect unison to Perfect 5th, down",
    );
    await shots(page, "ear-intervals-setup");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    for (let i = 0; i < 3; i++) {
      const card = prompt(page);
      await expect(card).toHaveAttribute("aria-label", `Question ${i + 1}`);
      expect(["P1", "P4", "P5"]).toContain(await card.getAttribute("data-answer"));
      const [a, b] = (await card.getAttribute("data-expected"))!.split(",").map(Number);
      expect(a).toBeGreaterThanOrEqual(b); // down (or the same note)
      await expect(page.locator("button.choice")).toHaveCount(3);
      await page.locator("button.choice").first().click();
      await waitStep(page, "feedback");
      await page.getByRole("button", { name: "Continue" }).click();
    }
  });

  test("scale degrees by play-back over fake MIDI, in check", async ({ page }) => {
    // Ten full questions after the key cadence.
    test.setTimeout(60_000);
    await installFakeMidi(page, [PORTS.keys]);
    await enableMidi(page, "/music/ear/scale-degrees?answer=play-back&level=major-diatonic");
    await page.getByRole("button", { name: "Check", exact: true }).click();
    await page.getByRole("button", { name: "Start", exact: true }).click();
    for (let i = 0; i < 10; i++) {
      await expect(prompt(page)).toHaveAttribute("aria-label", `Question ${i + 1}`);
      await waitStep(page, "answer");
      const target = Number(await prompt(page).getAttribute("data-expected"));
      if (i === 3) await shots(page, "ear-degrees-playback");
      await midiNote(page, PORTS.keys.id, target + 12);
      if (i < 9)
        await expect(prompt(page)).toHaveAttribute("aria-label", `Question ${i + 2}`, {
          timeout: 5000,
        });
    }
    await expect(page.getByRole("status")).toContainText("All 10 right.", { timeout: 8000 });
    await shots(page, "ear-degrees-results");
  });

  test("chords in a key and progressions by play-back over fake MIDI, and both in the mix", async ({
    page,
  }) => {
    await installFakeMidi(page, [PORTS.keys]);
    // Chords in a key: the chord asked, played an octave up in first inversion.
    await enableMidi(page, "/music/ear/chord-functions?answer=play-back");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await waitStep(page, "answer");
    const [, root, third, fifth] = (await prompt(page).getAttribute("data-expected"))!
      .split(",")
      .map(Number);
    for (const m of [third, fifth, root + 12]) await midiNote(page, PORTS.keys.id, m);
    await waitStep(page, "feedback");
    await expect(prompt(page)).toContainText("Right:");

    // Progressions: each chord fills the next slot; the last one is played wrong.
    await page.goto("/music/ear/progressions?answer=play-back");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await waitStep(page, "answer");
    const key = Number(await prompt(page).getAttribute("data-key"));
    const chords = (await prompt(page).getAttribute("data-answer"))!.split(" ");
    const MAJOR = [0, 2, 4, 5, 7, 9, 11];
    const DEGREE: Record<string, number> = { I: 0, ii: 1, iii: 2, IV: 3, V: 4, vi: 5, vii: 6 };
    const play = async (c: string) => {
      const d = DEGREE[c];
      for (const k of [0, 2, 4])
        await midiNote(page, PORTS.keys.id, 60 + ((key + MAJOR[(d + k) % 7]) % 12));
    };
    const slots = page.getByRole("list", { name: "Your progression" }).getByRole("listitem");
    for (const [i, c] of chords.slice(1, -1).entries()) {
      await play(c);
      await expect(slots.nth(i + 1)).toHaveText(c);
    }
    const last = chords.at(-1)!;
    await play(last === "V" ? "IV" : "V");
    await waitStep(page, "feedback");
    await expect(slots.nth(1)).toHaveAttribute("data-state", "right");
    await expect(slots.last()).toHaveAttribute("data-state", "wrong");

    // The mixed review draws from all six drills.
    await page.goto("/music/ear/mixed?answer=choice");
    await expect(page.getByText("Setup:").locator("..")).toContainText("all nine drills");
  });

  test("scale degrees by voice through the synthetic mic", async ({ page }) => {
    // Ten full questions after the key cadence.
    test.setTimeout(60_000);
    await installSyntheticMic(page, 0);
    await page.goto("/music/ear/scale-degrees?answer=voice&level=anchor");
    await page.getByRole("button", { name: "Check", exact: true }).click();
    await page.getByRole("button", { name: "Start", exact: true }).click();
    for (let i = 0; i < 10; i++) {
      await expect(prompt(page)).toHaveAttribute("aria-label", `Question ${i + 1}`, {
        timeout: 8000,
      });
      await page.evaluate(() => (window as any).__mic.set(0));
      await waitStep(page, "answer");
      const target = Number(await prompt(page).getAttribute("data-expected"));
      await page.evaluate((f) => (window as any).__mic.set(f, 0.4), hz(target));
      if (i === 0) await shots(page, "ear-voice");
    }

    await expect(page.getByRole("status")).toContainText("All 10 right.");
  });

  test("intervals and melodies sung back through the synthetic mic, in any octave", async ({
    page,
  }) => {
    // The melody's key is set with I, IV, V, I first, as in the other drills in a key.
    test.setTimeout(60_000);
    await installSyntheticMic(page, 0);
    await page.goto("/music/ear/intervals?answer=voice&intervals=M3,P5,P8&direction=ascending");
    await page.getByRole("button", { name: "Check", exact: true }).click();
    await page.getByRole("button", { name: "Start", exact: true }).click();
    for (let i = 0; i < 10; i++) {
      await expect(prompt(page)).toHaveAttribute("aria-label", `Question ${i + 1}`, {
        timeout: 8000,
      });
      await page.evaluate(() => (window as any).__mic.set(0));
      await waitStep(page, "answer");
      const [, second] = (await prompt(page).getAttribute("data-expected"))!.split(",").map(Number);
      // An octave down, the way a lower voice sings it.
      await page.evaluate((f) => (window as any).__mic.set(f, 0.4), hz(second - 12));
      if (i === 0) await shots(page, "ear-interval-voice");
    }
    await expect(page.getByRole("status")).toContainText("All 10 right.");

    // A melody, note by note.
    await page.goto("/music/ear/melody-dictation?answer=voice&level=major-pentachord");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await waitStep(page, "answer");
    const notes = (await prompt(page).getAttribute("data-expected"))!.split(",").map(Number);
    for (const [i, m] of notes.entries()) {
      await page.evaluate((f) => (window as any).__mic.set(f, 0.4), hz(m));
      if (i < notes.length - 1) {
        await expect(page.getByText(/^\s*Sung: /)).toContainText(
          new RegExp(
            `Sung: ${Array(i + 1)
              .fill("[^,]+ / [^,]+") // a degree and its syllable, never "nothing yet"
              .join(", ")}\\s*(Start over)?$`,
          ),
          { timeout: 10_000 }, // the microphone locks slower when the machine is busy
        );
        await page.evaluate(() => (window as any).__mic.set(0));
        await page.waitForTimeout(500);
      }
    }
    await waitStep(page, "feedback");
    await expect(prompt(page)).toContainText("Right:");
  });

  test("a tighter singing tolerance marks a note sung 40 cents sharp out of tune", async ({
    page,
  }) => {
    await installSyntheticMic(page, 0);
    await page.goto(
      "/music/ear/intervals?answer=voice&intervals=P5,P8&direction=ascending&tune=25",
    );
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await waitStep(page, "answer");
    const [, second] = (await prompt(page).getAttribute("data-expected"))!.split(",").map(Number);
    await page.evaluate((f) => (window as any).__mic.set(f, 0.4), hz(second + 0.4));
    await waitStep(page, "feedback");
    // The detector reads within a cent or so.
    await expect(prompt(page)).toContainText(/out of tune, (39|40|41) cents sharp/);
    await expect(page.locator(".voice")).toContainText(
      /Last note: (39|40|41) cents sharp, within 25 counts\./,
    );
  });

  test("cadences by pocket recall record self-rated answers", async ({ page }) => {
    await page.goto("/music/ear/cadences?answer=listen");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    for (let i = 0; i < 10; i++) {
      await expect(prompt(page)).toHaveAttribute("aria-label", `Question ${i + 1}`);
      await expect(prompt(page)).toContainText(/Key of/);
      await page.getByRole("button", { name: "Reveal answer" }).click();
      await page.getByRole("button", { name: i === 0 ? "Missed it" : "Heard it" }).click();
    }
    await expect(page.getByRole("status")).toContainText("9 of 10 heard");
    await expect(page.locator("article").first()).toContainText("doesn't move your skill scores");
    await shots(page, "ear-cadences-pocket-results");
  });

  test("repertoire transfer lifts phrases from a saved song and grades a played phrase", async ({
    page,
  }) => {
    await installFakeMidi(page, [PORTS.keys]);
    await enableMidi(page, "/music/ear/repertoire-transfer?level=full-current");
    await seedSong(page);
    await page.reload();
    await expect(page.getByText("Test tune").first()).toBeVisible();
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await waitStep(page, "answer");
    const expected = (await prompt(page).getAttribute("data-expected"))!.split(",").map(Number);
    for (const m of expected) await midiNote(page, PORTS.keys.id, m, 100, 1, 60);
    await waitStep(page, "feedback");
    await expect(prompt(page).getByRole("list", { name: "The phrase" })).toBeVisible();
    await expect(prompt(page)).toContainText("Right");
    await shots(page, "ear-repertoire-feedback");
  });
});

test.describe("note reading and sight-reading", () => {
  test("both activities load with their h1 and no overflow", async ({ page }) => {
    await page.goto("/music/reading");
    await expect(page.getByRole("heading", { level: 1, name: "Note reading" })).toBeVisible();
    await shots(page, "reading-flashcards-ready");
    await page.goto(
      "/music/reading?activity=sight-reading&instrument=piano&clefs=treble,bass&level=level-2",
    );
    await expect(page.getByRole("heading", { level: 1, name: "Sight-reading" })).toBeVisible();
    await expect(page.locator(".paper-wrap svg").first()).toBeVisible({ timeout: 10_000 });
    await shots(page, "reading-sight-piano-ready");
    await page.goto("/music/reading?activity=sight-reading&instrument=guitar");
    await expect(page.getByRole("button", { name: "Show tab" })).toBeVisible();
    await expect(page.locator("#sight-tab")).toHaveCount(0);
    await page.getByRole("button", { name: "Show tab" }).click();
    await expect(page.locator("#sight-tab")).toBeVisible();
    await shots(page, "reading-sight-guitar-tab");
  });

  test("flashcards by play over fake MIDI, with a wrong answer shown beside the right one", async ({
    page,
  }) => {
    await installFakeMidi(page, [PORTS.keys]);
    await enableMidi(
      page,
      "/music/reading?activity=flashcards&instrument=piano&answer=play&clefs=treble&low=60&high=72",
    );
    await page.getByRole("button", { name: "Check", exact: true }).click();
    await page.getByRole("button", { name: "Start", exact: true }).click();
    const card = page.locator(".card[data-midi]");
    for (let i = 0; i < 10; i++) {
      await expect(page.getByRole("status")).toContainText(`Card ${i + 1} of 10`, {
        timeout: 5000,
      });
      const midi = Number(await card.getAttribute("data-midi"));
      await midiNote(page, PORTS.keys.id, i === 0 ? midi + 1 : midi);
      if (i === 0) {
        await expect(card).toContainText("You played");
        await shots(page, "reading-flashcards-wrong");
        // A miss stays on screen until Next, which has focus so Enter moves on.
        await page.waitForTimeout(2500);
        await expect(card).toHaveAttribute("data-state", "wrong");
        await expect(page.getByRole("button", { name: "Next card" })).toBeFocused();
        await page.keyboard.press("Enter");
      }
    }
    await expect(page.getByRole("status")).toContainText("9 of 10 read right", { timeout: 8000 });
    await expect(
      page.getByRole("button", { name: /Practice the notes you missed \(1\)/ }),
    ).toBeVisible();
    await shots(page, "reading-flashcards-results");
  });

  test("sight-reading in wait mode over fake MIDI to results", async ({ page }) => {
    await installFakeMidi(page, [PORTS.keys]);
    await enableMidi(
      page,
      "/music/reading?activity=sight-reading&instrument=piano&follower=wait&level=primer&measures=1&clefs=treble",
    );
    await page.getByRole("button", { name: "Start", exact: true }).click();
    const paper = page.locator(".paper-wrap[data-expected]");
    await expect(paper).not.toHaveAttribute("data-group", "-1");
    for (let i = 0; i < 16; i++) {
      const expected = (await paper.getAttribute("data-expected")) ?? "";
      if (!expected) break;
      if (i === 0) await midiNote(page, PORTS.keys.id, Number(expected.split(",")[0]) + 2);
      if (i === 1) await shots(page, "reading-sight-running");
      for (const m of expected.split(","))
        await midiNote(page, PORTS.keys.id, Number(m), 100, 1, 60);
      await page.waitForTimeout(120);
    }
    await expect(page.getByRole("status")).toContainText(/right first time/, { timeout: 8000 });
    await expect(page.getByTestId("next-run")).toBeVisible();
    await expect(page.getByRole("button", { name: /Practice the notes you missed/ })).toBeVisible();
    await shots(page, "reading-sight-results");
  });

  test("the level climb: a missed phrase is a strike, the next phrase stays on the rung", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await installFakeMidi(page, [PORTS.keys]);
    await enableMidi(
      page,
      "/music/reading?activity=sight-reading&instrument=piano&climb=1&follower=performance&measures=4&level=level-1&key=G%20major&clefs=treble",
    );
    await expect(page.getByText("Setup:").locator("..")).toContainText(
      "Level climb from Level 1, G major",
    );
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(page.getByText("Rung").locator("..")).toContainText("3 of 43");
    // One wrong note and nothing else: heard, 0%, strike one (a silent run is not scored).
    await page.waitForTimeout(1500);
    await midiNote(page, PORTS.keys.id, 30);
    await expect(page.getByRole("status")).toContainText("strike 1 of 3", { timeout: 30_000 });
    await expect(page.locator("article").first()).toContainText(
      "rung 3 of 43, 1 of 3 strikes, 1 phrase",
    );
    await shots(page, "reading-climb-strike");
    // A part phrase cannot count toward the climb.
    await expect(page.getByRole("button", { name: /Practice the notes you missed/ })).toHaveCount(
      0,
    );
    await page.getByRole("button", { name: "Next phrase" }).click();
    await expect(page.getByText("Strikes").locator("..")).toContainText("1 of 3");
  });
});

test.describe("rhythm", () => {
  test("both modes load with no overflow", async ({ page }) => {
    await page.goto("/music/rhythm");
    await expect(page.getByRole("heading", { level: 1, name: "Rhythm" })).toBeVisible();
    await shots(page, "rhythm-pulse-ready");
    await page.goto("/music/rhythm?mode=read-and-tap&pattern=guitar-island-strum&bpm=84");
    await expect(page.getByText("Setup:").locator("..")).toContainText("Guitar: island strum");
    // Read and tap writes the pattern out: one engraved note per stroke, four bars of seven.
    await expect(page.getByTestId("rhythm-notation").locator("[data-event]")).toHaveCount(28);
    await shots(page, "rhythm-strum-ready");
  });

  test("strumming: Old Faithful clean twice offers a faster run", async ({ page }) => {
    test.setTimeout(90_000);
    await installFakeMidi(page, [PORTS.keys]);
    await enableMidi(page, "/music/rhythm?mode=read-and-tap&pattern=guitar-old-faithful&bpm=80");
    await expect(page.getByText("Setup:").locator("..")).toContainText("Old Faithful");
    const strokes = [0, 1, 1.5, 2.5, 3, 3.5];
    const chords = [
      [55, 59, 62], // G
      [48, 52, 55], // C
      [50, 54, 57], // D
      [55, 59, 62], // G
    ];
    const stage = page.locator("[data-beat-ms]");
    for (let run = 1; run <= 2; run++) {
      const before = await stage.getAttribute("data-downbeat");
      await page.getByRole("button", { name: run === 1 ? "Start" : "Again", exact: true }).click();
      // The page sets its downbeat a moment after the phase changes: wait for the new one.
      await expect
        .poll(async () => {
          const v = await stage.getAttribute("data-downbeat");
          return v !== null && v !== before && Number(v) > 0;
        })
        .toBe(true);
      const downbeat = Number(await stage.getAttribute("data-downbeat"));
      await page.evaluate(
        ({ port, strokes, chords, downbeat }) => {
          const midi = (window as any).__midi;
          const beat = 60000 / 80;
          chords.forEach((notes, bar) =>
            strokes.forEach((b) => {
              // Sent a little early, stamped with the stroke's exact time: timers under load can't skew it.
              const at = downbeat + (bar * 4 + b) * beat;
              setTimeout(
                () => {
                  for (const n of notes) midi.send(port, [0x90, n, 90], at);
                  setTimeout(
                    () => notes.forEach((n) => midi.send(port, [0x80, n, 0], at + 150)),
                    150,
                  );
                },
                at - 100 - performance.now(),
              );
            }),
          );
        },
        { port: PORTS.keys.id, strokes, chords, downbeat },
      );
      await expect(page.getByTestId("next-run")).toHaveAttribute(
        "data-kind",
        run === 1 ? "same" : "faster",
        { timeout: 20_000 },
      );
    }
    await expect(page.getByRole("button", { name: "Speed up to 84 BPM" })).toBeVisible();
    await shots(page, "rhythm-strum-ladder");
  });

  test("pulse with the tap button after the count-in", async ({ page }) => {
    await page.goto("/music/rhythm?mode=pulse&beats=4");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Go.", { timeout: 10_000 });
    await page.evaluate(() => {
      const btn = document.querySelector<HTMLButtonElement>("button.tap")!;
      const beat = 60000 / 90;
      for (let i = 0; i < 4; i++)
        setTimeout(
          () => btn.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 })),
          i * beat,
        );
    });
    await expect(page.getByRole("status")).toContainText(/beats landed/, {
      timeout: 10_000,
    });
    // Headless timers jitter against the audio clock, so allow one tap outside its window.
    await expect(page.locator("article").first()).toContainText(/Beats hit\s*[34] of 4/);
    await expect(page.getByRole("list", { name: "Every hit" })).toBeVisible();
    await shots(page, "rhythm-pulse-results");
  });

  // Swing taps land long-short, where the notes sound.
  for (const level of ["quarters-eighths", "swing"])
    test(`echo (${level}): hear a rhythm, tap it back over fake MIDI in the next bar`, async ({
      page,
    }) => {
      await installFakeMidi(page, [PORTS.keys]);
      await enableMidi(page, `/music/rhythm?mode=echo&earLevel=${level}`);
      await page.getByRole("button", { name: "Check", exact: true }).click();
      await page.getByRole("button", { name: "Start", exact: true }).click();
      await expect(page.getByRole("status")).toContainText("Listen to the pattern");
      const stage = page.locator("[data-onsets]");
      const onsets = (await stage.getAttribute("data-onsets"))!.split(",").map(Number);
      await page.evaluate(
        ([port, at, beatMs, beats]) => {
          for (const b of beats as number[])
            setTimeout(
              () => {
                (window as any).__midi.send(port, [0x90, 60, 100]);
                setTimeout(() => (window as any).__midi.send(port, [0x80, 60, 0]), 40);
              },
              (at as number) + b * (beatMs as number) - performance.now(),
            );
        },
        [
          PORTS.keys.id,
          Number(await stage.getAttribute("data-downbeat")),
          Number(await stage.getAttribute("data-beat-ms")),
          onsets,
        ] as const,
      );
      await expect(page.getByRole("status")).toContainText(
        `${onsets.length} of ${onsets.length} notes tapped`,
        { timeout: 15_000 },
      );
      await shots(page, `rhythm-echo-${level}`);
    });

  // 4/4 on eighths, and 6/8 on three eighths a dotted-quarter beat.
  for (const [level, perBeat, cells] of [
    ["rests-halves", 2, 16],
    ["compound", 3, 12],
  ] as const)
    test(`dictation (${level}): hear a rhythm, mark its notes on the grid`, async ({ page }) => {
      await page.goto(`/music/rhythm?mode=dictation&earLevel=${level}`);
      await page.getByRole("button", { name: "Start", exact: true }).click();
      await expect(page.getByRole("status")).toContainText("Mark every note", { timeout: 15_000 });
      const onsets = (await page.locator("[data-written]").getAttribute("data-written"))!
        .split(",")
        .map(Number);
      const all = page.getByRole("group", { name: "Your rhythm" }).locator("button.cell");
      await expect(all).toHaveCount(cells);
      for (const b of onsets) await all.nth(Math.round(b * perBeat)).click();
      await expect(all.and(page.locator('[aria-pressed="true"]'))).toHaveCount(onsets.length);
      await shots(page, `rhythm-dictation-writing-${level}`);
      await page.getByRole("button", { name: "Check my rhythm" }).click();
      await expect(page.getByRole("status")).toContainText(
        `All ${onsets.length} notes written right.`,
      );
      await shots(page, `rhythm-dictation-results-${level}`);
    });

  test("groove dictation: hear a drum groove, write kick, snare and hats on their rows", async ({
    page,
  }) => {
    await page.goto("/music/rhythm?mode=groove&grooveLevel=offbeats");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Mark every note", { timeout: 15_000 });
    const lanes = JSON.parse(
      (await page.locator("[data-groove]").getAttribute("data-groove"))!,
    ) as Record<string, number[]>;
    const group = page.getByRole("group", { name: "Your groove" });
    await expect(group.locator("button.cell")).toHaveCount(3 * 16);
    for (const [lane, beats] of Object.entries(lanes))
      for (const b of beats)
        await group
          .locator(`button.cell[data-row="${lane}"]`)
          .nth(b * 2)
          .click();
    await shots(page, "rhythm-groove-writing");
    await page.getByRole("button", { name: "Check my groove" }).click();
    const total = Object.values(lanes).flat().length;
    await expect(page.getByRole("status")).toContainText(`All ${total} hits written right.`);
  });

  test("a first tap a hair early, still in the count-in, counts", async ({ page }) => {
    await page.goto("/music/rhythm?mode=pulse&beats=4");
    await page.getByRole("button", { name: "Check", exact: true }).click();
    await page.getByRole("button", { name: "Start", exact: true }).click();
    const stage = page.locator("[data-downbeat][data-beat-ms]");
    await expect(stage).toHaveAttribute("data-downbeat", /\d/);
    // The count-in shows on the stage while it counts.
    await expect(page.getByText("Play on the next 1.")).toBeVisible();
    const downbeat = Number(await stage.getAttribute("data-downbeat"));
    const beatMs = Number(await stage.getAttribute("data-beat-ms"));
    // Space on each beat, the first 40 ms before the downbeat, while the count-in is still on.
    await page.evaluate(
      ({ downbeat, beatMs }) => {
        for (let i = 0; i < 4; i++)
          setTimeout(
            () =>
              document.body.dispatchEvent(
                new KeyboardEvent("keydown", { code: "Space", key: " ", bubbles: true }),
              ),
            downbeat + i * beatMs - (i === 0 ? 40 : 0) - performance.now(),
          );
      },
      { downbeat, beatMs },
    );
    await expect(page.getByRole("status")).toContainText(/beats landed/, {
      timeout: 15_000,
    });
    await expect(page.locator("article").first()).toContainText("4 of 4");
  });

  test("pulse over fake MIDI with no count-in", async ({ page }) => {
    await installFakeMidi(page, [PORTS.keys]);
    await enableMidi(page, "/music/rhythm?mode=pulse&beats=4");
    await page.getByRole("button", { name: "Check", exact: true }).click();
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Tap 4 beats");
    await page.evaluate((port) => {
      const beat = 60000 / 90;
      for (let i = 0; i < 4; i++)
        setTimeout(
          () => {
            (window as any).__midi.send(port, [0x90, 60, 100]);
            setTimeout(() => (window as any).__midi.send(port, [0x80, 60, 0]), 60);
          },
          100 + i * beat,
        );
    }, PORTS.keys.id);
    await expect(page.getByRole("status")).toContainText(/beats landed/, {
      timeout: 10_000,
    });
    await expect(page.locator("article").first()).toContainText("4 of 4");
  });
});
