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
async function seedRecent(page: Page, slug: string, set: string, right: number) {
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
      [
        `music.ear-${slug}.recent`,
        { set, results: Array.from({ length: 20 }, (_, i) => i < right) },
      ] as const,
    );
  }).toPass({ timeout: 10_000 });
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
        // A wrong answer: what was played and what you chose, each on its staff, and heard back to back.
        const captions = card.locator("figure.staff-card figcaption");
        await expect(captions).toHaveCount(2);
        await expect(captions.nth(0)).toContainText(`Played: ${names[answer]}, `);
        await expect(captions.nth(1)).toContainText(`You chose: ${pick}, `);
        await expect(
          card.getByRole("button", { name: `Hear both again: ${names[answer]}, then ${pick}` }),
        ).toBeVisible();
        await expect(card).toContainText("You answered");
        await shots(page, "ear-intervals-feedback");
      }
      await page.getByRole("button", { name: i < 9 ? "Continue" : "See results" }).click();
    }
    await expect(page.getByRole("status")).toContainText("9 of 10 right");
    await expect(page.getByText("What you mixed up")).toBeVisible();
    await expect(page.getByRole("button", { name: /Retry my confusions/ })).toBeVisible();
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
    // 18 of the last 20 already right on the First steps set.
    await seedRecent(page, "intervals", "M3,P5,P8", 18);
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
    const offer = page.getByRole("region", { name: "Ready for the next interval" });
    await expect(offer).toContainText("Ready for the perfect 4th?");
    // Results: a row per interval, this run and the overall accuracy.
    await expect(page.getByText(/^\d+ of \d+, \d+% overall$/).first()).toBeVisible();
    await offer.getByRole("button", { name: "Add the perfect 4th" }).click();
    await expect(page.getByRole("status")).toContainText("Added the perfect 4th. 4 intervals now.");
  });

  test("chords, cadences and degrees: a wrong answer is shown and played beside the right one", async ({
    page,
  }) => {
    // Chord qualities start on major and minor; a set picks more.
    await page.goto("/music/ear/chord-qualities?answer=choice");
    await page.getByRole("button", { name: "Change setup" }).click();
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
    let captions = card.locator("figure.staff-card figcaption");
    await expect(captions).toHaveCount(2);
    await expect(captions.nth(0)).toContainText(
      `Played: ${chord === "major" ? "Major: M3, m3" : "Minor: m3, M3"}`,
    );
    await expect(captions.nth(1)).toContainText(
      `You chose: ${wrongChord === "Major" ? "Major: M3, m3" : "Minor: m3, M3"}`,
    );
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
    captions = card.locator("figure.staff-card figcaption");
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
    await page.getByRole("button", { name: "Change setup" }).click();
    const sets = page.getByRole("group", { name: "Cadence sets" });
    await expect(sets.getByRole("button", { name: "Authentic and plagal" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.getByRole("button", { name: "Half", exact: true }).click();
    await expect(page.getByText("Setup:").locator("..")).toContainText("V-I IV-I I-V");
    await sets.getByRole("button", { name: "Authentic and plagal" }).click();
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(page.locator("button.choice")).toHaveCount(2);
    expect(["authentic", "plagal"]).toContain(await prompt(page).getAttribute("data-answer"));
  });

  test("scale degrees: an easy level offers the next one", async ({ page }) => {
    await seedRecent(page, "scale-degrees", "level:anchor", 18);
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
    const offer = page.getByRole("region", { name: "Ready for the next level" });
    await expect(offer).toContainText("Ready for the next level, Major pentachord?");
    await offer.getByRole("button", { name: "Move up to Major pentachord" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Moved up to Major pentachord: 1, 2, 3, 4, 5.",
    );
  });

  test("intervals: practise a few at a time, in one direction", async ({ page }) => {
    await page.goto("/music/ear/intervals?answer=choice");
    await page.getByRole("button", { name: "Change setup" }).click();
    const sets = page.getByRole("group", { name: "Interval sets" });
    await sets.getByRole("button", { name: "Perfect" }).click();
    await expect(sets.getByRole("button", { name: "Perfect" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByRole("button", { name: "Perfect unison" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // Take the octave out by its chip; at least one always stays on.
    await page.getByRole("button", { name: "Octave" }).click();
    await expect(page.getByRole("button", { name: "Octave" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await page
      .getByRole("group", { name: "Direction" })
      .getByRole("button", { name: "Down" })
      .click();
    await expect(page.getByText("Setup:").locator("..")).toContainText("P1 P4 P5, down");
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

  test("scale degrees by voice through the synthetic mic", async ({ page }) => {
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
    await expect(page.locator("article").first()).toContainText("doesn't move mastery");
    await shots(page, "ear-cadences-pocket-results");
  });

  test("repertoire transfer lifts phrases from a saved song and grades a played phrase", async ({
    page,
  }) => {
    await installFakeMidi(page, [PORTS.keys]);
    await enableMidi(page, "/music/ear/repertoire-transfer?level=full-current");
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
    await expect(page.getByRole("status")).toContainText(/groups clean/, { timeout: 8000 });
    await expect(page.getByRole("button", { name: "Faster" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Practice the notes you missed/ })).toBeVisible();
    await shots(page, "reading-sight-results");
  });
});

test.describe("rhythm", () => {
  test("both modes load with no overflow", async ({ page }) => {
    await page.goto("/music/rhythm");
    await expect(page.getByRole("heading", { level: 1, name: "Rhythm" })).toBeVisible();
    await shots(page, "rhythm-pulse-ready");
    await page.goto("/music/rhythm?mode=read-and-tap&pattern=guitar-island-strum&bpm=84");
    await expect(page.getByText("Setup:").locator("..")).toContainText("Guitar: island strum");
    await shots(page, "rhythm-strum-ready");
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
    await expect(page.getByRole("status")).toContainText(/Centered|rushed|dragged/, {
      timeout: 10_000,
    });
    // Headless timers jitter against the audio clock, so allow one tap outside its window.
    await expect(page.locator("article").first()).toContainText(/Beats hit\s*[34] of 4/);
    await expect(page.getByRole("list", { name: "Every hit" })).toBeVisible();
    await shots(page, "rhythm-pulse-results");
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
    await expect(page.getByRole("status")).toContainText(/Centered|rushed|dragged/, {
      timeout: 10_000,
    });
    await expect(page.locator("article").first()).toContainText("4 of 4");
  });
});
